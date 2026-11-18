import type { Decimal } from '../database/decimal.transformer';
import type {
  Company,
  Customer,
  Document,
  DocumentItem,
  InvoiceFollowUp,
} from '../database/entities';
import { DocumentStatus } from '../database/entities/enums';

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
  id: string;
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
  signatoryName: string | null;
  signatoryTitle: string | null;
}

export interface InvoiceHistoryEntry {
  id: string;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
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
  history: InvoiceHistoryEntry[];
  followUps: InvoiceFollowUpView[];
  nextStatuses: string[];
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
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
    history,
    followUps,
    nextStatuses,
    notes: document.notes,
    terms: document.terms,
    issuedAt: document.issuedAt?.toISOString() ?? null,
    voidedAt: document.voidedAt?.toISOString() ?? null,
    voidReason: document.voidReason,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
  };
}

export function toInvoiceListRow(document: DocumentWithCustomer): InvoiceListRow {
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
    createdAt: document.createdAt.toISOString(),
  };
}
