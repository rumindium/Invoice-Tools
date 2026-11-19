import type { Company } from '../database/entities';
import type { DocumentHistoryEntry } from '../documents/document-support';
import {
  DocumentWithCustomer,
  DocumentWithDetails,
  InvoiceItemView,
  parseSnapshot,
  toInvoiceItemView,
} from '../documents/views';
import type { LinkedGoodsReceipt } from '../goods-receipts/goods-receipt-links';
import type { RevisionState, RevisionSummary, SupersededRevision } from '../documents/revisions';
import { NO_REVISION_STATE } from '../documents/revisions';
import { isExpired } from './quotation-status';
import type { TerminPlanView } from '../termins/termin-views';
import {
  type DocumentTemplateView,
  LEGACY_QUOTATION_TEMPLATE,
} from '../templates/template-snapshot';

export interface QuotationAttentionView {
  id: string | null;
  name: string;
  jobTitle: string | null;
  phone: string | null;
}

export interface QuotationRecipientView {
  id: string | null;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  attention: QuotationAttentionView | null;
}

export interface QuotationCompanyView {
  id: string;
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  logoDataUrl: string | null;
  footerText: string | null;
  website?: string | null;
}

export interface QuotationSignatureView {
  name: string | null;
  title: string | null;
  imageDataUrl: string | null;
}

/** The template a quotation is drawn with (on screen and in the PDF). */
export type QuotationTemplateView = DocumentTemplateView;

export interface QuotationTotalsView {
  subtotal: number;
  discountTotal: number;
  taxTotal: number;
  grandTotal: number;
}

export interface QuotationView {
  id: string;
  number: string | null;
  status: string;
  expired: boolean;
  issueDate: string;
  validUntil: string | null;
  currency: string;
  referenceNumber: string | null;
  taxMode: string;
  discountType: string;
  discountRate: number | null;
  discountAmount: number;
  recipient: QuotationRecipientView;
  company: QuotationCompanyView;
  items: InvoiceItemView[];
  totals: QuotationTotalsView;
  signature: QuotationSignatureView;
  template: QuotationTemplateView;
  history: DocumentHistoryEntry[];
  nextStatuses: string[];
  /** The active goods receipt generated from this quotation, if any. */
  goodsReceipt: LinkedGoodsReceipt | null;
  /** True when the quotation is accepted and has no active goods receipt or termin plan yet. */
  canCreateGoodsReceipt: boolean;
  /** Goods receipts in payment termins: the plan splitting this quotation, if any. */
  terminPlan: TerminPlanView | null;
  /** The live invoice generated from that goods receipt, if any. */
  invoice: LinkedGoodsReceipt | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Current version (1 = original). */
  revision: number;
  revisions: RevisionSummary[];
  canRevise: boolean;
  revisionBlockedBy: string | null;
  /** Set when this view is an archived older version. */
  supersededRevision?: SupersededRevision;
}

export interface QuotationListRow {
  id: string;
  number: string | null;
  status: string;
  expired: boolean;
  issueDate: string;
  validUntil: string | null;
  currency: string;
  recipientName: string;
  total: number;
  revision: number;
  createdAt: string;
}

export interface QuotationSummary {
  totalQuotations: number;
  totalThisMonth: number;
  draftCount: number;
  sentCount: number;
  openTotal: number;
  acceptedCount: number;
  acceptedTotal: number;
  rejectedCount: number;
  expiredCount: number;
}

interface StoredRecipient {
  id: string | null;
  name: string;
  email: string | null;
  address: string | null;
  phone: string | null;
  contact: QuotationAttentionView | null;
}

export function toRecipientView(document: DocumentWithCustomer): QuotationRecipientView {
  const fallback: StoredRecipient = {
    id: document.customerId,
    name: document.customer?.name ?? 'Customer',
    email: document.customer?.email ?? null,
    address: document.customer?.billingAddress
      ? ((document.customer.billingAddress as { line1?: string }).line1 ?? null)
      : null,
    phone: document.customer?.phone ?? null,
    contact: null,
  };
  const stored = parseSnapshot<StoredRecipient>(document.customerSnapshot, fallback);

  return {
    id: stored.id,
    name: stored.name,
    email: stored.email,
    address: stored.address,
    phone: stored.phone,
    attention: stored.contact ?? null,
  };
}

export function toQuotationView(
  document: DocumentWithDetails,
  company: Company,
  history: DocumentHistoryEntry[] = [],
  nextStatuses: string[] = [],
  goodsReceipt: LinkedGoodsReceipt | null = null,
  invoice: LinkedGoodsReceipt | null = null,
  revisionState: RevisionState = NO_REVISION_STATE,
  template: QuotationTemplateView = LEGACY_QUOTATION_TEMPLATE,
  terminPlan: TerminPlanView | null = null,
): QuotationView {
  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    expired: isExpired(document.status, document.validUntil),
    issueDate: document.issueDate,
    validUntil: document.validUntil,
    currency: document.currencyCode,
    referenceNumber: document.referenceNumber,
    taxMode: document.taxMode,
    discountType: document.discountType,
    discountRate: document.discountRate === null ? null : Number(document.discountRate),
    discountAmount: Number(document.discountAmount),
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
    items: document.items
      .slice()
      .sort((left, right) => left.position - right.position)
      .map(toInvoiceItemView),
    totals: {
      subtotal: Number(document.subtotal),
      discountTotal: Number(document.discountTotal),
      taxTotal: Number(document.taxTotal),
      grandTotal: Number(document.grandTotal),
    },
    signature: {
      name: document.signatureName,
      title: document.signatureTitle,
      imageDataUrl: document.signatureImage,
    },
    template,
    history,
    nextStatuses,
    goodsReceipt,
    canCreateGoodsReceipt:
      document.status === 'ACCEPTED' && goodsReceipt === null && terminPlan === null,
    terminPlan,
    invoice,
    notes: document.notes,
    terms: document.terms,
    sentAt: document.issuedAt?.toISOString() ?? null,
    createdAt: document.createdAt.toISOString(),
    updatedAt: document.updatedAt.toISOString(),
    revision: document.revision,
    ...revisionState,
  };
}

export function toQuotationListRow(document: DocumentWithCustomer): QuotationListRow {
  return {
    id: document.id,
    number: document.documentNumber,
    status: document.status,
    expired: isExpired(document.status, document.validUntil),
    issueDate: document.issueDate,
    validUntil: document.validUntil,
    currency: document.currencyCode,
    recipientName: toRecipientView(document).name,
    total: Number(document.grandTotal),
    revision: document.revision,
    createdAt: document.createdAt.toISOString(),
  };
}
