import type { Decimal } from '../database/decimal.transformer';
import type {
  Company,
  Customer,
  Document,
  DocumentItem,
  InvoiceFollowUp,
} from '../database/entities';
import { DocumentStatus } from '../database/entities/enums';
import { type DocumentTemplateView, LEGACY_TEMPLATE } from '../templates/template-snapshot';
import type { TerminPlanView, TerminRef } from '../termins/termin-views';
import type { RevisionState, RevisionSummary, SupersededRevision } from './revisions';
import { NO_REVISION_STATE } from './revisions';

export interface InvoiceItemView {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: string;
  discountRate: number | null;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface InvoiceContactView {
  /** Null when the attention person was typed on the source quotation. */
  id: string | null;
  name: string;
  jobTitle: string | null;
  phone: string | null;
}

export interface InvoiceCustomerView {
  id: string | null;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  contact: InvoiceContactView | null;
}

export interface InvoiceCompanyView {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  logoDataUrl: string | null;
  footerText: string | null;
  website?: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export interface InvoiceHistoryEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  revision: number | null;
  termin?: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
  at: string;
}

export interface InvoiceFollowUpView {
  id: string;
  activity: string;
  method: string;
  followUpDate: string;
  feedback: string;
  status: string;
  evidence: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowDocumentSummary {
  id: string;
  number: string | null;
  date: string;
  status: string;
}

/** One event of the quotation → goods receipt → invoice chain, oldest first. */
export interface FlowEvent {
  id: string;
  at: string;
  documentType: 'QUOTATION' | 'GOODS_RECEIPT' | 'INVOICE';
  documentId: string;
  documentNumber: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  revision: number | null;
  /** Creation events of termin documents: which termin. */
  termin: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
}

/** Where an invoice generated from a goods receipt came from, and everything that happened. */
export interface InvoiceFlowView {
  quotation: (FlowDocumentSummary & { expired: boolean; total: number; currency: string }) | null;
  goodsReceipt: FlowDocumentSummary & { acceptedQuantity: number; lineCount: number };
  invoice: FlowDocumentSummary & { total: number; currency: string };
  events: FlowEvent[];
}

export interface InvoiceTotalsView {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  shippingAmount: number;
  additionalCharges: number;
  chargesTax: number;
  grandTotal: number;
  amountPaid: number;
  balanceDue: number;
}

export interface InvoiceView {
  id: string;
  number: string | null;
  status: string;
  overdue: boolean;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  referenceNumber: string | null;
  taxMode: string;
  discountType: string;
  discountRate: number | null;
  discountAmount: number;
  customer: InvoiceCustomerView;
  company: InvoiceCompanyView;
  items: InvoiceItemView[];
  totals: InvoiceTotalsView;
  /** Layout and colour the invoice is drawn with (drafts follow the active template). */
  template: DocumentTemplateView;
  history: InvoiceHistoryEntry[];
  followUps: InvoiceFollowUpView[];
  nextStatuses: string[];
  /** Quotation → goods receipt → invoice, for invoices generated from a goods receipt. */
  flow: InvoiceFlowView | null;
  /** The payment termin this invoice bills (its own, or its termin goods receipt's). */
  termin: TerminRef | null;
  /** The invoice termin plan this invoice belongs to. */
  terminPlan: TerminPlanView | null;
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
  revisions: RevisionSummary[];
  canRevise: boolean;
  revisionBlockedBy: string | null;
  supersededRevision?: SupersededRevision;
}

export interface InvoiceListRow {
  id: string;
  number: string | null;
  status: string;
  overdue: boolean;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  customerName: string;
  total: number;
  balanceDue: number;
  revision: number;
  /** Termin invoices: "termin 2 of 3". */
  termin: TerminRef | null;
  createdAt: string;
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalThisMonth: number;
  outstandingCount: number;
  outstandingTotal: number;
  paidCount: number;
  paidTotal: number;
  draftCount: number;
  overdueCount: number;
}

export type DocumentWithCustomer = Document & { customer: Customer | null };
export type DocumentWithDetails = DocumentWithCustomer & { items: DocumentItem[] };

export function parseSnapshot<T>(value: unknown, fallback: T): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return fallback;
  }

  return { ...fallback, ...(value as Partial<T>) };
}

export function isOverdue(status: string, dueDate: string | null, balanceDue: Decimal): boolean {
  if (status !== DocumentStatus.ISSUED && status !== DocumentStatus.PARTIALLY_PAID) {
    return false;
  }

  if (!dueDate || balanceDue.lte(0)) {
    return false;
  }

  const today = new Date().toISOString().slice(0, 10);
  return dueDate.slice(0, 10) < today;
}

export function toInvoiceItemView(item: DocumentItem): InvoiceItemView {
  return {
    id: item.id,
    position: item.position,
    catalogItemId: item.catalogItemId,
    name: item.itemName,
    description: item.description,
    unit: item.unit,
    quantity: Number(item.quantity),
    unitPrice: Number(item.unitPrice),
    discountType: item.discountType,
    discountRate: item.discountRate === null ? null : Number(item.discountRate),
    discountAmount: Number(item.discountAmount),
    taxRate: Number(item.taxRate),
    taxAmount: Number(item.taxAmount),
    lineTotal: Number(item.lineTotal),
  };
}

export function toInvoiceCustomerView(document: DocumentWithCustomer): InvoiceCustomerView {
  const fallback: InvoiceCustomerView = {
    id: document.customerId,
    name: document.customer?.name ?? 'Customer',
    email: document.customer?.email ?? null,
    address: document.customer?.billingAddress
      ? ((document.customer.billingAddress as { line1?: string }).line1 ?? null)
      : null,
    phone: document.customer?.phone ?? null,
    contact: null,
  };

  return parseSnapshot<InvoiceCustomerView>(document.customerSnapshot, fallback);
}

export function toInvoiceFollowUpView(followUp: InvoiceFollowUp): InvoiceFollowUpView {
  return {
    id: followUp.id,
    activity: followUp.activity,
    method: followUp.method,
    followUpDate: followUp.followUpDate,
    feedback: followUp.feedback,
    status: followUp.status,
    evidence: followUp.evidence,
    createdByName: followUp.createdBy?.displayName ?? null,
    createdAt: followUp.createdAt.toISOString(),
    updatedAt: followUp.updatedAt.toISOString(),
  };
}

export function toInvoiceView(
  document: DocumentWithDetails,
  company: Company,
  history: InvoiceHistoryEntry[] = [],
  nextStatuses: string[] = [],
  followUps: InvoiceFollowUpView[] = [],
  flow: InvoiceFlowView | null = null,
  revisionState: RevisionState = NO_REVISION_STATE,
  template: DocumentTemplateView = LEGACY_TEMPLATE,
  termins: { termin: TerminRef | null; terminPlan: TerminPlanView | null } = {
    termin: null,
    terminPlan: null,
  },
): InvoiceView {
  const customer = toInvoiceCustomerView(document);

  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    overdue: isOverdue(document.status, document.dueDate, document.balanceDue),
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    currency: document.currencyCode,
    referenceNumber: document.referenceNumber,
    taxMode: document.taxMode,
    discountType: document.discountType,
    discountRate: document.discountRate === null ? null : Number(document.discountRate),
    discountAmount: Number(document.discountAmount),
    customer,
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
      signatoryName: company.signatoryName,
      signatoryTitle: company.signatoryTitle,
    },
    items: document.items
      .slice()
      .sort((left, right) => left.position - right.position)
      .map(toInvoiceItemView),
    totals: {
      subtotal: Number(document.subtotal),
      discountTotal: Number(document.discountTotal),
      taxTotal: Number(document.taxTotal),
      shippingAmount: Number(document.shippingAmount),
      additionalCharges: Number(document.additionalCharges),
      chargesTax: Number(document.chargesTax),
      grandTotal: Number(document.grandTotal),
      amountPaid: Number(document.amountPaid),
      balanceDue: Number(document.balanceDue),
    },
    template,
    history,
    followUps,
    nextStatuses,
    flow,
    ...termins,
    notes: document.notes,
    terms: document.terms,
    issuedAt: document.issuedAt?.toISOString() ?? null,
    voidedAt: document.voidedAt?.toISOString() ?? null,
    voidReason: document.voidReason,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    revision: document.revision,
    ...revisionState,
  };
}

export function toInvoiceListRow(
  document: DocumentWithCustomer,
  termin: TerminRef | null = null,
): InvoiceListRow {
  const customer = toInvoiceCustomerView(document);

  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    overdue: isOverdue(document.status, document.dueDate, document.balanceDue),
    issueDate: document.issueDate,
    dueDate: document.dueDate,
    currency: document.currencyCode,
    customerName: customer.name,
    total: Number(document.grandTotal),
    balanceDue: Number(document.balanceDue),
    revision: document.revision,
    termin,
    createdAt: document.createdAt.toISOString(),
  };
}
