import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import { CompaniesService } from '../companies/companies.service';
import { Decimal } from '../database/decimal.transformer';
import {
  AuditEvent,
  Company,
  Customer,
  Document,
  DocumentItem,
  DocumentNumberSequence,
} from '../database/entities';
import {
  DiscountType,
  DocumentStatus,
  DocumentType,
  SequenceReset,
  TaxMode,
} from '../database/entities/enums';
import { calculateDocument } from './calculation';
import { ChangeStatusDto, InvoicePayloadDto, ListDocumentsQueryDto } from './dto/invoice.dto';
import { renderInvoicePdf } from './pdf/invoice-pdf';
import {
  DocumentWithCustomer,
  DocumentWithDetails,
  InvoiceHistoryEntry,
  InvoiceListRow,
  InvoiceSummary,
  InvoiceView,
  toInvoiceListRow,
  toInvoiceView,
} from './views';

const DEFAULT_NUMBER_PATTERN = 'INV/{YYYY}/{seq}';
const DEFAULT_PADDING = 4;

const ALLOWED_TRANSITIONS: Record<string, Array<'ISSUED' | 'PAID' | 'VOID'>> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  OVERDUE: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
};

function toDateOnly(value: string): string {
  return value.slice(0, 10);
}

@Injectable()
export class DocumentsService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(DocumentItem) private readonly items: Repository<DocumentItem>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(DocumentNumberSequence)
    private readonly sequences: Repository<DocumentNumberSequence>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
    private readonly companies: CompaniesService,
  ) {}

  async list(
    workspaceId: string,
    query: ListDocumentsQueryDto,
  ): Promise<{ items: InvoiceListRow[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const today = toDateOnly(new Date().toISOString());

    const builder = this.documents
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.customer', 'customer')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere('document.documentType = :documentType', { documentType: DocumentType.INVOICE })
      .andWhere('document.deletedAt IS NULL');

    if (query.status === 'OVERDUE') {
      builder.andWhere('document.status IN (:...overdueStatuses)', {
        overdueStatuses: [DocumentStatus.ISSUED, DocumentStatus.PARTIALLY_PAID],
      });
      builder.andWhere('document.dueDate < :today', { today });
    } else if (query.status && query.status !== 'ALL') {
      builder.andWhere('document.status = :status', { status: query.status });
    }

    if (search) {
      builder.andWhere(
        new Brackets((sub) => {
          sub
            .where('document.documentNumber ILIKE :search', { search: `%${search}%` })
            .orWhere('customer.name ILIKE :search', { search: `%${search}%` });
        }),
      );
    }

    builder
      .orderBy('document.issueDate', 'DESC')
      .addOrderBy('document.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [documents, total] = await builder.getManyAndCount();

    return {
      items: (documents as DocumentWithCustomer[]).map(toInvoiceListRow),
      total,
      page,
      pageSize,
    };
  }

  async summary(workspaceId: string): Promise<InvoiceSummary> {
    const documents = await this.documents.find({
      where: {
        workspaceId,
        documentType: DocumentType.INVOICE,
        deletedAt: IsNull(),
      },
      select: { id: true, status: true, grandTotal: true, balanceDue: true, issueDate: true },
    });

    const monthPrefix = new Date().toISOString().slice(0, 7);

    let outstandingCount = 0;
    let outstandingTotal = new Decimal(0);
    let paidCount = 0;
    let paidTotal = new Decimal(0);
    let draftCount = 0;
    let overdueCount = 0;
    let totalThisMonth = 0;

    for (const document of documents) {
      if (document.issueDate.slice(0, 7) === monthPrefix) {
        totalThisMonth += 1;
      }

      switch (document.status) {
        case DocumentStatus.DRAFT:
          draftCount += 1;
          break;
        case DocumentStatus.PAID:
          paidCount += 1;
          paidTotal = paidTotal.plus(document.grandTotal);
          break;
        case DocumentStatus.VOID:
          break;
        default:
          outstandingCount += 1;
          outstandingTotal = outstandingTotal.plus(document.balanceDue);
          break;
      }

      if (
        (document.status === DocumentStatus.ISSUED ||
          document.status === DocumentStatus.PARTIALLY_PAID) &&
        document.balanceDue.gt(0)
      ) {
        overdueCount += 1;
      }
    }

    return {
      totalInvoices: documents.length,
      totalThisMonth,
      outstandingCount,
      outstandingTotal: Number(outstandingTotal),
      paidCount,
      paidTotal: Number(paidTotal),
      draftCount,
      overdueCount,
    };
  }

  async get(workspaceId: string, documentId: string): Promise<InvoiceView> {
    const { document, company } = await this.load(workspaceId, documentId);
    const history = await this.history(documentId);
    const nextStatuses = ALLOWED_TRANSITIONS[document.status] ?? [];

    return toInvoiceView(document, company, history, nextStatuses);
  }

  async create(
    workspaceId: string,
    userId: string,
    payload: InvoicePayloadDto,
  ): Promise<InvoiceView> {
    const company = await this.companies.resolveCompany(workspaceId, payload.companyId);
    const issueDate = toDateOnly(payload.issueDate);
    const dueDate = payload.dueDate ? toDateOnly(payload.dueDate) : null;
    const calculation = calculateDocument({
      items: payload.items,
      taxMode: payload.taxMode ?? company.defaultTaxMode,
      discountType: payload.discountType ?? 'NONE',
      discountRate: payload.discountRate,
      discountAmount: payload.discountAmount,
      shippingAmount: payload.shippingAmount,
      additionalCharges: payload.additionalCharges,
      chargesTaxRate: payload.chargesTaxRate,
    });

    const customerSnapshot = {
      id: null,
      name: payload.customer.name.trim(),
      email: payload.customer.email?.trim().toLowerCase() ?? null,
      address: payload.customer.address?.trim() ?? null,
      phone: payload.customer.phone?.trim() ?? null,
    };

    const issuerSnapshot = {
      id: company.id,
      name: company.displayName?.trim() || company.legalName,
      address: company.addressLine1,
      email: company.email,
      phone: company.phone,
      taxId: company.taxId,
    };

    const documentId = await this.documents.manager.transaction(async (manager) => {
      const customer = await this.resolveCustomer(manager, workspaceId, customerSnapshot);
      const documentNumber = await this.nextDocumentNumber(manager, company, issueDate);

      const created = await manager.getRepository(Document).save(
        manager.getRepository(Document).create({
          id: randomUUID(),
          workspaceId,
          companyId: company.id,
          customerId: customer.id,
          documentType: DocumentType.INVOICE,
          status: DocumentStatus.DRAFT,
          documentNumber,
          sequencePeriod: issueDate.slice(0, 4),
          issueDate,
          dueDate,
          referenceNumber: payload.referenceNumber?.trim() || null,
          currencyCode: company.defaultCurrency,
          taxMode: (payload.taxMode ?? company.defaultTaxMode) as TaxMode,
          discountType: (payload.discountType ?? DiscountType.NONE) as DiscountType,
          discountRate:
            payload.discountType === 'PERCENT' ? new Decimal(payload.discountRate ?? 0) : null,
          discountAmount: calculation.discountTotal,
          subtotal: calculation.subtotal,
          discountTotal: calculation.discountTotal,
          taxTotal: calculation.taxTotal,
          shippingAmount: calculation.shippingAmount,
          additionalCharges: calculation.additionalCharges,
          chargesTaxRate:
            payload.chargesTaxRate === undefined ? null : new Decimal(payload.chargesTaxRate),
          chargesTax: calculation.chargesTax,
          grandTotal: calculation.grandTotal,
          amountPaid: new Decimal(0),
          balanceDue: calculation.grandTotal,
          notes: payload.notes?.trim() || null,
          terms: payload.terms?.trim() || null,
          issuerSnapshot,
          customerSnapshot,
          calculationSnapshot: {
            subtotal: calculation.subtotal.toString(),
            discountTotal: calculation.discountTotal.toString(),
            taxTotal: calculation.taxTotal.toString(),
            grandTotal: calculation.grandTotal.toString(),
          },
          createdById: userId,
        }),
      );

      await this.saveItems(manager, created.id, calculation.items);
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          workspaceId,
          actorId: userId,
          action: 'invoice.created',
          targetType: 'invoice',
          targetId: created.id,
          metadata: { from: null, to: DocumentStatus.DRAFT, reason: null },
          ip: null,
        }),
      );

      return created.id;
    });

    return this.get(workspaceId, documentId);
  }

  async update(
    workspaceId: string,
    documentId: string,
    payload: InvoicePayloadDto,
  ): Promise<InvoiceView> {
    const { document } = await this.load(workspaceId, documentId);

    if (document.status !== DocumentStatus.DRAFT) {
      throw new ConflictException('Only draft invoices can be edited.');
    }

    const issueDate = toDateOnly(payload.issueDate);
    const dueDate = payload.dueDate ? toDateOnly(payload.dueDate) : null;
    const calculation = calculateDocument({
      items: payload.items,
      taxMode: payload.taxMode ?? document.taxMode,
      discountType: payload.discountType ?? 'NONE',
      discountRate: payload.discountRate,
      discountAmount: payload.discountAmount,
      shippingAmount: payload.shippingAmount,
      additionalCharges: payload.additionalCharges,
      chargesTaxRate: payload.chargesTaxRate,
    });

    const customerSnapshot = {
      id: document.customerId,
      name: payload.customer.name.trim(),
      email: payload.customer.email?.trim().toLowerCase() ?? null,
      address: payload.customer.address?.trim() ?? null,
      phone: payload.customer.phone?.trim() ?? null,
    };

    await this.documents.manager.transaction(async (manager) => {
      const customer = await this.resolveCustomer(manager, workspaceId, customerSnapshot);

      await manager.getRepository(DocumentItem).delete({ documentId });

      Object.assign(document, {
        customerId: customer.id,
        issueDate,
        dueDate,
        referenceNumber: payload.referenceNumber?.trim() || null,
        taxMode: (payload.taxMode ?? document.taxMode) as TaxMode,
        discountType: (payload.discountType ?? DiscountType.NONE) as DiscountType,
        discountRate:
          payload.discountType === 'PERCENT' ? new Decimal(payload.discountRate ?? 0) : null,
        discountAmount: calculation.discountTotal,
        subtotal: calculation.subtotal,
        discountTotal: calculation.discountTotal,
        taxTotal: calculation.taxTotal,
        shippingAmount: calculation.shippingAmount,
        additionalCharges: calculation.additionalCharges,
        chargesTaxRate:
          payload.chargesTaxRate === undefined ? null : new Decimal(payload.chargesTaxRate),
        chargesTax: calculation.chargesTax,
        grandTotal: calculation.grandTotal,
        balanceDue: calculation.grandTotal,
        notes: payload.notes?.trim() || null,
        terms: payload.terms?.trim() || null,
        customerSnapshot,
        calculationSnapshot: {
          subtotal: calculation.subtotal.toString(),
          discountTotal: calculation.discountTotal.toString(),
          taxTotal: calculation.taxTotal.toString(),
          grandTotal: calculation.grandTotal.toString(),
        },
        version: document.version + 1,
      });

      await manager.getRepository(Document).save(document);

      await this.saveItems(manager, documentId, calculation.items);
    });

    return this.get(workspaceId, documentId);
  }

  async changeStatus(
    workspaceId: string,
    userId: string,
    documentId: string,
    dto: ChangeStatusDto,
  ): Promise<InvoiceView> {
    const { document } = await this.load(workspaceId, documentId);
    const allowed = ALLOWED_TRANSITIONS[document.status] ?? [];

    if (!allowed.includes(dto.status)) {
      throw new ConflictException(
        `A ${document.status.toLowerCase()} invoice cannot be changed to ${dto.status.toLowerCase()}.`,
      );
    }

    if (dto.status === 'VOID' && !dto.reason?.trim()) {
      throw new ConflictException('A reason is required to void an invoice.');
    }

    const patch: Partial<Document> = {
      status: dto.status as DocumentStatus,
      version: document.version + 1,
    };

    if (dto.status === 'ISSUED') {
      patch.issuedAt = new Date();
      patch.balanceDue = document.grandTotal.minus(document.amountPaid);
    }

    if (dto.status === 'PAID') {
      patch.amountPaid = document.grandTotal;
      patch.balanceDue = new Decimal(0);
    }

    if (dto.status === 'VOID') {
      patch.voidedAt = new Date();
      patch.voidReason = dto.reason?.trim() ?? null;
      patch.balanceDue = new Decimal(0);
    }

    const previousStatus = document.status;

    Object.assign(document, patch);
    await this.documents.save(document);

    await this.audit.save(
      this.audit.create({
        workspaceId,
        actorId: userId,
        action: 'invoice.status_changed',
        targetType: 'invoice',
        targetId: documentId,
        metadata: {
          from: previousStatus,
          to: dto.status,
          reason: dto.reason?.trim() || null,
        },
        ip: null,
      }),
    );

    return this.get(workspaceId, documentId);
  }

  async remove(workspaceId: string, documentId: string): Promise<void> {
    const { document } = await this.load(workspaceId, documentId);

    if (document.status !== DocumentStatus.DRAFT && document.status !== DocumentStatus.VOID) {
      throw new ConflictException('Only draft or void invoices can be deleted.');
    }

    document.deletedAt = new Date();
    await this.documents.save(document);
  }

  async pdf(
    workspaceId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { document, company } = await this.load(workspaceId, documentId);
    const invoice = toInvoiceView(document, company);
    const buffer = await renderInvoicePdf(invoice);
    const filename = `${(invoice.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

    return { buffer, filename };
  }

  private async history(documentId: string): Promise<InvoiceHistoryEntry[]> {
    const events = await this.audit.find({
      where: { targetType: 'invoice', targetId: documentId },
      relations: { actor: true },
      order: { createdAt: 'ASC', id: 'ASC' },
    });

    return events.map((event) => {
      const metadata = (event.metadata ?? {}) as {
        from?: string | null;
        to?: string | null;
        reason?: string | null;
      };

      return {
        id: String(event.id),
        action: event.action,
        fromStatus: metadata.from ?? null,
        toStatus: metadata.to ?? null,
        reason: metadata.reason ?? null,
        actorName: event.actor?.displayName ?? null,
        at: event.createdAt.toISOString(),
      };
    });
  }

  private async load(
    workspaceId: string,
    documentId: string,
  ): Promise<{ document: DocumentWithDetails; company: Company }> {
    const document = await this.documents.findOne({
      where: {
        id: documentId,
        workspaceId,
        documentType: DocumentType.INVOICE,
        deletedAt: IsNull(),
      },
      relations: { items: true, customer: true },
    });

    if (!document) {
      throw new NotFoundException('Invoice not found.');
    }

    const company = await this.companies.findById(document.companyId);

    if (!company) {
      throw new NotFoundException('The company for this invoice no longer exists.');
    }

    return { document: document as DocumentWithDetails, company };
  }

  private async saveItems(
    manager: EntityManager,
    documentId: string,
    items: ReturnType<typeof calculateDocument>['items'],
  ): Promise<void> {
    const repository = manager.getRepository(DocumentItem);

    await repository.save(
      items.map((item) =>
        repository.create({
          id: randomUUID(),
          documentId,
          position: item.position,
          itemName: item.name,
          description: item.description,
          unit: item.unit,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          discountType: item.discountType as DiscountType,
          discountRate: item.discountRate,
          discountAmount: item.discountAmount,
          taxRate: item.taxRate,
          taxAmount: item.taxAmount,
          lineSubtotal: item.lineSubtotal,
          lineTotal: item.lineTotal,
        }),
      ),
    );
  }

  private async resolveCustomer(
    manager: EntityManager,
    workspaceId: string,
    snapshot: {
      id: string | null;
      name: string;
      email: string | null;
      address: string | null;
      phone: string | null;
    },
  ): Promise<Customer> {
    const repository = manager.getRepository(Customer);
    const existing = await repository.findOne({
      where: { workspaceId, name: snapshot.name, archivedAt: IsNull() },
    });

    if (existing) {
      if (snapshot.email) {
        existing.email = snapshot.email;
      }

      if (snapshot.phone) {
        existing.phone = snapshot.phone;
      }

      if (snapshot.address) {
        existing.billingAddress = { line1: snapshot.address };
      }

      return repository.save(existing);
    }

    return repository.save(
      repository.create({
        id: randomUUID(),
        workspaceId,
        name: snapshot.name,
        email: snapshot.email,
        phone: snapshot.phone,
        billingAddress: snapshot.address ? { line1: snapshot.address } : null,
      }),
    );
  }

  private async nextDocumentNumber(
    manager: EntityManager,
    company: Company,
    issueDate: string,
  ): Promise<string> {
    const repository = manager.getRepository(DocumentNumberSequence);
    const year = issueDate.slice(0, 4);
    const month = issueDate.slice(5, 7);
    const existing = await repository.findOne({
      where: { companyId: company.id, documentType: DocumentType.INVOICE },
      lock: { mode: 'pessimistic_write' },
    });

    const resetPolicy = existing?.resetPolicy ?? SequenceReset.YEARLY;
    const periodKey =
      resetPolicy === SequenceReset.MONTHLY
        ? `${year}-${month}`
        : resetPolicy === SequenceReset.NEVER
          ? 'ALL'
          : year;
    const nextValue = existing && existing.periodKey === periodKey ? existing.nextValue : 1;
    const pattern = existing?.pattern ?? DEFAULT_NUMBER_PATTERN;
    const padding = existing?.padding ?? DEFAULT_PADDING;
    const sequence = String(nextValue).padStart(padding, '0');

    const documentNumber = pattern
      .replace('{YYYY}', year)
      .replace('{YY}', year.slice(2))
      .replace('{MM}', month)
      .replace('{seq}', sequence)
      .replace('{SEQ}', sequence);

    if (existing) {
      await repository.update(
        { id: existing.id },
        { periodKey, nextValue: nextValue + 1, lastIssuedAt: new Date() },
      );
    } else {
      await repository.save(
        repository.create({
          id: randomUUID(),
          companyId: company.id,
          documentType: DocumentType.INVOICE,
          pattern,
          resetPolicy,
          padding,
          periodKey,
          nextValue: nextValue + 1,
          lastIssuedAt: new Date(),
        }),
      );
    }

    return documentNumber;
  }
}
