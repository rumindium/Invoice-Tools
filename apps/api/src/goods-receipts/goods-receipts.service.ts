import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, EntityManager, IsNull, Repository } from 'typeorm';
import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { Decimal } from '../database/decimal.transformer';
import {
  AuditEvent,
  Company,
  Document,
  DocumentItem,
  DocumentRelation,
  TerminPlan,
} from '../database/entities';
import {
  DiscountType,
  DocumentStatus,
  DocumentType,
  RelationType,
  TaxMode,
} from '../database/entities/enums';
import { calculateDocument } from '../documents/calculation';
import { activeInvoiceOf } from '../documents/document-links';
import { documentHistory, nextDocumentNumber, toDateOnly } from '../documents/document-support';
import type { DocumentWithDetails } from '../documents/views';
import { toRecipientView } from '../quotations/views';
import {
  CreateGoodsReceiptDto,
  GoodsReceiptRevisionDto,
  GoodsReceiptStatusDto,
  ListGoodsReceiptsQueryDto,
  UpdateGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { activeGoodsReceipt, NO_ACTIVE_GOODS_RECEIPT } from './goods-receipt-links';
import {
  archiveCurrentVersion,
  listRevisions,
  loadRevision,
  requireReason,
  type RevisionState,
} from '../documents/revisions';
import { renderGoodsReceiptPdf } from './goods-receipt-pdf';
import { templateOfStoredView } from '../templates/template-snapshot';
import { TemplatesService } from '../templates/templates.service';
import { terminColumns, terminMetadata, type TerminAssignment } from '../termins/termin-assignment';
import { quantityShare } from '../termins/termin-math';
import {
  planOfSource,
  planViewById,
  planViewOfSource,
  terminCounts,
  terminRefFrom,
  terminRefOf,
} from '../termins/termin-views';
import {
  canTransitionReceipt,
  isReceiptDeletable,
  isReceiptEditable,
  nextGoodsReceiptStatuses,
  validateReceiptLine,
} from './goods-receipt-status';
import {
  GoodsReceiptListRow,
  GoodsReceiptSourceRow,
  GoodsReceiptSummary,
  GoodsReceiptView,
  NO_TERMINS,
  ReceiptDetails,
  receiptDetails,
  toGoodsReceiptListRow,
  toGoodsReceiptView,
} from './views';

export const GOODS_RECEIPT_NUMBER_PATTERN = 'GR/{YYYY}/{seq}';
const AUDIT_TARGET = 'goods_receipt';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const clean = (value: string | undefined | null): string | null => value?.trim() || null;

@Injectable()
export class GoodsReceiptsService {
  constructor(
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
    private readonly auditLog: AuditService,
    private readonly companies: CompaniesService,
    private readonly templates: TemplatesService,
  ) {}

  /** Accepted quotations that do not have an active goods receipt yet. */
  async sources(workspaceId: string): Promise<GoodsReceiptSourceRow[]> {
    const quotations = await this.documents
      .createQueryBuilder('q')
      .leftJoinAndSelect('q.customer', 'customer')
      .leftJoinAndSelect('q.items', 'items')
      .where('q.workspaceId = :workspaceId', { workspaceId })
      .andWhere('q.documentType = :type', { type: DocumentType.QUOTATION })
      .andWhere('q.status = :status', { status: DocumentStatus.ACCEPTED })
      .andWhere('q.deletedAt IS NULL')
      .andWhere(NO_ACTIVE_GOODS_RECEIPT)
      .orderBy('q.issueDate', 'DESC')
      .addOrderBy('q.createdAt', 'DESC')
      .getMany();

    return (quotations as DocumentWithDetails[]).map((quotation) => ({
      id: quotation.id,
      number: quotation.documentNumber,
      issueDate: quotation.issueDate,
      recipientName: toRecipientView(quotation).name,
      itemCount: quotation.items.length,
      total: Number(quotation.grandTotal),
      currency: quotation.currencyCode,
    }));
  }

  /** Generates the goods receipt of an accepted quotation, carrying every line across. */
  async createFromQuotation(
    workspaceId: string,
    userId: string,
    dto: CreateGoodsReceiptDto,
  ): Promise<GoodsReceiptView> {
    const receiptId = await this.documents.manager.transaction(async (manager) => {
      const quotation = await this.lockAcceptedQuotation(manager, workspaceId, dto.quotationId);

      const existing = await activeGoodsReceipt(manager, quotation.id);
      if (existing) {
        throw new ConflictException(
          `Quotation ${quotation.documentNumber} already has goods receipt ${existing.number}.`,
        );
      }

      const plan = await manager.getRepository(TerminPlan).findOne({
        where: { sourceDocumentId: quotation.id, documentType: DocumentType.GOODS_RECEIPT },
      });
      if (plan) {
        throw new ConflictException(
          `Quotation ${quotation.documentNumber} is received in payment termins. Generate the goods receipts from its termin plan.`,
        );
      }

      return this.createReceipt(manager, workspaceId, userId, quotation);
    });

    return this.get(workspaceId, receiptId);
  }

  /**
   * Row lock on the quotation: two clicks on "Create goods receipt" must not produce two
   * receipts. The quotation must be accepted.
   */
  async lockAcceptedQuotation(
    manager: EntityManager,
    workspaceId: string,
    quotationId: string,
  ): Promise<Document> {
    const locked = await manager.getRepository(Document).findOne({
      where: {
        id: quotationId,
        workspaceId,
        documentType: DocumentType.QUOTATION,
        deletedAt: IsNull(),
      },
      lock: { mode: 'pessimistic_write' },
    });

    if (!locked) {
      throw new NotFoundException('Quotation not found.');
    }

    if (locked.status !== DocumentStatus.ACCEPTED) {
      throw new ConflictException(
        'Only accepted quotations can be received. Mark the quotation as accepted first.',
      );
    }

    return locked;
  }

  /**
   * Writes the draft goods receipt of a (locked, accepted) quotation — every line, or one
   * payment termin's share of each — with its relation and audit events. Returns its id.
   */
  async createReceipt(
    manager: EntityManager,
    workspaceId: string,
    userId: string,
    locked: Document,
    termin?: TerminAssignment,
  ): Promise<string> {
    const repository = manager.getRepository(Document);
    const items = await manager.getRepository(DocumentItem).find({
      where: { documentId: locked.id },
      order: { position: 'ASC' },
    });
    const quotation = { ...locked, items } as Document & { items: DocumentItem[] };
    const company = await this.requireCompany(locked.companyId);
    // New goods receipts are generated with the company's active goods receipt template.
    const template = await this.templates.documentColumns(company.id, DocumentType.GOODS_RECEIPT);
    const receiptDate = todayIso();
    const recipient = toRecipientView({ ...quotation, customer: null });

    const details: ReceiptDetails = {
      source: {
        quotationId: quotation.id,
        quotationNumber: quotation.documentNumber,
        quotationDate: quotation.issueDate,
        customerReference: quotation.referenceNumber,
      },
      deliveryNoteNumber: null,
      carrier: null,
      vehicleNumber: null,
      receivingLocation: recipient.address,
      deliveredByName: quotation.signatureName ?? company.signatoryName ?? null,
      receivedByName: recipient.attention?.name ?? null,
      receivedByTitle: recipient.attention?.jobTitle ?? null,
      checkedByName: null,
    };

    // A termin receives its share of every quoted quantity (lines with no share are left out).
    const lines = items
      .map((item) => {
        const ordered = termin ? quantityShare(item.quantity, termin.bounds) : item.quantity;
        return {
          item: { ...item, quantity: ordered, orderedQuantity: ordered } as DocumentItem,
          received: ordered,
          rejected: new Decimal(0),
          remarks: null as string | null,
        };
      })
      .filter((line) => !termin || line.received.gt(0));

    if (lines.length === 0) {
      throw new ConflictException(
        termin
          ? `Termin ${termin.sequence} (${termin.percentage}%) is too small: every quantity rounds to zero.`
          : 'This quotation has no items to receive.',
      );
    }

    const number = await nextDocumentNumber(
      manager,
      company,
      receiptDate,
      DocumentType.GOODS_RECEIPT,
      GOODS_RECEIPT_NUMBER_PATTERN,
    );
    const calculation = this.calculate(lines, quotation.taxMode);

    const receipt = await repository.save(
      repository.create({
        id: randomUUID(),
        workspaceId,
        companyId: company.id,
        customerId: quotation.customerId,
        documentType: DocumentType.GOODS_RECEIPT,
        status: DocumentStatus.DRAFT,
        documentNumber: number,
        sequencePeriod: receiptDate.slice(0, 4),
        issueDate: receiptDate,
        dueDate: null,
        validUntil: null,
        referenceNumber: quotation.referenceNumber,
        currencyCode: quotation.currencyCode,
        taxMode: quotation.taxMode,
        discountType: DiscountType.NONE,
        discountRate: null,
        discountAmount: new Decimal(0),
        ...this.amounts(calculation),
        amountPaid: new Decimal(0),
        balanceDue: new Decimal(0),
        notes: null,
        terms: null,
        issuerSnapshot: quotation.issuerSnapshot,
        customerSnapshot: quotation.customerSnapshot,
        receiptDetails: details as unknown as Record<string, unknown>,
        ...template,
        ...terminColumns(termin),
        createdById: userId,
      }),
    );

    await this.saveLines(manager, receipt.id, lines, calculation);
    await manager.getRepository(DocumentRelation).save(
      manager.getRepository(DocumentRelation).create({
        id: randomUUID(),
        sourceDocumentId: quotation.id,
        targetDocumentId: receipt.id,
        relationType: RelationType.CONVERTED_TO,
        createdById: userId,
      }),
    );

    const auditRepository = manager.getRepository(AuditEvent);
    await auditRepository.save([
      auditRepository.create({
        workspaceId,
        actorId: userId,
        action: 'quotation.goods_receipt_created',
        targetType: 'quotation',
        targetId: quotation.id,
        metadata: {
          number: quotation.documentNumber,
          goodsReceiptNumber: number,
          ...terminMetadata(termin),
        },
        ip: null,
      }),
      auditRepository.create({
        workspaceId,
        actorId: userId,
        action: 'goods_receipt.created',
        targetType: AUDIT_TARGET,
        targetId: receipt.id,
        metadata: {
          from: null,
          to: DocumentStatus.DRAFT,
          reason: null,
          number,
          quotationNumber: quotation.documentNumber,
          ...terminMetadata(termin),
        },
        ip: null,
      }),
    ]);

    return receipt.id;
  }

  async list(
    workspaceId: string,
    query: ListGoodsReceiptsQueryDto,
  ): Promise<{ items: GoodsReceiptListRow[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();

    const builder = this.documents
      .createQueryBuilder('document')
      .leftJoinAndSelect('document.customer', 'customer')
      .leftJoinAndSelect('document.items', 'items')
      .where('document.workspaceId = :workspaceId', { workspaceId })
      .andWhere('document.documentType = :type', { type: DocumentType.GOODS_RECEIPT })
      .andWhere('document.deletedAt IS NULL');

    if (query.status && query.status !== 'ALL') {
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
            })
            .orWhere("document.receiptDetails -> 'source' ->> 'quotationNumber' ILIKE :search", {
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
    const counts = await terminCounts(
      this.documents.manager,
      documents.map((document) => document.terminPlanId),
    );

    return {
      items: (documents as DocumentWithDetails[]).map((document) =>
        toGoodsReceiptListRow(document, terminRefFrom(document, counts)),
      ),
      total,
      page,
      pageSize,
    };
  }

  async summary(workspaceId: string): Promise<GoodsReceiptSummary> {
    const receipts = await this.documents.find({
      where: { workspaceId, documentType: DocumentType.GOODS_RECEIPT, deletedAt: IsNull() },
      select: { id: true, status: true, issueDate: true },
    });
    const monthPrefix = todayIso().slice(0, 7);

    return {
      totalReceipts: receipts.length,
      totalThisMonth: receipts.filter((row) => row.issueDate.slice(0, 7) === monthPrefix).length,
      draftCount: receipts.filter((row) => row.status === DocumentStatus.DRAFT).length,
      receivedCount: receipts.filter((row) => row.status === DocumentStatus.RECEIVED).length,
      cancelledCount: receipts.filter((row) => row.status === DocumentStatus.CANCELLED).length,
      awaitingReceipt: (await this.sources(workspaceId)).length,
    };
  }

  async get(workspaceId: string, receiptId: string): Promise<GoodsReceiptView> {
    const { document, company } = await this.load(workspaceId, receiptId);
    const manager = this.documents.manager;
    const [history, invoice, revisionState, template, termin, terminPlan, invoiceTerminPlan] =
      await Promise.all([
        documentHistory(this.audit, AUDIT_TARGET, receiptId),
        activeInvoiceOf(manager, receiptId),
        this.revisionState(document),
        this.templates.templateOf(document),
        terminRefOf(manager, document),
        planViewById(manager, document.terminPlanId),
        planViewOfSource(manager, receiptId, DocumentType.INVOICE),
      ]);

    return toGoodsReceiptView(
      document,
      company,
      history,
      nextGoodsReceiptStatuses(document.status),
      invoice,
      revisionState,
      template,
      { termin, terminPlan, invoiceTerminPlan },
    );
  }

  async update(
    workspaceId: string,
    userId: string,
    receiptId: string,
    dto: UpdateGoodsReceiptDto,
  ): Promise<GoodsReceiptView> {
    const { document } = await this.load(workspaceId, receiptId);

    if (!isReceiptEditable(document.status)) {
      throw new ConflictException(
        'Only draft goods receipts can be edited. Revise a received goods receipt instead.',
      );
    }

    await this.applyChanges(workspaceId, userId, document, dto);
    return this.get(workspaceId, receiptId);
  }

  /** Corrects a received goods receipt as a new version; it stays received. */
  async revise(
    workspaceId: string,
    userId: string,
    receiptId: string,
    dto: GoodsReceiptRevisionDto,
  ): Promise<GoodsReceiptView> {
    const { document } = await this.load(workspaceId, receiptId);
    const reason = requireReason(dto.reason);
    const state = await this.revisionState(document);

    if (!state.canRevise) {
      throw new ConflictException(
        state.revisionBlockedBy ??
          (document.status === DocumentStatus.DRAFT
            ? 'Drafts are edited directly; revisions are for received goods receipts.'
            : `A ${document.status.toLowerCase()} goods receipt cannot be revised.`),
      );
    }

    const current = await this.get(workspaceId, receiptId);
    const { reason: _reason, ...payload } = dto;
    void _reason;
    await this.applyChanges(workspaceId, userId, document, payload, { reason, view: current });

    return this.get(workspaceId, receiptId);
  }

  async getRevision(
    workspaceId: string,
    receiptId: string,
    revision: number,
  ): Promise<GoodsReceiptView> {
    const { document, company } = await this.load(workspaceId, receiptId);
    const { snapshot, superseded } = await loadRevision(this.documents.manager, document, revision);
    const view = snapshot as unknown as GoodsReceiptView;

    return {
      ...view,
      company: { ...view.company, logoDataUrl: company.logoDataUrl },
      template: templateOfStoredView(view.template, DocumentType.GOODS_RECEIPT),
      history: [],
      nextStatuses: [],
      invoice: null,
      canCreateInvoice: false,
      canSplitInvoice: false,
      termin: view.termin ?? null,
      terminPlan: null,
      invoiceTerminPlan: null,
      revisions: [],
      canRevise: false,
      revisionBlockedBy: null,
      supersededRevision: superseded,
    };
  }

  async revisionPdf(
    workspaceId: string,
    receiptId: string,
    revision: number,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const view = await this.getRevision(workspaceId, receiptId, revision);
    const buffer = await renderGoodsReceiptPdf(view);
    const filename = `${(view.number ?? 'goods-receipt').replace(/[^A-Za-z0-9._-]+/g, '-')}-v${revision}.pdf`;
    return { buffer, filename };
  }

  private async revisionState(document: Document): Promise<RevisionState> {
    const manager = this.documents.manager;
    const revisions = await listRevisions(manager, document.id);

    if (document.status !== DocumentStatus.RECEIVED) {
      return { revisions, canRevise: false, revisionBlockedBy: null };
    }

    if (await planOfSource(manager, document.id, DocumentType.INVOICE)) {
      return {
        revisions,
        canRevise: false,
        revisionBlockedBy:
          'This goods receipt is billed in payment termins. Delete its invoice termin plan before revising the receipt.',
      };
    }

    const invoice = await activeInvoiceOf(manager, document.id);
    return {
      revisions,
      canRevise: invoice === null,
      revisionBlockedBy: invoice
        ? `Invoice ${invoice.number} was generated from this goods receipt. Void or delete it before revising the receipt.`
        : null,
    };
  }

  /** Writes header details and counts; with `revision`, archives the current version first. */
  private async applyChanges(
    workspaceId: string,
    userId: string,
    document: DocumentWithDetails,
    dto: UpdateGoodsReceiptDto,
    revision?: { reason: string; view: GoodsReceiptView },
  ): Promise<void> {
    const receiptId = document.id;
    const receiptDate = toDateOnly(dto.receiptDate);
    const current = receiptDetails(document);
    if (current.source.quotationDate && receiptDate < current.source.quotationDate) {
      throw new BadRequestException('The receipt date cannot be before the quotation date.');
    }

    const byId = new Map(document.items.map((item) => [item.id, item]));
    const seen = new Set<string>();
    for (const line of dto.lines) {
      if (!byId.has(line.id)) {
        throw new BadRequestException('A line does not belong to this goods receipt.');
      }
      if (seen.has(line.id)) {
        throw new BadRequestException('Each line can appear only once.');
      }
      seen.add(line.id);
    }

    const lines = document.items
      .slice()
      .sort((left, right) => left.position - right.position)
      .map((item) => {
        const input = dto.lines.find((line) => line.id === item.id);
        const received = input ? new Decimal(input.receivedQuantity) : item.quantity;
        const rejected = input
          ? new Decimal(input.rejectedQuantity)
          : (item.rejectedQuantity ?? new Decimal(0));
        const error = validateReceiptLine({
          name: item.itemName,
          ordered: (item.orderedQuantity ?? item.quantity).toNumber(),
          received: received.toNumber(),
          rejected: rejected.toNumber(),
        });
        if (error) {
          throw new BadRequestException(error);
        }
        return {
          item,
          received,
          rejected,
          remarks: input ? clean(input.remarks) : item.remarks,
        };
      });
    const calculation = this.calculate(lines, document.taxMode);

    const details: ReceiptDetails = {
      source: current.source,
      deliveryNoteNumber: clean(dto.deliveryNoteNumber),
      carrier: clean(dto.carrier),
      vehicleNumber: clean(dto.vehicleNumber),
      receivingLocation: clean(dto.receivingLocation),
      deliveredByName: clean(dto.deliveredByName),
      receivedByName: clean(dto.receivedByName),
      receivedByTitle: clean(dto.receivedByTitle),
      checkedByName: clean(dto.checkedByName),
    };

    // Drafts pick up the active template on every save; revisions keep their design.
    const template =
      document.status === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(document.companyId, DocumentType.GOODS_RECEIPT)
        : {};

    if (revision && !lines.some((line) => line.received.gt(0))) {
      throw new BadRequestException(
        'A received goods receipt needs at least one received quantity.',
      );
    }

    await this.documents.manager.transaction(async (manager) => {
      const nextRevision = revision
        ? await archiveCurrentVersion(manager, document, revision.view, revision.reason, userId)
        : document.revision;
      await manager.getRepository(DocumentItem).delete({ documentId: receiptId });
      await this.saveLines(manager, receiptId, lines, calculation, true);
      // TypeORM's partial-entity type does not accept jsonb records; the value is bound normally.
      const patch = {
        issueDate: receiptDate,
        notes: clean(dto.notes),
        receiptDetails: { ...details } as Record<string, unknown>,
        ...template,
        ...this.amounts(calculation),
        version: document.version + 1,
        revision: nextRevision,
      } as QueryDeepPartialEntity<Document>;
      await manager.getRepository(Document).update({ id: receiptId }, patch);
      await manager.getRepository(AuditEvent).save(
        manager.getRepository(AuditEvent).create({
          workspaceId,
          actorId: userId,
          action: revision ? 'goods_receipt.revised' : 'goods_receipt.updated',
          targetType: AUDIT_TARGET,
          targetId: receiptId,
          metadata: {
            number: document.documentNumber,
            accepted: lines.reduce(
              (total, line) => total + line.received.minus(line.rejected).toNumber(),
              0,
            ),
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
    receiptId: string,
    dto: GoodsReceiptStatusDto,
  ): Promise<GoodsReceiptView> {
    const { document } = await this.load(workspaceId, receiptId);

    if (!canTransitionReceipt(document.status, dto.status)) {
      throw new ConflictException(
        `A ${document.status.toLowerCase()} goods receipt cannot be changed to ${dto.status.toLowerCase()}.`,
      );
    }

    if (dto.status === 'RECEIVED' && !document.items.some((item) => item.quantity.gt(0))) {
      throw new ConflictException('Record at least one received quantity before posting.');
    }

    const reason = dto.reason?.trim() || null;
    if (dto.status === 'CANCELLED' && !reason) {
      throw new BadRequestException('A reason is required to cancel a goods receipt.');
    }

    if (dto.status === 'CANCELLED') {
      if (await planOfSource(this.documents.manager, receiptId, DocumentType.INVOICE)) {
        throw new ConflictException(
          'This goods receipt is billed in payment termins. Delete its invoice termin plan before cancelling the receipt.',
        );
      }
      const invoice = await activeInvoiceOf(this.documents.manager, receiptId);
      if (invoice) {
        throw new ConflictException(
          `Invoice ${invoice.number} was generated from this goods receipt. Void or delete it before cancelling the receipt.`,
        );
      }
    }

    // Leaving draft (posting or cancelling) freezes the design.
    const frozenTemplate =
      document.status === DocumentStatus.DRAFT
        ? await this.templates.documentColumns(document.companyId, DocumentType.GOODS_RECEIPT)
        : {};

    await this.documents.update(
      { id: receiptId },
      {
        status: dto.status as DocumentStatus,
        version: document.version + 1,
        ...(dto.status === 'RECEIVED' ? { issuedAt: new Date() } : {}),
        ...(dto.status === 'CANCELLED' ? { voidedAt: new Date(), voidReason: reason } : {}),
        ...frozenTemplate,
      },
    );
    await this.audit.save(
      this.audit.create({
        workspaceId,
        actorId: userId,
        action: 'goods_receipt.status_changed',
        targetType: AUDIT_TARGET,
        targetId: receiptId,
        metadata: {
          from: document.status,
          to: dto.status,
          reason,
          number: document.documentNumber,
        },
        ip: null,
      }),
    );

    return this.get(workspaceId, receiptId);
  }

  async remove(workspaceId: string, userId: string, receiptId: string): Promise<void> {
    const { document } = await this.load(workspaceId, receiptId);

    if (!isReceiptDeletable(document.status)) {
      throw new ConflictException('Only draft or cancelled goods receipts can be deleted.');
    }

    await this.documents.update({ id: receiptId }, { deletedAt: new Date() });
    this.auditLog.record({
      workspaceId,
      actorId: userId,
      action: 'goods_receipt.deleted',
      targetType: AUDIT_TARGET,
      targetId: receiptId,
      metadata: { number: document.documentNumber, status: document.status },
    });
  }

  async pdf(workspaceId: string, receiptId: string): Promise<{ buffer: Buffer; filename: string }> {
    const { document, company } = await this.load(workspaceId, receiptId);
    const receipt = toGoodsReceiptView(
      document,
      company,
      [],
      [],
      null,
      undefined,
      await this.templates.templateOf(document),
      { ...NO_TERMINS, termin: await terminRefOf(this.documents.manager, document) },
    );
    const buffer = await renderGoodsReceiptPdf(receipt);
    const filename = `${(receipt.number ?? 'goods-receipt').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;

    return { buffer, filename };
  }

  /** Value of the accepted goods at the quotation's prices and tax rates. */
  private calculate(
    lines: Array<{ item: DocumentItem; received: Decimal; rejected: Decimal }>,
    taxMode: TaxMode,
  ) {
    return calculateDocument({
      items: lines.map(({ item, received, rejected }) => ({
        name: item.itemName,
        description: item.description,
        unit: item.unit,
        quantity: received.minus(rejected).toNumber(),
        unitPrice: item.unitPrice.toNumber(),
        taxRate: item.taxRate.toNumber(),
      })),
      taxMode,
      discountType: 'NONE',
    });
  }

  private amounts(calculation: ReturnType<typeof calculateDocument>) {
    return {
      subtotal: calculation.subtotal,
      discountTotal: calculation.discountTotal,
      taxTotal: calculation.taxTotal,
      shippingAmount: calculation.shippingAmount,
      additionalCharges: calculation.additionalCharges,
      chargesTaxRate: null,
      chargesTax: calculation.chargesTax,
      grandTotal: calculation.grandTotal,
    };
  }

  /**
   * Writes the receipt's lines. `keepIds` keeps each line's id across edits (the lines are the
   * receipt's own), so clients can keep addressing them; new receipts get fresh ids.
   */
  private async saveLines(
    manager: EntityManager,
    receiptId: string,
    lines: Array<{
      item: DocumentItem;
      received: Decimal;
      rejected: Decimal;
      remarks: string | null;
    }>,
    calculation: ReturnType<typeof calculateDocument>,
    keepIds = false,
  ): Promise<void> {
    const repository = manager.getRepository(DocumentItem);

    await repository.save(
      lines.map(({ item, received, rejected, remarks }, index) => {
        const value = calculation.items[index]!;
        return repository.create({
          id: keepIds ? item.id : randomUUID(),
          documentId: receiptId,
          position: index + 1,
          catalogItemId: item.catalogItemId,
          itemName: item.itemName,
          description: item.description,
          unit: item.unit,
          orderedQuantity: item.orderedQuantity ?? item.quantity,
          quantity: received,
          rejectedQuantity: rejected,
          remarks,
          unitPrice: item.unitPrice,
          discountType: DiscountType.NONE,
          discountRate: null,
          discountAmount: new Decimal(0),
          taxRate: item.taxRate,
          taxAmount: value.taxAmount,
          lineSubtotal: value.lineSubtotal,
          lineTotal: value.lineTotal,
        });
      }),
    );
  }

  private async requireCompany(companyId: string): Promise<Company> {
    const company = await this.companies.findById(companyId);
    if (!company) {
      throw new NotFoundException('The company for this document no longer exists.');
    }
    return company;
  }

  private async load(
    workspaceId: string,
    receiptId: string,
  ): Promise<{ document: DocumentWithDetails; company: Company }> {
    const document = await this.documents.findOne({
      where: {
        id: receiptId,
        workspaceId,
        documentType: DocumentType.GOODS_RECEIPT,
        deletedAt: IsNull(),
      },
      relations: { items: true, customer: true },
    });

    if (!document) {
      throw new NotFoundException('Goods receipt not found.');
    }

    return {
      document: document as DocumentWithDetails,
      company: await this.requireCompany(document.companyId),
    };
  }
}
