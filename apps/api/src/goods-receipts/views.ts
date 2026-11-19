import type { Company, Document, DocumentItem } from '../database/entities';
import type { DocumentHistoryEntry } from '../documents/document-support';
import type { LinkedDocument } from '../documents/document-links';
import type { RevisionState, RevisionSummary, SupersededRevision } from '../documents/revisions';
import { NO_REVISION_STATE } from '../documents/revisions';
import type { DocumentWithCustomer, DocumentWithDetails } from '../documents/views';
import { parseSnapshot } from '../documents/views';
import { toRecipientView, type QuotationRecipientView } from '../quotations/views';
import { type DocumentTemplateView, LEGACY_TEMPLATE } from '../templates/template-snapshot';
import type { TerminPlanView, TerminRef } from '../termins/termin-views';

/** Payment termins around a goods receipt. */
export interface GoodsReceiptTermins {
  /** The termin of its quotation this receipt is (goods receipts in termins). */
  termin: TerminRef | null;
  /** That plan: every termin receipt of the quotation. */
  terminPlan: TerminPlanView | null;
  /** The plan billing this receipt in invoice termins, if any. */
  invoiceTerminPlan: TerminPlanView | null;
}

export const NO_TERMINS: GoodsReceiptTermins = {
  termin: null,
  terminPlan: null,
  invoiceTerminPlan: null,
};

export interface GoodsReceiptSource {
  quotationId: string;
  quotationNumber: string | null;
  quotationDate: string;
  customerReference: string | null;
}

/** Header of the receipt, stored in documents.receipt_details. */
export interface ReceiptDetails {
  source: GoodsReceiptSource;
  deliveryNoteNumber: string | null;
  carrier: string | null;
  vehicleNumber: string | null;
  receivingLocation: string | null;
  deliveredByName: string | null;
  receivedByName: string | null;
  receivedByTitle: string | null;
  checkedByName: string | null;
}

export interface GoodsReceiptLineView {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  description: string | null;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;
  remarks: string | null;
}

export interface GoodsReceiptView {
  id: string;
  number: string | null;
  status: string;
  receiptDate: string;
  currency: string;
  source: GoodsReceiptSource;
  details: Omit<ReceiptDetails, 'source'>;
  recipient: QuotationRecipientView;
  company: {
    id: string;
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    logoDataUrl: string | null;
    footerText: string | null;
    website?: string | null;
  };
  lines: GoodsReceiptLineView[];
  totals: {
    ordered: number;
    received: number;
    rejected: number;
    accepted: number;
    /** Value of the accepted goods at quotation prices (for reference; not printed). */
    acceptedValue: number;
  };
  notes: string | null;
  /** Layout and colour the receipt is drawn with (drafts follow the active template). */
  template: DocumentTemplateView;
  history: DocumentHistoryEntry[];
  nextStatuses: string[];
  /** The live (not void, not deleted) invoice generated from this receipt, if any. */
  invoice: LinkedDocument | null;
  /** Received, something accepted, no live invoice and no invoice termins yet. */
  canCreateInvoice: boolean;
  /** "Create invoice" may split the bill into payment termins (not for termin receipts). */
  canSplitInvoice: boolean;
  termin: TerminRef | null;
  terminPlan: TerminPlanView | null;
  invoiceTerminPlan: TerminPlanView | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  revisions: RevisionSummary[];
  canRevise: boolean;
  revisionBlockedBy: string | null;
  supersededRevision?: SupersededRevision;
}

export interface GoodsReceiptListRow {
  id: string;
  number: string | null;
  status: string;
  receiptDate: string;
  quotationId: string;
  quotationNumber: string | null;
  recipientName: string;
  lineCount: number;
  acceptedQuantity: number;
  revision: number;
  /** Termin receipts: "termin 2 of 3". */
  termin: TerminRef | null;
  createdAt: string;
}

export interface GoodsReceiptSummary {
  totalReceipts: number;
  totalThisMonth: number;
  draftCount: number;
  receivedCount: number;
  cancelledCount: number;
  awaitingReceipt: number;
}

/** Accepted quotation without an active receipt, offered on the "new receipt" page. */
export interface GoodsReceiptSourceRow {
  id: string;
  number: string | null;
  issueDate: string;
  recipientName: string;
  itemCount: number;
  total: number;
  currency: string;
}

const EMPTY_DETAILS: ReceiptDetails = {
  source: { quotationId: '', quotationNumber: null, quotationDate: '', customerReference: null },
  deliveryNoteNumber: null,
  carrier: null,
  vehicleNumber: null,
  receivingLocation: null,
  deliveredByName: null,
  receivedByName: null,
  receivedByTitle: null,
  checkedByName: null,
};

export function receiptDetails(document: Document): ReceiptDetails {
  return parseSnapshot<ReceiptDetails>(document.receiptDetails, EMPTY_DETAILS);
}

const num = (value: { toNumber(): number } | null | undefined): number =>
  value ? value.toNumber() : 0;

export function toLineView(item: DocumentItem): GoodsReceiptLineView {
  const received = num(item.quantity);
  const rejected = num(item.rejectedQuantity);

  return {
    id: item.id,
    position: item.position,
    catalogItemId: item.catalogItemId,
    name: item.itemName,
    description: item.description,
    unit: item.unit,
    orderedQuantity: item.orderedQuantity ? num(item.orderedQuantity) : received,
    receivedQuantity: received,
    rejectedQuantity: rejected,
    acceptedQuantity: Number((received - rejected).toFixed(4)),
    remarks: item.remarks,
  };
}

function sum(lines: GoodsReceiptLineView[], pick: (line: GoodsReceiptLineView) => number): number {
  return Number(lines.reduce((total, line) => total + pick(line), 0).toFixed(4));
}

export function toGoodsReceiptView(
  document: DocumentWithDetails,
  company: Company,
  history: DocumentHistoryEntry[] = [],
  nextStatuses: string[] = [],
  invoice: LinkedDocument | null = null,
  revisionState: RevisionState = NO_REVISION_STATE,
  template: DocumentTemplateView = LEGACY_TEMPLATE,
  termins: GoodsReceiptTermins = NO_TERMINS,
): GoodsReceiptView {
  const { source, ...details } = receiptDetails(document);
  const lines = document.items
    .slice()
    .sort((left, right) => left.position - right.position)
    .map(toLineView);

  const accepted = sum(lines, (line) => line.acceptedQuantity);

  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    receiptDate: document.issueDate,
    currency: document.currencyCode,
    source,
    details,
    recipient: toRecipientView(document),
    company: {
      id: company.id,
      name: company.displayName?.trim() || company.legalName,
      address: company.addressLine1,
      email: company.email,
      phone: company.phone,
      taxId: company.taxId,
      logoDataUrl: company.logoDataUrl,
      footerText: company.footerText,
      website: company.website,
    },
    lines,
    totals: {
      ordered: sum(lines, (line) => line.orderedQuantity),
      received: sum(lines, (line) => line.receivedQuantity),
      rejected: sum(lines, (line) => line.rejectedQuantity),
      accepted,
      acceptedValue: Number(document.grandTotal),
    },
    notes: document.notes,
    template,
    history,
    nextStatuses,
    invoice,
    canCreateInvoice:
      document.status === 'RECEIVED' &&
      accepted > 0 &&
      invoice === null &&
      termins.invoiceTerminPlan === null,
    canSplitInvoice:
      document.status === 'RECEIVED' &&
      accepted > 0 &&
      invoice === null &&
      termins.invoiceTerminPlan === null &&
      document.terminSequence === null,
    ...termins,
    receivedAt: document.issuedAt?.toISOString() ?? null,
    cancelledAt: document.voidedAt?.toISOString() ?? null,
    cancelReason: document.voidReason,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    revision: document.revision,
    ...revisionState,
  };
}

export function toGoodsReceiptListRow(
  document: DocumentWithCustomer & { items?: DocumentItem[] },
  termin: TerminRef | null = null,
): GoodsReceiptListRow {
  const { source } = receiptDetails(document);
  const lines = (document.items ?? []).map(toLineView);

  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    receiptDate: document.issueDate,
    quotationId: source.quotationId,
    quotationNumber: source.quotationNumber,
    recipientName: toRecipientView(document).name,
    lineCount: lines.length,
    acceptedQuantity: sum(lines, (line) => line.acceptedQuantity),
    revision: document.revision,
    termin,
    createdAt: document.createdAt.toISOString(),
  };
}
