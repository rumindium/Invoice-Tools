import { DEFAULT_COMPANY_LOGO } from '../../core/company.service';
import { formatDate, formatMoney } from '../../core/format';
import type { InvoiceSheetData } from '../../ui/invoice-sheet/invoice-sheet';
import type { QuotationSheetData } from '../../ui/quotation-sheet/quotation-sheet';
import type { GoodsReceiptSheetData } from '../../ui/goods-receipt-sheet/goods-receipt-sheet';
import type { SampleContext, SampleRow } from './builder.model';

/**
 * A real document's data in the shape a template-builder design is drawn with (the same fields
 * the API's PDF renderer fills; see apps/api/src/template-designs/design-data.ts).
 */

const text = (value: string | null | undefined) => value?.trim() ?? '';

function numberWithRevision(number: string | null, revision: number | undefined): string {
  const base = number ?? 'Draft';
  return revision && revision > 1 ? `${base} · Rev. ${revision}` : base;
}

function quantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

interface PricedItem {
  position: number;
  name: string;
  description: string | null;
  unit: string | null;
  quantity: number;
  unitPrice: number;
  taxRate: number;
}

function pricedRows(items: PricedItem[], currency: string): SampleRow[] {
  return items.map((item) => ({
    index: String(item.position),
    description: item.name,
    detail: text(item.description),
    quantity: quantity(item.quantity),
    unit: text(item.unit),
    price: formatMoney(item.unitPrice, currency),
    tax: `${quantity(item.taxRate)}%`,
    amount: formatMoney(item.quantity * item.unitPrice, currency),
  }));
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
}

function companyValues(
  company: CompanyLike,
  signatory: { name: string | null; title: string | null },
): Record<string, string> {
  return {
    'company.name': text(company.name),
    'company.address': text(company.address),
    'company.phone': text(company.phone),
    'company.email': text(company.email),
    'company.website': text(company.website),
    'company.taxId': text(company.taxId),
    'company.footer': text(company.footerText),
    'signatory.name': text(signatory.name),
    'signatory.title': text(signatory.title),
  };
}

export function invoiceDesignContext(invoice: InvoiceSheetData): SampleContext {
  const money = (value: number) => formatMoney(value, invoice.currency);
  const { totals, customer, company } = invoice;
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
      ...companyValues(company, { name: company.signatoryName, title: company.signatoryTitle }),
      'customer.name': text(customer.name),
      'customer.address': text(customer.address),
      'customer.email': text(customer.email),
      'customer.phone': text(customer.phone),
      'customer.contact': text(customer.contact?.name),
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
    logoSrc: company.logoDataUrl ?? DEFAULT_COMPANY_LOGO,
  };
}

export function quotationDesignContext(quotation: QuotationSheetData): SampleContext {
  const money = (value: number) => formatMoney(value, quotation.currency);
  const { totals, recipient, company, signature } = quotation;
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
      ...companyValues(company, signature),
      'customer.name': text(recipient.name),
      'customer.address': text(recipient.address),
      'customer.email': text(recipient.email),
      'customer.phone': text(recipient.phone),
      'customer.contact': text(recipient.attention?.name),
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
    logoSrc: company.logoDataUrl ?? DEFAULT_COMPANY_LOGO,
    signatureSrc: signature.imageDataUrl,
  };
}

/** Goods receipts list quantities: the price and tax columns stay empty. */
export function goodsReceiptDesignContext(receipt: GoodsReceiptSheetData): SampleContext {
  const { recipient, details, source, totals, company } = receipt;
  return {
    values: {
      'document.title': 'Goods receipt',
      'document.number': numberWithRevision(receipt.number, receipt.revision),
      'document.date': formatDate(receipt.receiptDate),
      'document.dueDate': formatDate(source.quotationDate),
      'document.reference': text(source.customerReference) || text(source.quotationNumber),
      'document.currency': '',
      'document.total': `${quantity(totals.accepted)} accepted`,
      'document.balance': `${quantity(totals.rejected)} rejected`,
      'document.notes': text(receipt.notes),
      'document.terms': text(details.receivingLocation),
      ...companyValues(company, { name: details.deliveredByName, title: null }),
      'customer.name': text(recipient.name),
      'customer.address': text(recipient.address),
      'customer.email': text(recipient.email),
      'customer.phone': text(recipient.phone),
      'customer.contact': text(details.receivedByName ?? recipient.attention?.name),
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
    logoSrc: company.logoDataUrl ?? DEFAULT_COMPANY_LOGO,
  };
}

/** Printed stamp over drafts, voided and cancelled documents (as on the PDF). */
export function documentStamp(status: string, superseded?: number | null): string | null {
  if (superseded) return `SUPERSEDED · V${superseded}`;
  if (status === 'DRAFT') return 'DRAFT';
  if (status === 'VOID' || status === 'CANCELLED') return status;
  return null;
}
