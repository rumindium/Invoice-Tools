import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { CompaniesService } from '../companies/companies.service';
import { Decimal } from '../database/decimal.transformer';
import { AuditEvent, Document, DocumentRelation, TerminPlan } from '../database/entities';
import {
  DiscountType,
  DocumentStatus,
  DocumentType,
  RelationType,
  TaxMode,
} from '../database/entities/enums';
import { TemplatesService } from '../templates/templates.service';
import { terminColumns, terminMetadata, type TerminAssignment } from '../termins/termin-assignment';
import { activeInvoiceOf } from './document-links';
import { nextDocumentNumber, saveDocumentItems } from './document-support';
import { INVOICE_NUMBER_PADDING, INVOICE_NUMBER_PATTERN } from './documents.service';
import { buildReceiptInvoice, loadReceiptInvoiceSource } from './receipt-invoice';

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Turns a received goods receipt into a draft invoice in one step. The invoice bills the
 * accepted quantities at the quotation's prices, tax rates and discounts (amount discounts
 * are prorated to what was accepted), for the quotation's customer and attention person,
 * with its reference, notes and terms. The receipt → invoice link is a CONVERTED_TO relation.
 * A receipt billed in payment termins gets one invoice per termin (see TerminsService).
 */
@Injectable()
export class InvoiceConversionService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    private readonly companies: CompaniesService,
    private readonly templates: TemplatesService,
  ) {}

  async fromGoodsReceipt(
    workspaceId: string,
    userId: string,
    goodsReceiptId: string,
  ): Promise<string> {
    return this.documents.manager.transaction(async (manager) => {
      const receipt = await this.lockReceivedReceipt(manager, workspaceId, goodsReceiptId);

      const existing = await activeInvoiceOf(manager, receipt.id);
      if (existing) {
        throw new ConflictException(
          `Goods receipt ${receipt.documentNumber} already has invoice ${existing.number}.`,
        );
      }

      const plan = await manager.getRepository(TerminPlan).findOne({
        where: { sourceDocumentId: receipt.id, documentType: DocumentType.INVOICE },
      });
      if (plan) {
        throw new ConflictException(
          `Goods receipt ${receipt.documentNumber} is billed in payment termins. Generate the invoices from its termin plan.`,
        );
      }

      return this.createFromReceipt(manager, workspaceId, userId, receipt);
    });
  }

  /**
   * Row lock on the receipt: repeated clicks on "Create invoice" must not bill it twice.
   * The receipt must be received.
   */
  async lockReceivedReceipt(
    manager: EntityManager,
    workspaceId: string,
    goodsReceiptId: string,
  ): Promise<Document> {
    const receipt = await manager.getRepository(Document).findOne({
      where: {
        id: goodsReceiptId,
        workspaceId,
        documentType: DocumentType.GOODS_RECEIPT,
        deletedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!receipt) {
      throw new NotFoundException('Goods receipt not found.');
    }

    if (receipt.status !== DocumentStatus.RECEIVED) {
      throw new ConflictException(
        'Only received goods receipts can be invoiced. Post the goods receipt as received first.',
      );
    }

    return receipt;
  }

  /**
   * Writes the draft invoice of a (locked, received) receipt — all accepted quantities, or the
   * termin's share of them — with its relation and audit events. Returns the invoice id.
   */
  async createFromReceipt(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
    receipt: Document,
    termin?: TerminAssignment,
  ): Promise<string> {
    const repository = manager.getRepository(Document);
    const source = await loadReceiptInvoiceSource(manager, receipt);
    const content = buildReceiptInvoice(source, termin?.bounds);

    if (!content) {
      throw new ConflictException(
        termin
          ? `Termin ${termin.sequence} (${termin.percentage}%) is too small: every billed quantity rounds to zero.`
          : 'Nothing was accepted on this goods receipt, so there is nothing to invoice.',
      );
    }

    const { quotation } = source;
    const { items, taxMode, discountType, calculation } = content;
    const company = await this.companies.findById(receipt.companyId);

    if (!company) {
      throw new NotFoundException('The company for this goods receipt no longer exists.');
    }

    const issueDate = new Date().toISOString().slice(0, 10);
    // Generated invoices use the company's active invoice template, like new ones.
    const template = await this.templates.documentColumns(company.id, DocumentType.INVOICE);
    const number = await nextDocumentNumber(
      manager,
      company,
      issueDate,
      DocumentType.INVOICE,
      INVOICE_NUMBER_PATTERN,
      INVOICE_NUMBER_PADDING,
    );

    const invoice = await repository.save(
      repository.create({
        id: randomUUID(),
        workspaceId,
        companyId: company.id,
        customerId: receipt.customerId,
        documentType: DocumentType.INVOICE,
        status: DocumentStatus.DRAFT,
        documentNumber: number,
        sequencePeriod: issueDate.slice(0, 4),
        issueDate,
        dueDate: addDays(issueDate, company.defaultPaymentTermDays ?? 0),
        referenceNumber: quotation?.referenceNumber ?? receipt.referenceNumber,
        currencyCode: quotation?.currencyCode ?? receipt.currencyCode,
        taxMode: taxMode as TaxMode,
        discountType: discountType as DiscountType,
        discountRate:
          discountType === 'PERCENT' ? (quotation?.discountRate ?? new Decimal(0)) : null,
        discountAmount: calculation.discountTotal,
        subtotal: calculation.subtotal,
        discountTotal: calculation.discountTotal,
        taxTotal: calculation.taxTotal,
        shippingAmount: calculation.shippingAmount,
        additionalCharges: calculation.additionalCharges,
        chargesTaxRate: null,
        chargesTax: calculation.chargesTax,
        grandTotal: calculation.grandTotal,
        amountPaid: new Decimal(0),
        balanceDue: calculation.grandTotal,
        notes: quotation?.notes ?? null,
        terms: quotation?.terms ?? null,
        issuerSnapshot: {
          id: company.id,
          name: company.displayName?.trim() || company.legalName,
          address: company.addressLine1,
          email: company.email,
          phone: company.phone,
          taxId: company.taxId,
        },
        customerSnapshot: quotation?.customerSnapshot ?? receipt.customerSnapshot,
        ...template,
        calculationSnapshot: {
          subtotal: calculation.subtotal.toString(),
          discountTotal: calculation.discountTotal.toString(),
          taxTotal: calculation.taxTotal.toString(),
          grandTotal: calculation.grandTotal.toString(),
        },
        ...terminColumns(termin),
        createdById: userId,
      }),
    );

    await saveDocumentItems(
      manager,
      invoice.id,
      calculation.items,
      items.map((item) => item.catalogItemId),
    );
    await manager.getRepository(DocumentRelation).save(
      manager.getRepository(DocumentRelation).create({
        id: randomUUID(),
        sourceDocumentId: receipt.id,
        targetDocumentId: invoice.id,
        relationType: RelationType.CONVERTED_TO,
        createdById: userId,
      }),
    );

    // The source's event first: "goods receipt → invoice created", then "invoice created".
    const audit = manager.getRepository(AuditEvent);
    await audit.save([
      audit.create({
        workspaceId,
        actorId: userId,
        action: 'goods_receipt.invoice_created',
        targetType: 'goods_receipt',
        targetId: receipt.id,
        metadata: {
          number: receipt.documentNumber,
          invoiceNumber: number,
          ...terminMetadata(termin),
        },
        ip: null,
      }),
      audit.create({
        workspaceId,
        actorId: userId,
        action: 'invoice.created',
        targetType: 'invoice',
        targetId: invoice.id,
        metadata: {
          from: null,
          to: DocumentStatus.DRAFT,
          reason: null,
          number,
          total: Number(calculation.grandTotal),
          goodsReceiptNumber: receipt.documentNumber,
          quotationNumber: quotation?.documentNumber ?? null,
          ...terminMetadata(termin),
        },
        ip: null,
      }),
    ]);

    return invoice.id;
  }
}
