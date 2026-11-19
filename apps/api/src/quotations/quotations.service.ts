import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { Decimal } from '../database/decimal.transformer';
import { AuditEvent, Company, Document, DocumentItem } from '../database/entities';
import { DiscountType, DocumentStatus, DocumentType, TaxMode } from '../database/entities/enums';
import { calculateDocument } from '../documents/calculation';
import {
  documentHistory,
  nextDocumentNumber,
  resolveCatalogItemIds,
  resolveDocumentCustomer,
  saveDocumentItems,
  toDateOnly,
} from '../documents/document-support';
import type { DocumentWithCustomer, DocumentWithDetails } from '../documents/views';
import {
  ListQuotationsQueryDto,
  QuotationPayloadDto,
  QuotationRevisionDto,
  QuotationStatusDto,
} from './dto/quotation.dto';
import { activeInvoiceOf } from '../documents/document-links';
import { activeGoodsReceipt } from '../goods-receipts/goods-receipt-links';
import { planOfSource, planViewOfSource } from '../termins/termin-views';
import {
  archiveCurrentVersion,
  listRevisions,
  loadRevision,
  requireReason,
  type RevisionState,
} from '../documents/revisions';
import { renderQuotationPdf } from './quotation-pdf';
import { templateOfStoredView } from '../templates/template-snapshot';
import { TemplatesService } from '../templates/templates.service';
import {
  canTransition,
  isDeletable,
  isEditable,
  isExpired,
  isRevisable,
  nextQuotationStatuses,
  todayIso,
} from './quotation-status';
import {
  QuotationListRow,
  QuotationSummary,
  QuotationView,
  toQuotationListRow,
  toQuotationView,
} from './views';

export const QUOTATION_NUMBER_PATTERN = 'QUO/{YYYY}/{seq}';
const AUDIT_TARGET = 'quotation';
const DEFAULT_VALIDITY_DAYS = 30;

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

@Injectable()
export class QuotationsService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
    private readonly auditLog: AuditService,
    private readonly companies: CompaniesService,
    private readonly templates: TemplatesService,
  ) {}

  async list(
    workspaceId: string,
    query: ListQuotationsQueryDto,
  ): Promise<{ items: QuotationListRow[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();
    const today = todayIso();

    const builder = this.documents
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.customer', 'customer')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere('document.documentType = :documentType', {
        documentType: DocumentType.QUOTATION,
      })
      .andWhere('document.deletedAt IS NULL');

    if (query.status === 'EXPIRED') {
      builder.andWhere('document.status = :sent', { sent: DocumentStatus.SENT });
      builder.andWhere('document.validUntil < :today', { today });
    } else if (query.status && query.status !== 'ALL') {
      builder.andWhere('document.status = :status', { status: query.status });
    }

    if (search) {
      builder.andWhere(
        new Brackets((sub) => {
          sub
            .where('document.documentNumber ILIKE :search', { search: `%${search}%` })
            .orWhere('customer.name ILIKE :search', { search: `%${search}%` })
            .orWhere("document.customerSnapshot ->> 'name' ILIKE :search", {
              search: `%${search}%`,
            });
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
      items: (documents as DocumentWithCustomer[]).map(toQuotationListRow),
      total,
      page,
      pageSize,
    };
  }

  async summary(workspaceId: string): Promise<QuotationSummary> {
    const documents = await this.documents.find({
      where: { workspaceId, documentType: DocumentType.QUOTATION, deletedAt: IsNull() },
      select: { id: true, status: true, grandTotal: true, issueDate: true, validUntil: true },
    });

    const monthPrefix = todayIso().slice(0, 7);
    const summary: QuotationSummary = {
      totalQuotations: documents.length,
      totalThisMonth: 0,
      draftCount: 0,
      sentCount: 0,
      openTotal: 0,
      acceptedCount: 0,
      acceptedTotal: 0,
      rejectedCount: 0,
      expiredCount: 0,
    };
    let openTotal = new Decimal(0);
    let acceptedTotal = new Decimal(0);

    for (const document of documents) {
      if (document.issueDate.slice(0, 7) === monthPrefix) {
        summary.totalThisMonth += 1;
      }

      if (isExpired(document.status, document.validUntil)) {
        summary.expiredCount += 1;
        continue;
      }

      switch (document.status) {
        case DocumentStatus.DRAFT:
          summary.draftCount += 1;
          break;
        case DocumentStatus.SENT:
          summary.sentCount += 1;
          openTotal = openTotal.plus(document.grandTotal);
          break;
        case DocumentStatus.ACCEPTED:
          summary.acceptedCount += 1;
          acceptedTotal = acceptedTotal.plus(document.grandTotal);
          break;
        case DocumentStatus.REJECTED:
          summary.rejectedCount += 1;
          break;
      }
    }

    summary.openTotal = Number(openTotal);
    summary.acceptedTotal = Number(acceptedTotal);
    return summary;
  }

  async get(workspaceId: string, quotationId: string): Promise<QuotationView> {
    const { document, company } = await this.load(workspaceId, quotationId);
    const [history, terminPlan] = await Promise.all([
      documentHistory(this.audit, AUDIT_TARGET, quotationId),
      planViewOfSource(this.documents.manager, quotationId, DocumentType.GOODS_RECEIPT),
    ]);
    // A quotation received in termins shows its plan instead of a single goods receipt.
    const goodsReceipt = terminPlan
      ? null
      : await activeGoodsReceipt(this.documents.manager, quotationId);

    const [invoice, revisionState, template] = await Promise.all([
      goodsReceipt ? activeInvoiceOf(this.documents.manager, goodsReceipt.id) : null,
      this.revisionState(document),
      this.templates.templateOf(document),
    ]);

    return toQuotationView(
      document,
      company,
      history,
      nextQuotationStatuses(document.status),
      goodsReceipt,
      invoice,
      revisionState,
      template,
      terminPlan,
    );
  }

  async create(
    workspaceId: string,
    userId: string,
    payload: QuotationPayloadDto,
  ): Promise<QuotationView> {
    const company = await this.companies.resolveCompany(workspaceId, payload.companyId);
    const dates = this.dates(payload);
    const taxMode = (payload.taxMode ?? company.defaultTaxMode) as TaxMode;
    const calculation = this.calculate(payload, taxMode);
    // New quotations are generated with the company's active template.
    const template = await this.templates.documentColumns(company.id, DocumentType.QUOTATION);

    const quotationId = await this.documents.manager.transaction(async (manager) => {
      const { customer, snapshot } = await resolveDocumentCustomer(
        manager,
        workspaceId,
        payload.recipient,
        { name: payload.recipient.attentionName, jobTitle: payload.recipient.attentionTitle },
      );
      const catalogItemIds = await resolveCatalogItemIds(manager, workspaceId, payload.items);
      const documentNumber = await nextDocumentNumber(
        manager,
        company,
        dates.issueDate,
        DocumentType.QUOTATION,
        QUOTATION_NUMBER_PATTERN,
      );
      const repository = manager.getRepository(Document);

      const created = await repository.save(
        repository.create({
          id: randomUUID(),
          workspaceId,
          companyId: company.id,
          customerId: customer.id,
          documentType: DocumentType.QUOTATION,
          status: DocumentStatus.DRAFT,
          documentNumber,
          sequencePeriod: dates.issueDate.slice(0, 4),
          issueDate: dates.issueDate,
          validUntil: dates.validUntil,
          dueDate: null,
          referenceNumber: payload.referenceNumber?.trim() || null,
          currencyCode: company.defaultCurrency,
          taxMode,
          ...this.amounts(payload, calculation),
          amountPaid: new Decimal(0),
          balanceDue: new Decimal(0),
          notes: payload.notes?.trim() || null,
          terms: payload.terms?.trim() || null,
          ...this.signature(payload, company),
          issuerSnapshot: {
            id: company.id,
            name: company.displayName?.trim() || company.legalName,
            address: company.addressLine1,
            email: company.email,
            phone: company.phone,
            taxId: company.taxId,
          },
          customerSnapshot: snapshot,
          ...template,
          createdById: userId,
        }),
      );

      await saveDocumentItems(manager, created.id, calculation.items, catalogItemIds);
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          workspaceId,
          actorId: userId,
          action: 'quotation.created',
          targetType: AUDIT_TARGET,
          targetId: created.id,
          metadata: {
            from: null,
            to: DocumentStatus.DRAFT,
            reason: null,
            number: created.documentNumber,
            total: Number(calculation.grandTotal),
          },
          ip: null,
        }),
      );

      return created.id;
    });

    return this.get(workspaceId, quotationId);
  }

  async update(
    workspaceId: string,
    userId: string,
    quotationId: string,
    payload: QuotationPayloadDto,
  ): Promise<QuotationView> {
    const { document, company } = await this.load(workspaceId, quotationId);

    if (!isEditable(document.status)) {
      throw new ConflictException(
        'Only draft quotations can be edited. Revise a sent or accepted quotation instead.',
      );
    }

    await this.applyChanges(workspaceId, userId, document, company, payload);
    return this.get(workspaceId, quotationId);
  }

  /**
   * Corrects a sent or accepted quotation: archives the current version, applies the new
   * content and bumps the version. The status stays as it is.
   */
  async revise(
    workspaceId: string,
    userId: string,
    quotationId: string,
    dto: QuotationRevisionDto,
  ): Promise<QuotationView> {
    const { document, company } = await this.load(workspaceId, quotationId);
    const reason = requireReason(dto.reason);
    const state = await this.revisionState(document);

    if (!state.canRevise) {
      throw new ConflictException(
        state.revisionBlockedBy ??
          (document.status === DocumentStatus.DRAFT
            ? 'Drafts are edited directly; revisions are for sent or accepted quotations.'
            : `A ${document.status.toLowerCase()} quotation cannot be revised.`),
      );
    }

    const current = await this.get(workspaceId, quotationId);
    const { reason: _reason, ...payload } = dto;
    void _reason;
    await this.applyChanges(workspaceId, userId, document, company, payload, {
      reason,
      view: current,
    });

    return this.get(workspaceId, quotationId);
  }

  /** An archived older version, shaped like the current view. */
  async getRevision(
    workspaceId: string,
    quotationId: string,
    revision: number,
  ): Promise<QuotationView> {
    const { document, company } = await this.load(workspaceId, quotationId);
    const { snapshot, superseded } = await loadRevision(this.documents.manager, document, revision);
    const view = snapshot as unknown as QuotationView;

    return {
      ...view,
      company: { ...view.company, logoDataUrl: company.logoDataUrl },
      template: templateOfStoredView(view.template),
      history: [],
      nextStatuses: [],
      goodsReceipt: null,
      canCreateGoodsReceipt: false,
      terminPlan: null,
      invoice: null,
      revisions: [],
      canRevise: false,
      revisionBlockedBy: null,
      supersededRevision: superseded,
    };
  }

  async revisionPdf(
    workspaceId: string,
    quotationId: string,
    revision: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const view = await this.getRevision(workspaceId, quotationId, revision);
    const buffer = await renderQuotationPdf(view);
    const filename = `${(view.number ?? 'quotation').replace(/[^A-Za-z0-9._-]+/g, '-')}-v${revision}.pdf`;
    return { buffer, filename };
  }

  private async revisionState(document: Document): Promise<RevisionState> {
    const manager = this.documents.manager;
    const revisions = await listRevisions(manager, document.id);

    if (!isRevisable(document.status)) {
      return { revisions, canRevise: false, revisionBlockedBy: null };
    }

    if (await planOfSource(manager, document.id, DocumentType.GOODS_RECEIPT)) {
      return {
        revisions,
        canRevise: false,
        revisionBlockedBy:
          'This quotation is received in payment termins. Delete its termin plan before revising the quotation.',
      };
    }

    const receipt = await activeGoodsReceipt(manager, document.id);
    return {
      revisions,
      canRevise: receipt === null,
      revisionBlockedBy: receipt
        ? `Goods receipt ${receipt.number} was created from this quotation. Cancel or delete it before revising the quotation.`
        : null,
    };
  }

  /** Writes new content; with `revision`, archives the current version first. */
  private async applyChanges(
    workspaceId: string,
    userId: string,
    document: DocumentWithDetails,
    company: Company,
    payload: QuotationPayloadDto,
    revision?: { reason: string; view: QuotationView },
  ): Promise<void> {
    const quotationId = document.id;
    const dates = this.dates(payload);
    const taxMode = (payload.taxMode ?? document.taxMode) as TaxMode;
    const calculation = this.calculate(payload, taxMode);
    // Drafts pick up the active template on every save; revisions keep their design.
    const template =
      document.status === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(company.id, DocumentType.QUOTATION)
        : {};

    await this.documents.manager.transaction(async (manager) => {
      const nextRevision = revision
        ? await archiveCurrentVersion(manager, document, revision.view, revision.reason, userId)
        : document.revision;
      const { customer, snapshot } = await resolveDocumentCustomer(
        manager,
        workspaceId,
        payload.recipient,
        { name: payload.recipient.attentionName, jobTitle: payload.recipient.attentionTitle },
      );
      const catalogItemIds = await resolveCatalogItemIds(manager, workspaceId, payload.items);

      await manager.getRepository(DocumentItem).delete({ documentId: quotationId });

      Object.assign(document, {
        customerId: customer.id,
        issueDate: dates.issueDate,
        validUntil: dates.validUntil,
        referenceNumber: payload.referenceNumber?.trim() || null,
        taxMode,
        ...this.amounts(payload, calculation),
        notes: payload.notes?.trim() || null,
        terms: payload.terms?.trim() || null,
        ...this.signature(payload, company),
        customerSnapshot: snapshot,
        ...template,
        version: document.version + 1,
        revision: nextRevision,
      });

      await manager.getRepository(Document).save(document);
      await saveDocumentItems(manager, quotationId, calculation.items, catalogItemIds);
      // Written with the change, so the returned history already lists it.
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          workspaceId,
          actorId: userId,
          action: revision ? 'quotation.revised' : 'quotation.updated',
          targetType: AUDIT_TARGET,
          targetId: quotationId,
          metadata: {
            number: document.documentNumber,
            total: Number(calculation.grandTotal),
            items: calculation.items.length,
            ...(revision ? { revision: nextRevision, reason: revision.reason } : {}),
          },
          ip: null,
        }),
      );
    });
  }

  async changeStatus(
    workspaceId: string,
    userId: string,
    quotationId: string,
    dto: QuotationStatusDto,
  ): Promise<QuotationView> {
    const { document } = await this.load(workspaceId, quotationId);

    if (!canTransition(document.status, dto.status)) {
      throw new ConflictException(
        `A ${document.status.toLowerCase()} quotation cannot be changed to ${dto.status.toLowerCase()}.`,
      );
    }

    const previousStatus = document.status;
    // Leaving draft freezes the design: later template changes do not restyle it.
    const frozenTemplate =
      previousStatus === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(document.companyId, DocumentType.QUOTATION)
        : {};

    await this.documents.update(
      { id: quotationId },
      {
        status: dto.status as DocumentStatus,
        version: document.version + 1,
        ...(dto.status === 'SENT' ? { issuedAt: new Date() } : {}),
        ...frozenTemplate,
      },
    );
    await this.audit.save(
      this.audit.create({
        workspaceId,
        actorId: userId,
        action: 'quotation.status_changed',
        targetType: AUDIT_TARGET,
        targetId: quotationId,
        metadata: {
          from: previousStatus,
          to: dto.status,
          reason: dto.reason?.trim() || null,
          number: document.documentNumber,
        },
        ip: null,
      }),
    );

    return this.get(workspaceId, quotationId);
  }

  async remove(workspaceId: string, userId: string, quotationId: string): Promise<void> {
    const { document } = await this.load(workspaceId, quotationId);

    if (!isDeletable(document.status)) {
      throw new ConflictException('Only draft or rejected quotations can be deleted.');
    }

    await this.documents.update({ id: quotationId }, { deletedAt: new Date() });

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'quotation.deleted',
      targetType: AUDIT_TARGET,
      targetId: quotationId,
      metadata: {
        number: document.documentNumber,
        status: document.status,
        total: Number(document.grandTotal),
      },
    });
  }

  async pdf(
    workspaceId: string,
    quotationId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { document, company } = await this.load(workspaceId, quotationId);
    const quotation = toQuotationView(
      document,
      company,
      [],
      [],
      null,
      null,
      undefined,
      await this.templates.templateOf(document),
    );
    const buffer = await renderQuotationPdf(quotation);
    const filename = `${(quotation.number ?? 'quotation').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

    return { buffer, filename };
  }

  private dates(payload: QuotationPayloadDto): { issueDate: string; validUntil: string } {
    const issueDate = toDateOnly(payload.issueDate);
    const validUntil = payload.validUntil
      ? toDateOnly(payload.validUntil)
      : addDays(issueDate, DEFAULT_VALIDITY_DAYS);

    if (validUntil < issueDate) {
      throw new BadRequestException('Valid until cannot be earlier than the quotation date.');
    }

    return { issueDate, validUntil };
  }

  private calculate(payload: QuotationPayloadDto, taxMode: TaxMode) {
    return calculateDocument({
      items: payload.items,
      taxMode,
      discountType: payload.discountType ?? 'NONE',
      discountRate: payload.discountRate,
      discountAmount: payload.discountAmount,
    });
  }

  private amounts(payload: QuotationPayloadDto, calculation: ReturnType<typeof calculateDocument>) {
    return {
      discountType: (payload.discountType ?? DiscountType.NONE) as DiscountType,
      discountRate:
        payload.discountType === 'PERCENT' ? new Decimal(payload.discountRate ?? 0) : null,
      discountAmount: calculation.discountTotal,
      subtotal: calculation.subtotal,
      discountTotal: calculation.discountTotal,
      taxTotal: calculation.taxTotal,
      shippingAmount: calculation.shippingAmount,
      additionalCharges: calculation.additionalCharges,
      chargesTaxRate: null,
      chargesTax: calculation.chargesTax,
      grandTotal: calculation.grandTotal,
      calculationSnapshot: {
        subtotal: calculation.subtotal.toString(),
        discountTotal: calculation.discountTotal.toString(),
        taxTotal: calculation.taxTotal.toString(),
        grandTotal: calculation.grandTotal.toString(),
      },
    };
  }

  /** The signer defaults to the company's signatory when the form leaves it empty. */
  private signature(payload: QuotationPayloadDto, company: Company) {
    return {
      signatureName: payload.signature?.name?.trim() || company.signatoryName || null,
      signatureTitle: payload.signature?.title?.trim() || company.signatoryTitle || null,
      signatureImage: payload.signature?.imageDataUrl || null,
    };
  }

  private async load(
    workspaceId: string,
    quotationId: string,
  ): Promise<{ document: DocumentWithDetails; company: Company }> {
    const document = await this.documents.findOne({
      where: {
        id: quotationId,
        workspaceId,
        documentType: DocumentType.QUOTATION,
        deletedAt: IsNull(),
      },
      relations: { items: true, customer: true },
    });

    if (!document) {
      throw new NotFoundException('Quotation not found.');
    }

    const company = await this.companies.findById(document.companyId);

    if (!company) {
      throw new NotFoundException('The company for this quotation no longer exists.');
    }

    return { document: document as DocumentWithDetails, company };
  }
}
