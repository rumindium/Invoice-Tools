import { z } from 'zod';
import { DocumentType } from '../database/entities/enums';

/**
 * The template builder's design format (see apps/web/.../template-builder/builder.model.ts):
 * one page of absolutely positioned elements in CSS pixels at 96 dpi (A4 = 794 × 1123). Text
 * may contain data fields such as `{{customer.name}}`, filled per document.
 */

export const DESIGN_KINDS = ['invoice', 'quotation', 'goods-receipt'] as const;
export type DesignKind = (typeof DESIGN_KINDS)[number];

export const KIND_DOCUMENT_TYPE: Record<DesignKind, DocumentType> = {
  invoice: DocumentType.INVOICE,
  quotation: DocumentType.QUOTATION,
  'goods-receipt': DocumentType.GOODS_RECEIPT,
};

export function kindOf(documentType: DocumentType): DesignKind | null {
  const entry = Object.entries(KIND_DOCUMENT_TYPE).find(([, type]) => type === documentType);
  return (entry?.[0] as DesignKind | undefined) ?? null;
}

/** A data URL may hold an uploaded image or signature (already downscaled by the builder). */
export const MAX_IMAGE_DATA_URL = 4_000_000;
export const MAX_ELEMENTS = 500;

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'Colours must look like #2563eb.');
const coordinate = z.number().min(-20_000).max(20_000);
const size = z.number().min(0).max(20_000);
const id = z.string().min(1).max(64);
const font = z.string().min(1).max(32);
const imageDataUrl = z
  .string()
  .max(MAX_IMAGE_DATA_URL, 'Images must be smaller than about 3 MB.')
  .regex(
    /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/,
    'Images must be PNG, JPEG, WebP, GIF or SVG data URLs.',
  );

const base = {
  id,
  name: z.string().max(80),
  x: coordinate,
  y: coordinate,
  width: size,
  height: size,
  rotation: z.number().min(-360).max(360),
  opacity: z.number().min(0).max(1),
  locked: z.boolean(),
  hidden: z.boolean(),
  groupId: id.nullable(),
};

const textElement = z.object({
  ...base,
  type: z.literal('text'),
  text: z.string().max(5_000),
  fontFamily: font,
  fontSize: z.number().min(1).max(400),
  fontWeight: z.number().int().min(100).max(900),
  italic: z.boolean(),
  underline: z.boolean(),
  uppercase: z.boolean(),
  color: hex,
  align: z.enum(['left', 'center', 'right', 'justify']),
  lineHeight: z.number().min(0.5).max(5),
  letterSpacing: z.number().min(-20).max(200),
  background: hex.nullable(),
});

export const SHAPE_KINDS = [
  'rect',
  'ellipse',
  'triangle',
  'diamond',
  'star',
  'hexagon',
  'arrow',
  'chevron',
] as const;

const shapeElement = z.object({
  ...base,
  type: z.literal('shape'),
  shape: z.enum(SHAPE_KINDS),
  fill: hex.nullable(),
  stroke: hex.nullable(),
  strokeWidth: z.number().min(0).max(200),
  radius: z.number().min(0).max(2_000),
});

const lineElement = z.object({
  ...base,
  type: z.literal('line'),
  stroke: hex,
  strokeWidth: z.number().min(0).max(200),
  dash: z.enum(['solid', 'dashed', 'dotted']),
});

const imageElement = z.object({
  ...base,
  type: z.literal('image'),
  role: z.enum(['logo', 'signature', 'image']),
  src: imageDataUrl.nullable(),
  fit: z.enum(['contain', 'cover']),
  radius: z.number().min(0).max(2_000),
});

export const TABLE_COLUMN_KEYS = [
  'index',
  'description',
  'quantity',
  'unit',
  'price',
  'tax',
  'amount',
] as const;
export type TableColumnKey = (typeof TABLE_COLUMN_KEYS)[number];

const tableElement = z.object({
  ...base,
  type: z.literal('table'),
  fontFamily: font,
  fontSize: z.number().min(4).max(72),
  textColor: hex,
  headerFill: hex,
  headerText: hex,
  stripes: z.boolean(),
  stripeFill: hex,
  borderColor: hex,
  borders: z.enum(['rows', 'grid', 'none']),
  columns: z
    .array(
      z.object({
        key: z.enum(TABLE_COLUMN_KEYS),
        label: z.string().max(40),
        visible: z.boolean(),
      }),
    )
    .min(1)
    .max(TABLE_COLUMN_KEYS.length),
});

export const TOTALS_ROW_KEYS = ['subtotal', 'discount', 'tax', 'total', 'paid', 'balance'] as const;
export type TotalsRowKey = (typeof TOTALS_ROW_KEYS)[number];

const totalsElement = z.object({
  ...base,
  type: z.literal('totals'),
  fontFamily: font,
  fontSize: z.number().min(4).max(72),
  textColor: hex,
  labelColor: hex,
  accentFill: hex,
  accentText: hex,
  rows: z.object({
    subtotal: z.boolean(),
    discount: z.boolean(),
    tax: z.boolean(),
    total: z.boolean(),
    paid: z.boolean(),
    balance: z.boolean(),
  }),
});

export const designElementSchema = z.discriminatedUnion('type', [
  textElement,
  shapeElement,
  lineElement,
  imageElement,
  tableElement,
  totalsElement,
]);

export const pageSchema = z.object({
  size: z.enum(['A4', 'Letter']),
  orientation: z.enum(['portrait', 'landscape']),
  background: hex,
});

/** What the builder sends when it creates or saves a design. */
export const designPayloadSchema = z.object({
  name: z.string().trim().min(1, 'Give the design a name.').max(80),
  kind: z.enum(DESIGN_KINDS),
  accentColor: hex,
  page: pageSchema,
  elements: z
    .array(designElementSchema)
    .max(MAX_ELEMENTS, `A design can hold at most ${MAX_ELEMENTS} elements.`)
    .refine((elements) => new Set(elements.map((element) => element.id)).size === elements.length, {
      message: 'Element ids must be unique.',
    }),
});

export type DesignElement = z.infer<typeof designElementSchema>;
export type DesignPage = z.infer<typeof pageSchema>;
export type DesignPayload = z.infer<typeof designPayloadSchema>;
export type TextElement = z.infer<typeof textElement>;
export type ShapeElement = z.infer<typeof shapeElement>;
export type LineElement = z.infer<typeof lineElement>;
export type ImageElement = z.infer<typeof imageElement>;
export type TableElement = z.infer<typeof tableElement>;
export type TotalsElement = z.infer<typeof totalsElement>;

/** The part of a design a document needs to be drawn (stored in its template snapshot). */
export interface DesignSnapshot {
  id: string;
  name: string;
  kind: DesignKind;
  accentColor: string;
  page: DesignPage;
  elements: DesignElement[];
  revision: number;
}

/** Page size in CSS pixels (96 dpi). */
export function pageDimensions(page: DesignPage): { width: number; height: number } {
  const sizes = { A4: [794, 1123], Letter: [816, 1056] } as const;
  const [width, height] = sizes[page.size];
  return page.orientation === 'portrait' ? { width, height } : { width: height, height: width };
}

/** Parses a stored snapshot (documents keep one); null when it is not a usable design. */
export function readDesignSnapshot(value: unknown): DesignSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candidate = value as Record<string, unknown>;
  const parsed = designPayloadSchema.safeParse({
    ...candidate,
    name: candidate['name'] ?? 'Design',
  });
  if (!parsed.success || typeof candidate['id'] !== 'string') {
    return null;
  }
  return {
    id: candidate['id'],
    name: parsed.data.name,
    kind: parsed.data.kind,
    accentColor: parsed.data.accentColor.toLowerCase(),
    page: parsed.data.page,
    elements: parsed.data.elements,
    revision: typeof candidate['revision'] === 'number' ? candidate['revision'] : 1,
  };
}
