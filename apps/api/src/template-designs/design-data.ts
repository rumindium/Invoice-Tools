import { formatDate, formatMoney } from '../documents/pdf/pdf-helpers';
import { numberWithRevision } from '../documents/revisions';
import type { InvoiceView } from '../documents/views';
import type { GoodsReceiptView } from '../goods-receipts/views';
import type { QuotationView } from '../quotations/views';
import type { TotalsRowKey } from './design-schema';

/** One line of the items table as a design draws it. */
export interface DesignRow {
  index: string;
  description: string;
  detail: string;
  quantity: string;
  unit: string;
  price: string;
  tax: string;
  amount: string;
}

/**
 * Everything a design needs from one document: the value of every data field, the item rows,
 * the totals, the company logo and signature, and a status stamp (DRAFT, VOID) if any.
 */
export interface DesignData {
  values: Record<string, string>;
  rows: DesignRow[];
  totals: Record<TotalsRowKey, string>;
  logo: string | null;
  /** Drawn into empty signature slots (the quotation's signature). */
  signature: string | null;
  stamp: string | null;
}

interface CompanyLike {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  logoDataUrl: string | null;
  footerText: string | null;
  website?: string | null;
  signatoryName?: string | null;
  signatoryTitle?: string | null;
}

interface PartyLike {
  name: string;
  address: string | null;
  email: string | null;
  phone: string | null;
  contact: string | null;
}

interface ItemLike {
  position: number;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

const text = (value: string | null | undefined) => value?.trim() ?? '';

function companyValues(company: CompanyLike): Record<string, string> {
  return {
    'company.name': text(company.name),
    'company.address': text(company.address),
    'company.phone': text(company.phone),
    'company.email': text(company.email),
    'company.website': text(company.website),
    'company.taxId': text(company.taxId),
    'company.footer': text(company.footerText),
    'signatory.name': text(company.signatoryName),
    'signatory.title': text(company.signatoryTitle),
  };
}

function partyValues(party: PartyLike): Record<string, string> {
  return {
    'customer.name': text(party.name),
    'customer.address': text(party.address),
    'customer.email': text(party.email),
    'customer.phone': text(party.phone),
    'customer.contact': text(party.contact),
  };
}

function pricedRows(items: ItemLike[], currency: string): DesignRow[] {
  return items.map((item) => ({
    index: String(item.position),
    description: item.name,
    detail: text(item.description),
    quantity: formatQuantity(item.quantity),
    unit: text(item.unit),
    price: formatMoney(item.unitPrice, currency),
    tax: `${formatQuantity(item.taxRate)}%`,
    amount: formatMoney(item.quantity * item.unitPrice, currency),
  }));
}

function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

function stampOf(
  status: string,
  extra: { overdue?: boolean; superseded?: number } = {},
): string | null {
  if (extra.superseded) return `SUPERSEDED · V${extra.superseded}`;
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'VOID' || status === 'CANCELLED') return status;
  return null;
}

export function invoiceDesignData(invoice: InvoiceView): DesignData {
  const money = (value: number) => formatMoney(value, invoice.currency);
  const { totals } = invoice;
  const contact = invoice.customer.contact;
  return {
    values: {
      'document.title': 'Invoice',
      'document.number': numberWithRevision(invoice.number, invoice.revision),
      'document.date': formatDate(invoice.issueDate),
      'document.dueDate': formatDate(invoice.dueDate),
      'document.reference': text(invoice.referenceNumber),
      'document.currency': invoice.currency,
      'document.total': money(totals.grandTotal),
      'document.balance': money(totals.balanceDue),
      'document.notes': text(invoice.notes),
      'document.terms': text(invoice.terms),
      ...companyValues(invoice.company),
      ...partyValues({
        ...invoice.customer,
        contact: contact ? contact.name : null,
      }),
    },
    rows: pricedRows(invoice.items, invoice.currency),
    totals: {
      subtotal: money(totals.subtotal),
      discount: money(-totals.discountTotal),
      tax: money(totals.taxTotal),
      total: money(totals.grandTotal),
      paid: money(totals.amountPaid),
      balance: money(totals.balanceDue),
    },
    logo: invoice.company.logoDataUrl,
    signature: null,
    stamp: stampOf(invoice.status, { superseded: invoice.supersededRevision?.revision }),
  };
}

export function quotationDesignData(quotation: QuotationView): DesignData {
  const money = (value: number) => formatMoney(value, quotation.currency);
  const { totals, recipient } = quotation;
  return {
    values: {
      'document.title': 'Quotation',
      'document.number': numberWithRevision(quotation.number, quotation.revision),
      'document.date': formatDate(quotation.issueDate),
      'document.dueDate': formatDate(quotation.validUntil),
      'document.reference': text(quotation.referenceNumber),
      'document.currency': quotation.currency,
      'document.total': money(totals.grandTotal),
      'document.balance': money(totals.grandTotal),
      'document.notes': text(quotation.notes),
      'document.terms': text(quotation.terms),
      ...companyValues({
        ...quotation.company,
        signatoryName: quotation.signature.name,
        signatoryTitle: quotation.signature.title,
      }),
      ...partyValues({ ...recipient, contact: recipient.attention?.name ?? null }),
    },
    rows: pricedRows(quotation.items, quotation.currency),
    totals: {
      subtotal: money(totals.subtotal),
      discount: money(-totals.discountTotal),
      tax: money(totals.taxTotal),
      total: money(totals.grandTotal),
      paid: money(0),
      balance: money(totals.grandTotal),
    },
    logo: quotation.company.logoDataUrl,
    signature: quotation.signature.imageDataUrl,
    stamp: stampOf(quotation.status, { superseded: quotation.supersededRevision?.revision }),
  };
}

/** Goods receipts list quantities, not prices: price and amount columns stay empty. */
export function goodsReceiptDesignData(receipt: GoodsReceiptView): DesignData {
  const { recipient, details, source, totals } = receipt;
  const quantity = formatQuantity;
  return {
    values: {
      'document.title': 'Goods receipt',
      'document.number': numberWithRevision(receipt.number, receipt.revision),
      'document.date': formatDate(receipt.receiptDate),
      'document.dueDate': formatDate(source.quotationDate),
      'document.reference': text(source.customerReference) || text(source.quotationNumber),
      'document.currency': receipt.currency,
      'document.total': `${quantity(totals.accepted)} accepted`,
      'document.balance': `${quantity(totals.rejected)} rejected`,
      'document.notes': text(receipt.notes),
      'document.terms': text(details.receivingLocation),
      ...companyValues({
        ...receipt.company,
        signatoryName: details.deliveredByName,
        signatoryTitle: null,
      }),
      ...partyValues({
        ...recipient,
        contact: details.receivedByName ?? recipient.attention?.name ?? null,
      }),
    },
    rows: receipt.lines.map((line) => ({
      index: String(line.position),
      description: line.name,
      detail: [text(line.description), text(line.remarks)].filter(Boolean).join(' · '),
      quantity: quantity(line.receivedQuantity),
      unit: text(line.unit),
      price: '',
      tax: '',
      amount: `${quantity(line.acceptedQuantity)} accepted`,
    })),
    totals: {
      subtotal: `${quantity(totals.ordered)} ordered`,
      discount: `${quantity(totals.rejected)} rejected`,
      tax: '',
      total: `${quantity(totals.received)} received`,
      paid: '',
      balance: `${quantity(totals.accepted)} accepted`,
    },
    logo: receipt.company.logoDataUrl,
    signature: null,
    stamp: stampOf(receipt.status, { superseded: receipt.supersededRevision?.revision }),
  };
}

/** Replaces `{{field}}` tokens; unknown fields are left as they are. */
export function resolveFields(value: string, data: DesignData): string {
  return value.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (match, token: string) =>
    token in data.values ? data.values[token] : match,
  );
}
