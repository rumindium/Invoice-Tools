/**
 * A priced sales document (quotation, invoice) as the templated PDF layouts draw it. Each
 * document type maps its view onto this model, so the five layouts stay shared: the same
 * Classic, Modern, Minimal, Elegant or Bold look across a company's quotations and invoices.
 */

export interface PricedItem {
  name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface PricedSection {
  label: string;
  body: string | null;
  /** Voided invoices print the reason in red. */
  tone?: 'danger';
}

export interface PricedSignature {
  date: string;
  /** "Sincerely," (quotations) or "Issued by," (invoices). */
  greeting: string;
  name: string;
  title: string;
  imageDataUrl: string | null;
  /** No room for a drawn signature (invoices): a shorter block that rarely needs a new page. */
  compact?: boolean;
}

export interface PricedDocument {
  /** "QUOTATION", "INVOICE". */
  title: string;
  /** "Quotation", "Invoice" (Minimal's quiet title). */
  titleCase: string;
  /** Number with revision ("QUO/2026/0001 · Rev. 2"). */
  number: string;
  /** Printed status ("DRAFT", "EXPIRED", "OVERDUE", "SUPERSEDED · VERSION 1"). */
  status: string;
  company: {
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    logoDataUrl: string | null;
  };
  party: {
    /** "Quotation for", "Billed to" (Classic, Bold). */
    heading: string;
    /** "Prepared for", "Billed to" (Modern, Minimal, Elegant). */
    preparedHeading: string;
    name: string;
    attention: string | null;
    lines: string[];
  };
  /** Dates and references, label → value. */
  details: Array<[string, string]>;
  currency: string;
  items: PricedItem[];
  /** Subtotal, discount, tax, charges. */
  totals: Array<[string, string]>;
  grandTotal: string;
  /** Rows after the total (invoices: paid and balance due); the last one is emphasised. */
  settlement: Array<[string, string]>;
  sections: PricedSection[];
  /** Null leaves no signature block (invoices of companies without a signatory). */
  signature: PricedSignature | null;
  footer: string;
}
