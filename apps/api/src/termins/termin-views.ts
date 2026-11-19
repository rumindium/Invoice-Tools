import type { EntityManager } from 'typeorm';
import { Decimal } from '../database/decimal.transformer';
import { Document, TerminPlan, TerminPlanItem } from '../database/entities';
import { DocumentStatus, DocumentType } from '../database/entities/enums';
import { calculateDocument } from '../documents/calculation';
import type { InvoicePayloadDto } from '../documents/dto/invoice.dto';
import { buildReceiptInvoice, loadReceiptInvoiceSource } from '../documents/receipt-invoice';
import { moneyShare, terminBounds, totalPercentage } from './termin-math';

/** The termin a document is: "termin 2 of 4, 30%". */
export interface TerminRef {
  /** Null when the plan was deleted after this (cancelled or void) document. */
  planId: string | null;
  sequence: number;
  /** Termins in the plan (null when the plan was deleted). */
  count: number | null;
  percentage: number;
  /** Invoices of a termin goods receipt carry the receipt's termin. */
  via: 'GOODS_RECEIPT' | null;
}

/** What invoices typed in the generator keep on their plan. */
export interface InvoicePlanBase {
  invoice: InvoicePayloadDto;
  currency: string;
}

export interface TerminDocumentView {
  id: string;
  number: string | null;
  status: string;
  revision: number;
  issueDate: string;
  total: number;
}

export interface TerminSlotView {
  sequence: number;
  percentage: number;
  /** The termin's share of the plan's total. */
  amount: number;
  /** The live document (not cancelled, void or deleted). */
  document: TerminDocumentView | null;
  /** The latest cancelled or void document, when the termin was generated before. */
  previous: TerminDocumentView | null;
  /** No live document, a share above 0% and the source can still be split. */
  canGenerate: boolean;
}

export interface TerminPlanView {
  id: string;
  /** What the termins are: goods receipts or invoices. */
  documentType: 'GOODS_RECEIPT' | 'INVOICE';
  /** Quotation (goods receipt termins), goods receipt (invoice termins) or none (typed invoice). */
  source: { type: 'QUOTATION' | 'GOODS_RECEIPT'; id: string; number: string | null } | null;
  currency: string;
  /** The whole source's value (quotation total, billable receipt total, typed invoice total). */
  baseTotal: number;
  totalPercentage: number;
  remainingPercentage: number;
  termins: TerminSlotView[];
  /** Termins with a live document. */
  liveCount: number;
  /** Why no termin can be generated right now (source no longer accepted / received). */
  blockedReason: string | null;
  /** No live documents: the plan can be deleted and the source used as a whole again. */
  canDelete: boolean;
  createdAt: string;
}

const INACTIVE = new Set<string>([DocumentStatus.CANCELLED, DocumentStatus.VOID]);

export function isLive(status: string): boolean {
  return !INACTIVE.has(status);
}

interface TerminDocumentRow {
  id: string;
  number: string | null;
  status: string;
  revision: number;
  issueDate: string;
  total: string;
  sequence: number;
}

/** Non-deleted documents of a plan, newest first. */
export async function planDocuments(
  manager: EntityManager,
  planId: string,
): Promise<TerminDocumentRow[]> {
  return (await manager.query(
    `SELECT id, document_number AS number, status, revision,
            to_char(issue_date, 'YYYY-MM-DD') AS "issueDate", grand_total AS total,
            termin_sequence AS sequence
       FROM documents
      WHERE termin_plan_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC`,
    [planId],
  )) as TerminDocumentRow[];
}

export async function planItems(manager: EntityManager, planId: string): Promise<TerminPlanItem[]> {
  return manager.getRepository(TerminPlanItem).find({
    where: { planId },
    order: { sequence: 'ASC' },
  });
}

/** Termin count per plan, for list rows. */
export async function terminCounts(
  manager: EntityManager,
  planIds: Array<string | null>,
): Promise<Map<string, number>> {
  const ids = [...new Set(planIds.filter((id): id is string => Boolean(id)))];
  if (ids.length === 0) return new Map();

  const rows = (await manager.query(
    `SELECT plan_id AS "planId", count(*)::int AS count
       FROM termin_plan_items WHERE plan_id = ANY($1) GROUP BY plan_id`,
    [ids],
  )) as Array<{ planId: string; count: number }>;
  return new Map(rows.map((row) => [row.planId, row.count]));
}

/** A document's own termin, with the plan's current termin count. */
export function terminRefFrom(
  document: Pick<Document, 'terminPlanId' | 'terminSequence' | 'terminPercentage'>,
  counts: Map<string, number>,
  via: TerminRef['via'] = null,
): TerminRef | null {
  if (document.terminSequence === null || document.terminSequence === undefined) {
    return null;
  }

  return {
    planId: document.terminPlanId,
    sequence: document.terminSequence,
    count: document.terminPlanId ? (counts.get(document.terminPlanId) ?? null) : null,
    percentage: Number(document.terminPercentage ?? 0),
    via,
  };
}

export async function terminRefOf(
  manager: EntityManager,
  document: Pick<Document, 'terminPlanId' | 'terminSequence' | 'terminPercentage'>,
  via: TerminRef['via'] = null,
): Promise<TerminRef | null> {
  if (document.terminSequence === null || document.terminSequence === undefined) {
    return null;
  }
  return terminRefFrom(document, await terminCounts(manager, [document.terminPlanId]), via);
}

export async function planOfSource(
  manager: EntityManager,
  sourceId: string,
  documentType: DocumentType,
): Promise<TerminPlan | null> {
  return manager.getRepository(TerminPlan).findOne({
    where: { sourceDocumentId: sourceId, documentType },
  });
}

/** The plan view of the termin plan that splits `sourceId` into `documentType` documents. */
export async function planViewOfSource(
  manager: EntityManager,
  sourceId: string,
  documentType: DocumentType,
): Promise<TerminPlanView | null> {
  const plan = await planOfSource(manager, sourceId, documentType);
  return plan ? loadTerminPlanView(manager, plan) : null;
}

export async function planViewById(
  manager: EntityManager,
  planId: string | null,
): Promise<TerminPlanView | null> {
  if (!planId) return null;
  const plan = await manager.getRepository(TerminPlan).findOne({ where: { id: planId } });
  return plan ? loadTerminPlanView(manager, plan) : null;
}

function toDocumentView(row: TerminDocumentRow): TerminDocumentView {
  return {
    id: row.id,
    number: row.number,
    status: row.status,
    revision: Number(row.revision),
    issueDate: row.issueDate,
    total: Number(row.total),
  };
}

export async function loadTerminPlanView(
  manager: EntityManager,
  plan: TerminPlan,
): Promise<TerminPlanView> {
  const [items, documents, source] = await Promise.all([
    planItems(manager, plan.id),
    planDocuments(manager, plan.id),
    plan.sourceDocumentId
      ? manager.getRepository(Document).findOne({ where: { id: plan.sourceDocumentId } })
      : null,
  ]);

  let baseTotal = new Decimal(0);
  let currency = 'IDR';
  let blockedReason: string | null = null;

  if (plan.sourceDocumentId) {
    if (!source || source.deletedAt) {
      blockedReason = 'The source document was deleted.';
    } else if (plan.documentType === DocumentType.GOODS_RECEIPT) {
      baseTotal = source.grandTotal;
      currency = source.currencyCode;
      if (source.status !== DocumentStatus.ACCEPTED) {
        blockedReason = 'The quotation is no longer accepted.';
      }
    } else {
      currency = source.currencyCode;
      const content = buildReceiptInvoice(await loadReceiptInvoiceSource(manager, source));
      baseTotal = content?.calculation.grandTotal ?? new Decimal(0);
      if (source.status !== DocumentStatus.RECEIVED) {
        blockedReason = 'The goods receipt is no longer received.';
      }
    }
  } else {
    const base = plan.basePayload as unknown as InvoicePlanBase | null;
    if (base?.invoice) {
      currency = base.currency;
      baseTotal = calculateDocument({
        items: base.invoice.items,
        taxMode: base.invoice.taxMode ?? 'EXCLUSIVE',
        discountType: base.invoice.discountType ?? 'NONE',
        discountRate: base.invoice.discountRate,
        discountAmount: base.invoice.discountAmount,
        shippingAmount: base.invoice.shippingAmount,
        additionalCharges: base.invoice.additionalCharges,
        chargesTaxRate: base.invoice.chargesTaxRate,
      }).grandTotal;
    }
  }

  const percentages = items.map((item) => item.percentage.toNumber());
  const total = totalPercentage(percentages);

  const termins = items.map((item): TerminSlotView => {
    const rows = documents.filter((row) => Number(row.sequence) === item.sequence);
    const live = rows.find((row) => isLive(row.status)) ?? null;
    const previous = rows.find((row) => !isLive(row.status)) ?? null;
    const percentage = item.percentage.toNumber();

    return {
      sequence: item.sequence,
      percentage,
      amount: moneyShare(baseTotal, terminBounds(percentages, item.sequence)).toNumber(),
      document: live ? toDocumentView(live) : null,
      previous: previous ? toDocumentView(previous) : null,
      canGenerate: !live && percentage > 0 && blockedReason === null,
    };
  });
  const liveCount = termins.filter((termin) => termin.document).length;

  return {
    id: plan.id,
    documentType: plan.documentType as 'GOODS_RECEIPT' | 'INVOICE',
    source:
      plan.sourceDocumentId && source
        ? {
            type: source.documentType === DocumentType.QUOTATION ? 'QUOTATION' : 'GOODS_RECEIPT',
            id: source.id,
            number: source.documentNumber,
          }
        : null,
    currency,
    baseTotal: baseTotal.toNumber(),
    totalPercentage: total,
    remainingPercentage: new Decimal(100).minus(total).toNumber(),
    termins,
    liveCount,
    blockedReason,
    canDelete: liveCount === 0,
    createdAt: plan.createdAt.toISOString(),
  };
}
