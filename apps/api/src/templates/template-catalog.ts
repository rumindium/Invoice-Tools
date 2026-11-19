import { DocumentType } from '../database/entities/enums';

/**
 * Built-in document templates. Every document type offers the same five design families
 * (so a company's quotations, goods receipts and invoices can share one look), each drawn by that
 * document's own renderer (PDF) and sheet (web app). Companies choose one family per
 * document type and recolour it.
 */

export const TEMPLATE_KEYS = ['classic', 'modern', 'minimal', 'elegant', 'bold'] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

/** Kept for the quotation code that predates goods receipt templates. */
export const QUOTATION_TEMPLATE_KEYS = TEMPLATE_KEYS;
export type QuotationTemplateKey = TemplateKey;

export interface TemplateDefinition {
  key: TemplateKey;
  name: string;
  /** One line that tells the layouts apart in the gallery. */
  tagline: string;
  description: string;
  /** What makes this layout unique. */
  highlights: string[];
  defaultColor: string;
}

/** Suggested accent colours; any #rrggbb value is accepted. */
export const TEMPLATE_PALETTE: Array<{ name: string; color: string }> = [
  { name: 'Blue', color: '#2563eb' },
  { name: 'Indigo', color: '#4f46e5' },
  { name: 'Violet', color: '#7c3aed' },
  { name: 'Teal', color: '#0f766e' },
  { name: 'Emerald', color: '#059669' },
  { name: 'Burgundy', color: '#9f1239' },
  { name: 'Crimson', color: '#dc2626' },
  { name: 'Orange', color: '#ea580c' },
  { name: 'Gold', color: '#b7791f' },
  { name: 'Graphite', color: '#1f2937' },
];

export const QUOTATION_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'classic',
    name: 'Classic',
    tagline: 'Clean two-column letterhead',
    description:
      'The dependable business layout: logo and company details on the left, the document title on the right, and a solid total bar.',
    highlights: ['Logo left, title right', 'Grey table header', 'Solid total bar'],
    defaultColor: '#2563eb',
  },
  {
    key: 'modern',
    name: 'Modern',
    tagline: 'Full-width colour band',
    description:
      'A confident colour band carries your brand across the top, with info tiles for the dates, a coloured table header, zebra rows and a rounded total card.',
    highlights: ['Colour header band', 'Date info tiles', 'Zebra item rows'],
    defaultColor: '#4f46e5',
  },
  {
    key: 'minimal',
    name: 'Minimal',
    tagline: 'Quiet, hairline typography',
    description:
      'Generous white space and hairline rules. Colour appears only as fine accents, so the numbers do the talking.',
    highlights: ['Hairline rules only', 'Inline meta row', 'Underlined grand total'],
    defaultColor: '#0f766e',
  },
  {
    key: 'elegant',
    name: 'Elegant',
    tagline: 'Centred serif letterhead',
    description:
      'A formal, centred letterhead set in a serif typeface with double rules and an outlined total — suited to proposals and professional services.',
    highlights: ['Serif typeface', 'Centred letterhead', 'Double rules, outlined total'],
    defaultColor: '#9f1239',
  },
  {
    key: 'bold',
    name: 'Bold',
    tagline: 'Coloured sidebar',
    description:
      'A full-height colour sidebar holds your company, the customer and the key dates, leaving the page for a large title and the priced items.',
    highlights: ['Full-height sidebar', 'Large display title', 'Big total figure'],
    defaultColor: '#ea580c',
  },
];

export const GOODS_RECEIPT_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'classic',
    name: 'Classic',
    tagline: 'Bordered warehouse form',
    description:
      'The familiar goods receipt note: boxed supplier and customer panels, a ruled reference grid, a fully bordered quantity table and three boxed sign-offs.',
    highlights: ['Boxed party panels', 'Ruled reference grid', 'Bordered sign-off boxes'],
    defaultColor: '#2563eb',
  },
  {
    key: 'modern',
    name: 'Modern',
    tagline: 'Colour band with reference tiles',
    description:
      'A colour band across the top, every reference (GRN, quotation, PO, delivery note, carrier, vehicle) as a tinted tile, a coloured table header with zebra rows and rounded sign-off cards.',
    highlights: ['Colour header band', 'Reference tiles', 'Zebra quantity rows'],
    defaultColor: '#4f46e5',
  },
  {
    key: 'minimal',
    name: 'Minimal',
    tagline: 'Open layout, hairline rules',
    description:
      'No boxes at all: parties and references in quiet columns, hairline rows, an accent rule over the totals and plain signature lines.',
    highlights: ['No boxes or fills', 'Column reference list', 'Signature lines only'],
    defaultColor: '#0f766e',
  },
  {
    key: 'elegant',
    name: 'Elegant',
    tagline: 'Centred serif certificate',
    description:
      'A formal, centred serif letterhead with double rules, a framed page and italic captions — a receipt that reads like a certificate of delivery.',
    highlights: ['Serif typeface', 'Framed page, double rules', 'Italic sign-off captions'],
    defaultColor: '#9f1239',
  },
  {
    key: 'bold',
    name: 'Bold',
    tagline: 'Coloured sidebar',
    description:
      'A full-height colour sidebar holds the supplier, the customer and the key references, leaving the page for a large title, the quantities and the sign-offs.',
    highlights: ['Full-height sidebar', 'Large display title', 'Accepted total highlighted'],
    defaultColor: '#ea580c',
  },
];

export const INVOICE_TEMPLATES: TemplateDefinition[] = [
  {
    key: 'classic',
    name: 'Classic',
    tagline: 'Clean two-column letterhead',
    description:
      'The dependable invoice: logo and company details on the left, the invoice title on the right, billing details beside the dates and a solid total bar.',
    highlights: ['Logo left, title right', 'Grey table header', 'Solid total bar'],
    defaultColor: '#2563eb',
  },
  {
    key: 'modern',
    name: 'Modern',
    tagline: 'Colour band with date tiles',
    description:
      'A colour band across the top, the invoice and due dates (and source documents) as tiles, a coloured table header with zebra rows and a rounded total card.',
    highlights: ['Colour header band', 'Due-date tiles', 'Rounded total card'],
    defaultColor: '#4f46e5',
  },
  {
    key: 'minimal',
    name: 'Minimal',
    tagline: 'Quiet, hairline typography',
    description:
      'White space and hairline rules; the amount due is the only thing underlined in your colour.',
    highlights: ['Hairline rules only', 'Inline billing row', 'Underlined amount due'],
    defaultColor: '#0f766e',
  },
  {
    key: 'elegant',
    name: 'Elegant',
    tagline: 'Centred serif letterhead',
    description:
      'A formal, centred serif letterhead with double rules, a framed page and an outlined total — for professional services and retainers.',
    highlights: ['Serif typeface', 'Framed page, double rules', 'Outlined total'],
    defaultColor: '#9f1239',
  },
  {
    key: 'bold',
    name: 'Bold',
    tagline: 'Coloured sidebar',
    description:
      'A full-height colour sidebar holds your company, the billed customer and the key dates, leaving the page for a large title, the items and a big total.',
    highlights: ['Full-height sidebar', 'Large display title', 'Big total figure'],
    defaultColor: '#ea580c',
  },
];

export const DEFAULT_TEMPLATE: TemplateKey = 'classic';
export const DEFAULT_QUOTATION_TEMPLATE = DEFAULT_TEMPLATE;

/** Document types with a template catalog, by their URL segment. */
export const TEMPLATE_DOCUMENT_TYPES: Record<string, DocumentType> = {
  quotation: DocumentType.QUOTATION,
  'goods-receipt': DocumentType.GOODS_RECEIPT,
  invoice: DocumentType.INVOICE,
};

/** How the document type reads in sentences ("goods receipt"). */
export const TEMPLATE_DOCUMENT_LABELS: Partial<Record<DocumentType, string>> = {
  [DocumentType.QUOTATION]: 'quotation',
  [DocumentType.GOODS_RECEIPT]: 'goods receipt',
  [DocumentType.INVOICE]: 'invoice',
};

export function templateCatalog(documentType: DocumentType): TemplateDefinition[] {
  switch (documentType) {
    case DocumentType.QUOTATION:
      return QUOTATION_TEMPLATES;
    case DocumentType.GOODS_RECEIPT:
      return GOODS_RECEIPT_TEMPLATES;
    case DocumentType.INVOICE:
      return INVOICE_TEMPLATES;
    default:
      return [];
  }
}

/** The definition of `key` for a document type, or that type's default layout. */
export function findTemplate(
  key: string | null | undefined,
  documentType: DocumentType = DocumentType.QUOTATION,
): TemplateDefinition {
  const catalog = templateCatalog(documentType);
  const fallback = catalog.length ? catalog : QUOTATION_TEMPLATES;
  return (
    fallback.find((template) => template.key === key) ??
    fallback.find((template) => template.key === DEFAULT_TEMPLATE)!
  );
}

export function isTemplateKey(value: unknown): value is TemplateKey {
  return TEMPLATE_KEYS.includes(value as TemplateKey);
}

export const isQuotationTemplateKey = isTemplateKey;
