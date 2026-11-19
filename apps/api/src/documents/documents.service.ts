import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { Decimal } from '../database/decimal.transformer';
import {
  AuditEvent,
  Company,
  Customer,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  InvoiceFollowUp,
} from '../database/entities';
import { DiscountType, DocumentStatus, DocumentType, TaxMode } from '../database/entities/enums';
import { calculateDocument } from './calculation';
import { FollowUpInputDto, FollowUpStatusDto } from './dto/follow-up.dto';
import {
  ChangeStatusDto,
  InvoicePayloadDto,
  InvoiceRevisionDto,
  ListDocumentsQueryDto,
} from './dto/invoice.dto';
import {
  documentHistory,
  nextDocumentNumber,
  resolveCatalogItemIds,
  resolveDocumentCustomer,
  saveDocumentItems,
  toDateOnly,
} from './document-support';
import { DocumentFlowService } from './document-flow.service';
import {
  archiveCurrentVersion,
  listRevisions,
  loadRevision,
  requireReason,
  type RevisionState,
} from './revisions';
import { renderInvoicePdf } from './pdf/invoice-pdf';
import { templateOfStoredView } from '../templates/template-snapshot';
import { TemplatesService } from '../templates/templates.service';
import { terminColumns, terminMetadata, type TerminAssignment } from '../termins/termin-assignment';
import {
  planViewById,
  terminCounts,
  terminRefFrom,
  terminRefOf,
  type TerminRef,
} from '../termins/termin-views';
import {
  DocumentWithCustomer,
  DocumentWithDetails,
  InvoiceFlowView,
  InvoiceFollowUpView,
  InvoiceHistoryEntry,
  InvoiceListRow,
  InvoiceSummary,
  InvoiceView,
  toInvoiceFollowUpView,
  toInvoiceListRow,
  toInvoiceView,
} from './views';

export const INVOICE_NUMBER_PATTERN = 'INV/{YYYY}/{seq}';
export const INVOICE_NUMBER_PADDING = 4;
const DEFAULT_NUMBER_PATTERN = INVOICE_NUMBER_PATTERN;
const DEFAULT_PADDING = INVOICE_NUMBER_PADDING;

const ALLOWED_TRANSITIONS: Record<string, Array<'ISSUED' | 'PAID' | 'VOID'>> = {
  DRAFT: ['ISSUED', 'VOID'],
  ISSUED: ['PAID', 'VOID'],
  PARTIALLY_PAID: ['PAID', 'VOID'],
  OVERDUE: ['PAID', 'VOID'],
  PAID: [],
  VOID: [],
};

/**
 * Invoices generated from a goods receipt can carry an attention person typed on the
 * quotation (no saved PIC). The invoice form has no attention field, so keep that person
 * while the customer stays the same and no saved PIC is chosen.
 */
function keptAttention(
  document: Document,
  payload: InvoicePayloadDto,
): { name?: string; jobTitle?: string } | undefined {
  const stored = (document.customerSnapshot ?? {}) as {
    id?: string | null;
    contact?: { id: string | null; name: string; jobTitle: string | null } | null;
  };
  const sameCustomer = Boolean(payload.customer.id) && payload.customer.id === stored.id;

  if (!sameCustomer || payload.customer.contactId || !stored.contact || stored.contact.id) {
    return undefined;
  }

  return { name: stored.contact.name, jobTitle: stored.contact.jobTitle ?? undefined };
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
    @InjectRepository(InvoiceFollowUp)
    private readonly followUps: Repository<InvoiceFollowUp>,
    private readonly auditLog: AuditService,
    private readonly companies: CompaniesService,
    private readonly flows: DocumentFlowService,
    private readonly templates: TemplatesService,
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
    const counts = await terminCounts(
      this.documents.manager,
      documents.map((document) => document.terminPlanId),
    );

    return {
      items: (documents as DocumentWithCustomer[]).map((document) =>
        toInvoiceListRow(document, terminRefFrom(document, counts)),
      ),
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
    const [history, followUps, flow, revisionState, template, terminPlan] = await Promise.all([
      this.history(documentId),
      this.followUpViews(documentId),
      this.flows.forInvoice(document),
      this.revisionState(document),
      this.templates.templateOf(document),
      planViewById(this.documents.manager, document.terminPlanId),
    ]);
    const nextStatuses = ALLOWED_TRANSITIONS[document.status] ?? [];

    return toInvoiceView(
      document,
      company,
      history,
      nextStatuses,
      followUps,
      flow,
      revisionState,
      template,
      { termin: await this.terminOf(document, flow), terminPlan },
    );
  }

  async create(
    workspaceId: string,
    userId: string,
    payload: InvoicePayloadDto,
  ): Promise<InvoiceView> {
    const company = await this.companies.resolveCompany(workspaceId, payload.companyId);
    const { id } = await this.documents.manager.transaction((manager) =>
      this.insertInvoice(manager, workspaceId, userId, company, payload),
    );

    return this.get(workspaceId, id);
  }

  /**
   * Writes a draft invoice from the generator's payload inside `manager`'s transaction —
   * the whole invoice, or one payment termin of it (the payload is then already the termin's
   * share). Returns the invoice and the customer it was billed to (created when new).
   */
  async insertInvoice(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
    company: Company,
    payload: InvoicePayloadDto,
    termin?: TerminAssignment,
  ): Promise<{ id: string; customerId: string }> {
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

    // New invoices are generated with the company's active invoice template.
    const template = await this.templates.documentColumns(company.id, DocumentType.INVOICE);
    const issuerSnapshot = {
      id: company.id,
      name: company.displayName?.trim() || company.legalName,
      address: company.addressLine1,
      email: company.email,
      phone: company.phone,
      taxId: company.taxId,
    };

    const { customer, snapshot: customerSnapshot } = await resolveDocumentCustomer(
      manager,
      workspaceId,
      payload.customer,
    );
    const catalogItemIds = await resolveCatalogItemIds(manager, workspaceId, payload.items);
    const documentNumber = await nextDocumentNumber(
      manager,
      company,
      issueDate,
      DocumentType.INVOICE,
      DEFAULT_NUMBER_PATTERN,
      DEFAULT_PADDING,
    );

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

    await saveDocumentItems(manager, created.id, calculation.items, catalogItemIds);
    await manager.getRepository(AuditEvent).save(
      manager.getRepository(AuditEvent).create({
        workspaceId,
        actorId: userId,
        action: 'invoice.created',
        targetType: 'invoice',
        targetId: created.id,
        metadata: {
          from: null,
          to: DocumentStatus.DRAFT,
          reason: null,
          number: created.documentNumber,
          total: Number(calculation.grandTotal),
          ...terminMetadata(termin),
        },
        ip: null,
      }),
    );

    return { id: created.id, customerId: customer.id };
  }

  async update(
    workspaceId: string,
    userId: string,
    documentId: string,
    payload: InvoicePayloadDto,
  ): Promise<InvoiceView> {
    const { document } = await this.load(workspaceId, documentId);

    if (document.status !== DocumentStatus.DRAFT) {
      throw new ConflictException(
        'Only draft invoices can be edited. Revise an issued invoice instead.',
      );
    }

    await this.applyChanges(workspaceId, userId, document, payload);
    return this.get(workspaceId, documentId);
  }

  /** Corrects an issued invoice as a new version; it stays issued. */
  async revise(
    workspaceId: string,
    userId: string,
    documentId: string,
    dto: InvoiceRevisionDto,
  ): Promise<InvoiceView> {
    const { document } = await this.load(workspaceId, documentId);
    const reason = requireReason(dto.reason);

    if (document.status !== DocumentStatus.ISSUED) {
      throw new ConflictException(
        document.status === DocumentStatus.DRAFT
          ? 'Drafts are edited directly; revisions are for issued invoices.'
          : `A ${document.status.toLowerCase().replace(/_/g, ' ')} invoice cannot be revised.`,
      );
    }

    const current = await this.get(workspaceId, documentId);
    const { reason: _reason, ...payload } = dto;
    void _reason;
    await this.applyChanges(workspaceId, userId, document, payload, { reason, view: current });

    return this.get(workspaceId, documentId);
  }

  async getRevision(
    workspaceId: string,
    documentId: string,
    revision: number,
  ): Promise<InvoiceView> {
    const { document, company } = await this.load(workspaceId, documentId);
    const { snapshot, superseded } = await loadRevision(this.documents.manager, document, revision);
    const view = snapshot as unknown as InvoiceView;

    return {
      ...view,
      company: { ...view.company, logoDataUrl: company.logoDataUrl },
      template: templateOfStoredView(view.template, DocumentType.INVOICE),
      history: [],
      followUps: [],
      nextStatuses: [],
      flow: null,
      termin: view.termin ?? null,
      terminPlan: null,
      revisions: [],
      canRevise: false,
      revisionBlockedBy: null,
      supersededRevision: superseded,
    };
  }

  async revisionPdf(
    workspaceId: string,
    documentId: string,
    revision: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const view = await this.getRevision(workspaceId, documentId, revision);
    const buffer = await renderInvoicePdf(view);
    const filename = `${(view.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-')}-v${revision}.pdf`;
    return { buffer, filename };
  }

  private async revisionState(document: Document): Promise<RevisionState> {
    return {
      revisions: await listRevisions(this.documents.manager, document.id),
      canRevise: document.status === DocumentStatus.ISSUED,
      revisionBlockedBy: null,
    };
  }

  /** Writes new content; with `revision`, archives the current version first. */
  private async applyChanges(
    workspaceId: string,
    userId: string,
    document: DocumentWithDetails,
    payload: InvoicePayloadDto,
    revision?: { reason: string; view: InvoiceView },
  ): Promise<void> {
    const documentId = document.id;
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
    // Drafts pick up the active template on every save; revisions keep their design.
    const template =
      document.status === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(document.companyId, DocumentType.INVOICE)
        : {};

    await this.documents.manager.transaction(async (manager) => {
      const nextRevision = revision
        ? await archiveCurrentVersion(manager, document, revision.view, revision.reason, userId)
        : document.revision;
      const { customer, snapshot: customerSnapshot } = await resolveDocumentCustomer(
        manager,
        workspaceId,
        payload.customer,
        keptAttention(document, payload),
      );
      const catalogItemIds = await resolveCatalogItemIds(manager, workspaceId, payload.items);

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
        balanceDue: revision
          ? Decimal.max(calculation.grandTotal.minus(document.amountPaid), 0)
          : calculation.grandTotal,
        notes: payload.notes?.trim() || null,
        terms: payload.terms?.trim() || null,
        customerSnapshot,
        ...template,
        calculationSnapshot: {
          subtotal: calculation.subtotal.toString(),
          discountTotal: calculation.discountTotal.toString(),
          taxTotal: calculation.taxTotal.toString(),
          grandTotal: calculation.grandTotal.toString(),
        },
        version: document.version + 1,
        revision: nextRevision,
      });

      await manager.getRepository(Document).save(document);

      await saveDocumentItems(manager, documentId, calculation.items, catalogItemIds);

      if (revision) {
        await manager.getRepository(AuditEvent).save(
          manager.getRepository(AuditEvent).create({
            workspaceId,
            actorId: userId,
            action: 'invoice.revised',
            targetType: 'invoice',
            targetId: documentId,
            metadata: {
              number: document.documentNumber,
              total: Number(calculation.grandTotal),
              revision: nextRevision,
              reason: revision.reason,
            },
            ip: null,
          }),
        );
      }
    });

    if (revision) {
      return;
    }

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'invoice.updated',
      targetType: 'invoice',
      targetId: documentId,
      metadata: {
        number: document.documentNumber,
        total: Number(calculation.grandTotal),
        items: calculation.items.length,
      },
    });
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
      // Leaving draft (issuing or voiding) freezes the design.
      ...(document.status === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(document.companyId, DocumentType.INVOICE)
        : {}),
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

  async listFollowUps(workspaceId: string, documentId: string): Promise<InvoiceFollowUpView[]> {
    await this.requireInvoice(workspaceId, documentId);
    return this.followUpViews(documentId);
  }

  async addFollowUp(
    workspaceId: string,
    userId: string,
    documentId: string,
    dto: FollowUpInputDto,
  ): Promise<InvoiceFollowUpView> {
    await this.requireInvoice(workspaceId, documentId);

    const saved = await this.followUps.save(
      this.followUps.create({
        id: randomUUID(),
        workspaceId,
        documentId,
        activity: dto.activity,
        method: dto.method,
        followUpDate: toDateOnly(dto.followUpDate),
        feedback: dto.feedback,
        status: dto.status,
        evidence: dto.evidence?.trim() || null,
        createdById: userId,
      }),
    );

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'invoice.follow_up_added',
      targetType: 'invoice',
      targetId: documentId,
      metadata: { activity: saved.activity, method: saved.method, status: saved.status },
    });

    return this.followUpView(saved.id);
  }

  async changeFollowUpStatus(
    workspaceId: string,
    userId: string,
    documentId: string,
    followUpId: string,
    dto: FollowUpStatusDto,
  ): Promise<InvoiceFollowUpView> {
    const followUp = await this.followUps.findOne({
      where: { id: followUpId, documentId, workspaceId },
    });

    if (!followUp) {
      throw new NotFoundException('Follow-up not found.');
    }

    const previousStatus = followUp.status;
    followUp.status = dto.status;
    await this.followUps.save(followUp);

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'invoice.follow_up_status_changed',
      targetType: 'invoice',
      targetId: documentId,
      metadata: { activity: followUp.activity, from: previousStatus, to: dto.status },
    });

    return this.followUpView(followUp.id);
  }

  async removeFollowUp(
    workspaceId: string,
    userId: string,
    documentId: string,
    followUpId: string,
  ): Promise<void> {
    const followUp = await this.followUps.findOne({
      where: { id: followUpId, documentId, workspaceId },
    });
    const result = await this.followUps.delete({ id: followUpId, documentId, workspaceId });

    if (!result.affected) {
      throw new NotFoundException('Follow-up not found.');
    }

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'invoice.follow_up_deleted',
      targetType: 'invoice',
      targetId: documentId,
      metadata: { activity: followUp?.activity ?? null, status: followUp?.status ?? null },
    });
  }

  async remove(workspaceId: string, userId: string, documentId: string): Promise<void> {
    const { document } = await this.load(workspaceId, documentId);

    if (document.status !== DocumentStatus.DRAFT && document.status !== DocumentStatus.VOID) {
      throw new ConflictException('Only draft or void invoices can be deleted.');
    }

    document.deletedAt = new Date();
    await this.documents.save(document);
    // A typed invoice's termin plan goes with its last remaining termin invoice.
    if (document.terminPlanId) {
      await this.documents.manager.query(
        `DELETE FROM termin_plans p
          WHERE p.id = $1 AND p.source_document_id IS NULL
            AND NOT EXISTS (
              SELECT 1 FROM documents d WHERE d.termin_plan_id = p.id AND d.deleted_at IS NULL)`,
        [document.terminPlanId],
      );
    }

    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'invoice.deleted',
      targetType: 'invoice',
      targetId: documentId,
      metadata: {
        number: document.documentNumber,
        status: document.status,
        total: Number(document.grandTotal),
      },
    });
  }

  async pdf(
    workspaceId: string,
    documentId: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const { document, company } = await this.load(workspaceId, documentId);
    const flow = await this.flows.forInvoice(document);
    const invoice = toInvoiceView(
      document,
      company,
      [],
      [],
      [],
      flow,
      undefined,
      await this.templates.templateOf(document),
      { termin: await this.terminOf(document, flow), terminPlan: null },
    );
    const buffer = await renderInvoicePdf(invoice);
    const filename = `${(invoice.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

    return { buffer, filename };
  }

  /** The invoice's own termin, or the termin of the termin goods receipt it bills. */
  private async terminOf(
    document: Document,
    flow: InvoiceFlowView | null,
  ): Promise<TerminRef | null> {
    const manager = this.documents.manager;
    const own = await terminRefOf(manager, document);
    if (own || !flow) return own;

    const receipt = await this.documents.findOne({ where: { id: flow.goodsReceipt.id } });
    return receipt ? terminRefOf(manager, receipt, 'GOODS_RECEIPT') : null;
  }

  private history(documentId: string): Promise<InvoiceHistoryEntry[]> {
    return documentHistory(this.audit, 'invoice', documentId);
  }

  private async followUpViews(documentId: string): Promise<InvoiceFollowUpView[]> {
    const rows = await this.followUps.find({
      where: { documentId },
      relations: { createdBy: true },
      order: { followUpDate: 'DESC', createdAt: 'DESC' },
    });

    return rows.map(toInvoiceFollowUpView);
  }

  private async followUpView(followUpId: string): Promise<InvoiceFollowUpView> {
    const row = await this.followUps.findOne({
      where: { id: followUpId },
      relations: { createdBy: true },
    });

    if (!row) {
      throw new NotFoundException('Follow-up not found.');
    }

    return toInvoiceFollowUpView(row);
  }

  private async requireInvoice(workspaceId: string, documentId: string): Promise<void> {
    const count = await this.documents.count({
      where: {
        id: documentId,
        workspaceId,
        documentType: DocumentType.INVOICE,
        deletedAt: IsNull(),
      },
    });

    if (count === 0) {
      throw new NotFoundException('Invoice not found.');
    }
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
}
