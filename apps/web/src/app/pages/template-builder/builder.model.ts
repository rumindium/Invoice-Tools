/**
 * Template builder data model: a design is one page with absolutely positioned elements, in CSS
 * pixels at 96 dpi (A4 = 794 × 1123). Text may contain data fields such as `{{customer.name}}`,
 * which the builder shows as chips and fills with sample data in preview.
 */

export type DesignKind = 'invoice' | 'quotation' | 'goods-receipt';
export type ElementType = 'text' | 'shape' | 'line' | 'image' | 'table' | 'totals';
export type ShapeKind =
  'rect' | 'ellipse' | 'triangle' | 'diamond' | 'star' | 'hexagon' | 'arrow' | 'chevron';
export type ImageRole = 'logo' | 'signature' | 'image';
export type TextAlign = 'left' | 'center' | 'right' | 'justify';
export type LineDash = 'solid' | 'dashed' | 'dotted';
export type PageSize = 'A4' | 'Letter';
export type Orientation = 'portrait' | 'landscape';

export interface ElementBase {
  id: string;
  type: ElementType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, clockwise, around the element's centre. */
  rotation: number;
  /** 0–1 */
  opacity: number;
  locked: boolean;
  hidden: boolean;
  /** Elements sharing a group id are selected and moved together. */
  groupId: string | null;
}

export interface TextElement extends ElementBase {
  type: 'text';
  text: string;
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  italic: boolean;
  underline: boolean;
  uppercase: boolean;
  color: string;
  align: TextAlign;
  lineHeight: number;
  letterSpacing: number;
  /** Highlight behind the text, or null. */
  background: string | null;
}

export interface ShapeElement extends ElementBase {
  type: 'shape';
  shape: ShapeKind;
  fill: string | null;
  stroke: string | null;
  strokeWidth: number;
  /** Corner radius for rectangles. */
  radius: number;
}

export interface LineElement extends ElementBase {
  type: 'line';
  stroke: string;
  strokeWidth: number;
  dash: LineDash;
}

export interface ImageElement extends ElementBase {
  type: 'image';
  role: ImageRole;
  /** Data URL; null for a logo (the company logo) or an empty signature slot. */
  src: string | null;
  fit: 'contain' | 'cover';
  radius: number;
}

export type TableColumnKey =
  'index' | 'description' | 'quantity' | 'unit' | 'price' | 'tax' | 'amount';

export interface TableColumn {
  key: TableColumnKey;
  label: string;
  visible: boolean;
}

export interface TableElement extends ElementBase {
  type: 'table';
  fontFamily: string;
  fontSize: number;
  textColor: string;
  headerFill: string;
  headerText: string;
  stripes: boolean;
  stripeFill: string;
  borderColor: string;
  borders: 'rows' | 'grid' | 'none';
  columns: TableColumn[];
}

export type TotalsRowKey = 'subtotal' | 'discount' | 'tax' | 'total' | 'paid' | 'balance';

export interface TotalsElement extends ElementBase {
  type: 'totals';
  fontFamily: string;
  fontSize: number;
  textColor: string;
  labelColor: string;
  accentFill: string;
  accentText: string;
  rows: Record<TotalsRowKey, boolean>;
}

export type DesignElement =
  TextElement | ShapeElement | LineElement | ImageElement | TableElement | TotalsElement;

export interface PageSettings {
  size: PageSize;
  orientation: Orientation;
  background: string;
}

export interface Design {
  version: 1;
  id: string;
  name: string;
  kind: DesignKind;
  /** Brand colour used by presets and starter templates. */
  accentColor: string;
  page: PageSettings;
  elements: DesignElement[];
  createdAt: string;
  updatedAt: string;
}

export interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
}

/* ----------------------------------------------------------------------------------------------
 * Pages, fonts, colours
 * -------------------------------------------------------------------------------------------- */

const PAGE_SIZES: Record<PageSize, { width: number; height: number; label: string }> = {
  A4: { width: 794, height: 1123, label: 'A4 · 210 × 297 mm' },
  Letter: { width: 816, height: 1056, label: 'Letter · 8.5 × 11 in' },
};

export function pageDimensions(page: PageSettings): { width: number; height: number } {
  const size = PAGE_SIZES[page.size];
  return page.orientation === 'portrait'
    ? { width: size.width, height: size.height }
    : { width: size.height, height: size.width };
}

export function pageLabel(page: PageSettings): string {
  return `${PAGE_SIZES[page.size].label} · ${page.orientation}`;
}

export interface FontOption {
  key: string;
  label: string;
  stack: string;
}

export const FONTS: FontOption[] = [
  { key: 'plex', label: 'Plex Sans', stack: "'IBM Plex Sans', 'Segoe UI', system-ui, sans-serif" },
  { key: 'helvetica', label: 'Helvetica', stack: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { key: 'verdana', label: 'Verdana', stack: 'Verdana, Geneva, Tahoma, sans-serif' },
  { key: 'trebuchet', label: 'Trebuchet', stack: "'Trebuchet MS', 'Lucida Grande', sans-serif" },
  { key: 'georgia', label: 'Georgia', stack: "Georgia, 'Times New Roman', serif" },
  {
    key: 'palatino',
    label: 'Palatino',
    stack: "'Palatino Linotype', Palatino, 'Book Antiqua', Georgia, serif",
  },
  {
    key: 'garamond',
    label: 'Garamond',
    stack: "Garamond, 'EB Garamond', 'Times New Roman', serif",
  },
  {
    key: 'mono',
    label: 'Plex Mono',
    stack: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
  },
  { key: 'display', label: 'Impact', stack: "Impact, 'Arial Black', 'Helvetica Neue', sans-serif" },
  {
    key: 'script',
    label: 'Script',
    stack: "'Brush Script MT', 'Segoe Script', 'Snell Roundhand', 'URW Chancery L', cursive",
  },
];

export function fontStack(key: string): string {
  return (FONTS.find((font) => font.key === key) ?? FONTS[0]).stack;
}

/** Canva-style default swatches. */
export const PALETTE = [
  '#000000',
  '#545454',
  '#737373',
  '#a6a6a6',
  '#d9d9d9',
  '#ffffff',
  '#ff3131',
  '#ff5757',
  '#ff66c4',
  '#cb6ce6',
  '#8c52ff',
  '#5e17eb',
  '#03989e',
  '#00c2cb',
  '#5ce1e6',
  '#38b6ff',
  '#5271ff',
  '#004aad',
  '#00bf63',
  '#7ed957',
  '#c1ff72',
  '#ffde59',
  '#ffbd59',
  '#ff914d',
];

export const BRAND_COLORS = ['#2563eb', '#0f766e', '#7c3aed', '#be123c', '#b45309', '#111827'];

/* ----------------------------------------------------------------------------------------------
 * Data fields
 * -------------------------------------------------------------------------------------------- */

export interface FieldDefinition {
  token: string;
  label: string;
  group: 'Document' | 'Company' | 'Customer' | 'Signatory';
}

export const FIELDS: FieldDefinition[] = [
  { token: 'document.title', label: 'Document title', group: 'Document' },
  { token: 'document.number', label: 'Number', group: 'Document' },
  { token: 'document.date', label: 'Issue date', group: 'Document' },
  { token: 'document.dueDate', label: 'Due / valid until', group: 'Document' },
  { token: 'document.reference', label: 'Reference / PO', group: 'Document' },
  { token: 'document.currency', label: 'Currency', group: 'Document' },
  { token: 'document.total', label: 'Grand total', group: 'Document' },
  { token: 'document.balance', label: 'Balance due', group: 'Document' },
  { token: 'document.notes', label: 'Notes', group: 'Document' },
  { token: 'document.terms', label: 'Payment terms', group: 'Document' },
  { token: 'company.name', label: 'Company name', group: 'Company' },
  { token: 'company.address', label: 'Address', group: 'Company' },
  { token: 'company.phone', label: 'Phone', group: 'Company' },
  { token: 'company.email', label: 'Email', group: 'Company' },
  { token: 'company.website', label: 'Website', group: 'Company' },
  { token: 'company.taxId', label: 'Tax ID', group: 'Company' },
  { token: 'company.footer', label: 'Footer text', group: 'Company' },
  { token: 'customer.name', label: 'Customer name', group: 'Customer' },
  { token: 'customer.address', label: 'Address', group: 'Customer' },
  { token: 'customer.email', label: 'Email', group: 'Customer' },
  { token: 'customer.phone', label: 'Phone', group: 'Customer' },
  { token: 'customer.contact', label: 'Contact person', group: 'Customer' },
  { token: 'signatory.name', label: 'Signatory name', group: 'Signatory' },
  { token: 'signatory.title', label: 'Signatory title', group: 'Signatory' },
];

export const FIELD_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

export interface TextSegment {
  text: string;
  token: string | null;
}

/** Splits text into literal runs and `{{field}}` tokens. */
export function textSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = [];
  let last = 0;
  for (const match of text.matchAll(FIELD_PATTERN)) {
    if (match.index > last) {
      segments.push({ text: text.slice(last, match.index), token: null });
    }
    segments.push({ text: match[0], token: match[1] });
    last = match.index + match[0].length;
  }
  if (last < text.length) {
    segments.push({ text: text.slice(last), token: null });
  }
  return segments;
}

/** Human label for a field token: "Customer name", "Company phone", "Due / valid until". */
export function fieldLabel(token: string): string {
  const field = FIELDS.find((entry) => entry.token === token);
  if (!field) {
    return token;
  }
  if (
    field.group === 'Document' ||
    field.label.toLowerCase().startsWith(field.group.toLowerCase())
  ) {
    return field.label;
  }
  return `${field.group} ${field.label.toLowerCase()}`;
}

/* ----------------------------------------------------------------------------------------------
 * Sample data for previews
 * -------------------------------------------------------------------------------------------- */

export interface SampleRow {
  index: string;
  description: string;
  detail: string;
  quantity: string;
  unit: string;
  price: string;
  tax: string;
  amount: string;
}

export interface SampleContext {
  values: Record<string, string>;
  rows: SampleRow[];
  totals: Record<TotalsRowKey, string>;
  logoSrc: string;
  /** Fills empty signature slots (a quotation's own signature). */
  signatureSrc?: string | null;
}

export const TABLE_COLUMN_LABELS: Record<TableColumnKey, string> = {
  index: '#',
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  price: 'Unit price',
  tax: 'Tax',
  amount: 'Amount',
};

export const TOTALS_LABELS: Record<TotalsRowKey, string> = {
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax',
  total: 'Total',
  paid: 'Amount paid',
  balance: 'Balance due',
};

export const KIND_LABELS: Record<DesignKind, string> = {
  invoice: 'Invoice',
  quotation: 'Quotation',
  'goods-receipt': 'Goods receipt',
};

export function resolveText(text: string, context: SampleContext): string {
  return text.replace(FIELD_PATTERN, (match, token: string) => context.values[token] ?? match);
}

/* ----------------------------------------------------------------------------------------------
 * Element factories
 * -------------------------------------------------------------------------------------------- */

export function uid(prefix = 'el'): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return `${prefix}_${random.replace(/-/g, '').slice(0, 12)}`;
}

function base(type: ElementType, name: string, frame: Partial<Frame>): ElementBase {
  return {
    id: uid(),
    type,
    name,
    x: frame.x ?? 0,
    y: frame.y ?? 0,
    width: frame.width ?? 100,
    height: frame.height ?? 100,
    rotation: frame.rotation ?? 0,
    opacity: 1,
    locked: false,
    hidden: false,
    groupId: null,
  };
}

export function createText(
  text: string,
  frame: Partial<Frame>,
  style: Partial<Omit<TextElement, keyof ElementBase | 'text'>> = {},
  name = 'Text',
): TextElement {
  const fontSize = style.fontSize ?? 14;
  return {
    ...base('text', name, { height: Math.round(fontSize * 1.4), ...frame }),
    type: 'text',
    text,
    fontFamily: 'plex',
    fontSize,
    fontWeight: 400,
    italic: false,
    underline: false,
    uppercase: false,
    color: '#1f2937',
    align: 'left',
    lineHeight: 1.4,
    letterSpacing: 0,
    background: null,
    ...style,
  };
}

export function createShape(
  shape: ShapeKind,
  frame: Partial<Frame>,
  style: Partial<Pick<ShapeElement, 'fill' | 'stroke' | 'strokeWidth' | 'radius'>> = {},
  name = SHAPE_NAMES[shape],
): ShapeElement {
  return {
    ...base('shape', name, frame),
    type: 'shape',
    shape,
    fill: '#2563eb',
    stroke: null,
    strokeWidth: 0,
    radius: 0,
    ...style,
  };
}

export function createLine(
  frame: Partial<Frame>,
  style: Partial<Pick<LineElement, 'stroke' | 'strokeWidth' | 'dash'>> = {},
  name = 'Line',
): LineElement {
  const strokeWidth = style.strokeWidth ?? 2;
  return {
    ...base('line', name, { height: Math.max(strokeWidth, 2), ...frame }),
    type: 'line',
    stroke: '#1f2937',
    strokeWidth,
    dash: 'solid',
    ...style,
  };
}

export function createImage(
  role: ImageRole,
  src: string | null,
  frame: Partial<Frame>,
  name = role === 'logo' ? 'Company logo' : role === 'signature' ? 'Signature' : 'Image',
): ImageElement {
  return {
    ...base('image', name, frame),
    type: 'image',
    role,
    src,
    fit: 'contain',
    radius: 0,
  };
}

export function defaultColumns(): TableColumn[] {
  return (['index', 'description', 'quantity', 'unit', 'price', 'tax', 'amount'] as const).map(
    (key) => ({ key, label: TABLE_COLUMN_LABELS[key], visible: key !== 'unit' && key !== 'tax' }),
  );
}

export function createTable(
  accent: string,
  frame: Partial<Frame>,
  style: Partial<Omit<TableElement, keyof ElementBase>> = {},
): TableElement {
  return {
    ...base('table', 'Line items', { width: 714, height: 160, ...frame }),
    type: 'table',
    fontFamily: 'plex',
    fontSize: 11,
    textColor: '#1f2937',
    headerFill: accent,
    headerText: '#ffffff',
    stripes: true,
    stripeFill: '#f3f4f6',
    borderColor: '#e5e7eb',
    borders: 'rows',
    columns: defaultColumns(),
    ...style,
  };
}

export function createTotals(
  accent: string,
  frame: Partial<Frame>,
  style: Partial<Omit<TotalsElement, keyof ElementBase>> = {},
): TotalsElement {
  return {
    ...base('totals', 'Totals', { width: 280, height: 150, ...frame }),
    type: 'totals',
    fontFamily: 'plex',
    fontSize: 11,
    textColor: '#111827',
    labelColor: '#6b7280',
    accentFill: accent,
    accentText: '#ffffff',
    rows: { subtotal: true, discount: false, tax: true, total: true, paid: false, balance: true },
    ...style,
  };
}

export const SHAPE_NAMES: Record<ShapeKind, string> = {
  rect: 'Rectangle',
  ellipse: 'Circle',
  triangle: 'Triangle',
  diamond: 'Diamond',
  star: 'Star',
  hexagon: 'Hexagon',
  arrow: 'Arrow',
  chevron: 'Chevron',
};

/** SVG path (in a 100 × 100 box) for shapes that are not rectangles or ellipses. */
export const SHAPE_PATHS: Partial<Record<ShapeKind, string>> = {
  triangle: 'M50 2 L98 98 L2 98 Z',
  diamond: 'M50 2 L98 50 L50 98 L2 50 Z',
  star: 'M50 3 L62 37 L98 38 L69 59 L80 95 L50 74 L20 95 L31 59 L2 38 L38 37 Z',
  hexagon: 'M27 4 L73 4 L98 50 L73 96 L27 96 L2 50 Z',
  arrow: 'M2 36 L60 36 L60 10 L98 50 L60 90 L60 64 L2 64 Z',
  chevron: 'M2 4 L70 4 L98 50 L70 96 L2 96 L30 50 Z',
};

/* ----------------------------------------------------------------------------------------------
 * Designs
 * -------------------------------------------------------------------------------------------- */

export function blankDesign(
  kind: DesignKind,
  name = 'Untitled design',
  accent = '#2563eb',
): Design {
  const now = new Date().toISOString();
  return {
    version: 1,
    id: uid('design'),
    name,
    kind,
    accentColor: accent,
    page: { size: 'A4', orientation: 'portrait', background: '#ffffff' },
    elements: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Bounding box of a rotated frame. */
export function boundsOf(frame: Frame): {
  left: number;
  top: number;
  right: number;
  bottom: number;
} {
  const radians = (frame.rotation * Math.PI) / 180;
  const cos = Math.abs(Math.cos(radians));
  const sin = Math.abs(Math.sin(radians));
  const width = frame.width * cos + frame.height * sin;
  const height = frame.width * sin + frame.height * cos;
  const cx = frame.x + frame.width / 2;
  const cy = frame.y + frame.height / 2;
  return {
    left: cx - width / 2,
    top: cy - height / 2,
    right: cx + width / 2,
    bottom: cy + height / 2,
  };
}

export function unionBounds(
  frames: Frame[],
): { left: number; top: number; right: number; bottom: number } | null {
  if (frames.length === 0) {
    return null;
  }
  return frames.map(boundsOf).reduce((acc, next) => ({
    left: Math.min(acc.left, next.left),
    top: Math.min(acc.top, next.top),
    right: Math.max(acc.right, next.right),
    bottom: Math.max(acc.bottom, next.bottom),
  }));
}

/** Loose structural check for imported or stored designs. */
export function isDesign(value: unknown): value is Design {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const design = value as Partial<Design>;
  return (
    design.version === 1 &&
    typeof design.id === 'string' &&
    typeof design.name === 'string' &&
    (design.kind === 'invoice' || design.kind === 'quotation' || design.kind === 'goods-receipt') &&
    !!design.page &&
    Array.isArray(design.elements) &&
    design.elements.every(
      (element) =>
        element &&
        typeof element.id === 'string' &&
        ['text', 'shape', 'line', 'image', 'table', 'totals'].includes(element.type) &&
        [element.x, element.y, element.width, element.height].every(Number.isFinite),
    )
  );
}
