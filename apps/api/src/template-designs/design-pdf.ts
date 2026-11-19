import PDFDocument from 'pdfkit';
import SVGtoPDF from 'svg-to-pdfkit';
import { collect } from '../documents/pdf/drawing';
import { type DesignData, type DesignRow, resolveFields } from './design-data';
import {
  type DesignElement,
  type DesignSnapshot,
  type ImageElement,
  type LineElement,
  pageDimensions,
  type ShapeElement,
  type TableElement,
  type TextElement,
  type TotalsElement,
  type TotalsRowKey,
} from './design-schema';

/**
 * Draws a template-builder design as a PDF with one document's data. The design is laid out in
 * CSS pixels (96 dpi) exactly like the builder; each page is scaled to points (0.75 pt/px).
 *
 * Documents have any number of items, so the page flows around the items table: the table grows
 * (continuing on new pages with its header repeated), everything designed below it moves with it,
 * and footers (elements in the bottom band of the page) and full-height backgrounds repeat on
 * every page.
 */

const PT_PER_PX = 0.75;
const CONTINUATION_TOP = 48;
/** Elements starting this close to the bottom edge are footers. */
const FOOTER_BAND = 140;
const FOOTER_GAP = 16;
const BOTTOM_GAP = 32;
/** Text never triggers PDFKit's automatic page breaks. */
const NO_PAGE_BREAK = 1_000_000;

export interface DesignPdfInfo {
  title: string;
  subject: string;
  author: string;
}

/** SVG path outlines in a 100 × 100 box, shared with the builder's canvas. */
const SHAPE_POINTS: Record<string, Array<[number, number]>> = {
  triangle: [
    [50, 2],
    [98, 98],
    [2, 98],
  ],
  diamond: [
    [50, 2],
    [98, 50],
    [50, 98],
    [2, 50],
  ],
  star: [
    [50, 3],
    [62, 37],
    [98, 38],
    [69, 59],
    [80, 95],
    [50, 74],
    [20, 95],
    [31, 59],
    [2, 38],
    [38, 37],
  ],
  hexagon: [
    [27, 4],
    [73, 4],
    [98, 50],
    [73, 96],
    [27, 96],
    [2, 50],
  ],
  arrow: [
    [2, 36],
    [60, 36],
    [60, 10],
    [98, 50],
    [60, 90],
    [60, 64],
    [2, 64],
  ],
  chevron: [
    [2, 4],
    [70, 4],
    [98, 50],
    [70, 96],
    [2, 96],
    [30, 50],
  ],
};

const SERIF = new Set(['georgia', 'palatino', 'garamond', 'script']);
const NUMERIC = new Set(['quantity', 'price', 'tax', 'amount']);
const TOTALS_ORDER: TotalsRowKey[] = ['subtotal', 'discount', 'tax', 'total', 'paid', 'balance'];
const TOTALS_LABELS: Record<TotalsRowKey, string> = {
  subtotal: 'Subtotal',
  discount: 'Discount',
  tax: 'Tax',
  total: 'Total',
  paid: 'Amount paid',
  balance: 'Balance due',
};
const COLUMN_LABELS: Record<string, string> = {
  index: '#',
  description: 'Description',
  quantity: 'Qty',
  unit: 'Unit',
  price: 'Unit price',
  tax: 'Tax',
  amount: 'Amount',
};

/** The standard PDF font closest to a builder font. */
export function pdfFont(family: string, bold: boolean, italic: boolean): string {
  const slanted = italic || family === 'script';
  if (family === 'mono') {
    return `Courier${bold ? '-Bold' : ''}${slanted ? (bold ? 'Oblique' : '-Oblique') : ''}`;
  }
  if (SERIF.has(family)) {
    if (bold) return slanted ? 'Times-BoldItalic' : 'Times-Bold';
    return slanted ? 'Times-Italic' : 'Times-Roman';
  }
  return `Helvetica${bold ? '-Bold' : ''}${slanted ? (bold ? 'Oblique' : '-Oblique') : ''}`;
}

type Doc = PDFKit.PDFDocument;

function decodeDataUrl(src: string | null): { type: string; data: Buffer } | null {
  const match = /^data:image\/([\w+.-]+);base64,(.+)$/is.exec(src ?? '');
  if (!match) return null;
  try {
    return { type: match[1].toLowerCase(), data: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
}

/** Runs `draw` inside the element's rotation and opacity. */
function transformed(doc: Doc, element: DesignElement, draw: () => void): void {
  doc.save();
  if (element.opacity < 1) {
    doc.opacity(element.opacity);
  }
  if (element.rotation) {
    doc.rotate(element.rotation, {
      origin: [element.x + element.width / 2, element.y + element.height / 2],
    });
  }
  try {
    draw();
  } finally {
    doc.restore();
  }
}

/** Sets the font and returns the line gap and top offset that reproduce CSS line-height. */
function textMetrics(doc: Doc, font: string, size: number, lineHeight: number) {
  doc.font(font).fontSize(size);
  const natural = doc.currentLineHeight(true);
  const glyphs = doc.currentLineHeight(false);
  const target = size * lineHeight;
  return { lineGap: target - natural, offset: Math.max(0, (target - glyphs) / 2) };
}

function drawText(doc: Doc, el: TextElement, data: DesignData): void {
  let value = resolveFields(el.text, data);
  if (el.uppercase) value = value.toUpperCase();
  if (el.background) {
    doc.rect(el.x, el.y, el.width, el.height).fill(el.background);
  }
  if (!value.trim()) return;
  const font = pdfFont(el.fontFamily, el.fontWeight >= 600, el.italic);
  const { lineGap, offset } = textMetrics(doc, font, el.fontSize, el.lineHeight);
  doc.fillColor(el.color).text(value, el.x, el.y + offset, {
    width: Math.max(1, el.width),
    height: NO_PAGE_BREAK,
    align: el.align,
    lineGap,
    characterSpacing: el.letterSpacing,
    underline: el.underline,
  });
}

function paint(doc: Doc, fill: string | null, stroke: string | null, strokeWidth: number): void {
  if (fill && stroke && strokeWidth > 0) doc.fillAndStroke(fill, stroke);
  else if (fill) doc.fill(fill);
  else if (stroke && strokeWidth > 0) doc.stroke(stroke);
}

function drawShape(doc: Doc, el: ShapeElement): void {
  const strokeWidth = el.stroke ? el.strokeWidth : 0;
  doc.lineWidth(Math.max(strokeWidth, 0.01)).lineJoin('round');
  if (el.shape === 'rect' || el.shape === 'ellipse') {
    // CSS borders sit inside the box.
    const inset = strokeWidth / 2;
    const width = Math.max(0, el.width - strokeWidth);
    const height = Math.max(0, el.height - strokeWidth);
    if (el.shape === 'ellipse') {
      doc.ellipse(el.x + el.width / 2, el.y + el.height / 2, width / 2, height / 2);
    } else {
      const radius = Math.max(0, Math.min(el.radius, el.width / 2, el.height / 2) - inset);
      doc.roundedRect(el.x + inset, el.y + inset, width, height, radius);
    }
  } else {
    const points = (SHAPE_POINTS[el.shape] ?? []).map(
      ([px, py]) =>
        [el.x + (px / 100) * el.width, el.y + (py / 100) * el.height] as [number, number],
    );
    if (points.length < 3) return;
    doc.polygon(...points);
  }
  paint(doc, el.fill, el.stroke, strokeWidth);
}

function drawLine(doc: Doc, el: LineElement): void {
  const y = el.y + el.height / 2;
  const width = Math.max(el.strokeWidth, 0.01);
  doc
    .moveTo(el.x, y)
    .lineTo(el.x + el.width, y)
    .lineWidth(width)
    .strokeColor(el.stroke);
  if (el.dash === 'dashed') {
    doc.lineCap('butt').dash(width * 3, { space: width * 3 });
  } else if (el.dash === 'dotted') {
    doc.lineCap('round').dash(0.01, { space: width * 2 });
  }
  doc.stroke().undash();
}

function imageSource(el: ImageElement, data: DesignData): string | null {
  if (el.src) return el.src;
  if (el.role === 'logo') return data.logo;
  if (el.role === 'signature') return data.signature;
  return null;
}

function drawImage(doc: Doc, el: ImageElement, data: DesignData): void {
  const image = decodeDataUrl(imageSource(el, data));
  if (!image || el.width <= 0 || el.height <= 0) return;
  const { x, y, width, height } = el;
  doc.save();
  try {
    if (el.radius > 0 || el.fit === 'cover') {
      doc.roundedRect(x, y, width, height, Math.min(el.radius, width / 2, height / 2)).clip();
    }
    if (image.type === 'svg+xml') {
      SVGtoPDF(doc, image.data.toString('utf8'), x, y, {
        width,
        height,
        preserveAspectRatio: el.fit === 'cover' ? 'xMidYMid slice' : 'xMidYMid meet',
      });
    } else if (['png', 'jpeg', 'jpg'].includes(image.type)) {
      const placement =
        el.fit === 'cover'
          ? {
              cover: [width, height] as [number, number],
              align: 'center' as const,
              valign: 'center' as const,
            }
          : {
              fit: [width, height] as [number, number],
              align: 'center' as const,
              valign: 'center' as const,
            };
      doc.image(image.data, x, y, placement);
    }
    // WebP and GIF have no PDF image type; they are left out.
  } catch {
    // An unreadable image never breaks the document.
  } finally {
    doc.restore();
  }
}

/* ------------------------------------------------------------------------------ items table */

interface TableColumn {
  key: keyof DesignRow;
  label: string;
  width: number;
  numeric: boolean;
}

interface TableLayout {
  columns: TableColumn[];
  fonts: { regular: string; bold: string };
  padX: number;
  padY: number;
  headerSize: number;
  headerHeight: number;
}

function layoutTable(doc: Doc, el: TableElement, rows: DesignRow[]): TableLayout {
  const size = el.fontSize;
  const fonts = {
    regular: pdfFont(el.fontFamily, false, false),
    bold: pdfFont(el.fontFamily, true, false),
  };
  const padX = size * 0.8;
  const padY = size * 0.7;
  const headerSize = size * 0.86;
  const visible = el.columns.filter((column) => column.visible);
  const columns: TableColumn[] = visible.map((column) => {
    const label = (column.label || COLUMN_LABELS[column.key]).toUpperCase();
    doc.font(fonts.bold).fontSize(headerSize);
    let width = doc.widthOfString(label, { characterSpacing: headerSize * 0.04 });
    if (column.key !== 'description') {
      doc.font(fonts.regular).fontSize(size);
      for (const row of rows) {
        width = Math.max(width, doc.widthOfString(row[column.key]));
      }
    }
    return {
      key: column.key,
      label,
      // A little slack: PDF glyph widths round differently, and a tight fit would wrap.
      width: Math.max(width + padX * 2 + 3, column.key === 'index' ? size * 2.4 : 0),
      numeric: NUMERIC.has(column.key),
    };
  });

  const description = columns.find((column) => column.key === 'description');
  const fixed = columns.filter((column) => column !== description);
  const fixedWidth = fixed.reduce((sum, column) => sum + column.width, 0);
  if (description) {
    const minimum = el.width * 0.28;
    if (el.width - fixedWidth < minimum && fixedWidth > 0) {
      const scale = (el.width - minimum) / fixedWidth;
      fixed.forEach((column) => (column.width *= scale));
    }
    description.width = el.width - fixed.reduce((sum, column) => sum + column.width, 0);
  } else if (fixedWidth > 0) {
    const scale = el.width / fixedWidth;
    fixed.forEach((column) => (column.width *= scale));
  }

  doc.font(fonts.bold).fontSize(headerSize);
  const headerHeight = headerSize * 1.35 + padY * 2;
  return { columns, fonts, padX, padY, headerSize, headerHeight };
}

function rowHeight(doc: Doc, el: TableElement, layout: TableLayout, row: DesignRow): number {
  let height = 0;
  for (const column of layout.columns) {
    const inner = Math.max(1, column.width - layout.padX * 2);
    let cell: number;
    if (column.key === 'description') {
      doc.font(layout.fonts.bold).fontSize(el.fontSize);
      cell = doc.heightOfString(row.description || ' ', {
        width: inner,
        lineGap: el.fontSize * 0.2,
      });
      if (row.detail) {
        doc.font(layout.fonts.regular).fontSize(el.fontSize * 0.9);
        cell += 2 + doc.heightOfString(row.detail, { width: inner, lineGap: el.fontSize * 0.15 });
      }
    } else {
      doc.font(layout.fonts.regular).fontSize(el.fontSize);
      cell = doc.heightOfString(row[column.key] || ' ', {
        width: inner,
        lineGap: el.fontSize * 0.2,
      });
    }
    height = Math.max(height, cell);
  }
  return height + layout.padY * 2;
}

function drawTableHeader(doc: Doc, el: TableElement, layout: TableLayout, y: number): number {
  doc.rect(el.x, y, el.width, layout.headerHeight).fill(el.headerFill);
  let x = el.x;
  doc.font(layout.fonts.bold).fontSize(layout.headerSize).fillColor(el.headerText);
  for (const column of layout.columns) {
    doc.text(column.label, x + layout.padX, y + layout.padY, {
      width: Math.max(1, column.width - layout.padX * 2),
      height: NO_PAGE_BREAK,
      align: column.numeric ? 'right' : 'left',
      characterSpacing: layout.headerSize * 0.04,
      lineBreak: false,
    });
    x += column.width;
  }
  return y + layout.headerHeight;
}

function drawTableRow(
  doc: Doc,
  el: TableElement,
  layout: TableLayout,
  row: DesignRow,
  y: number,
  height: number,
  odd: boolean,
): void {
  if (el.stripes && odd) {
    doc.rect(el.x, y, el.width, height).fill(el.stripeFill);
  }
  let x = el.x;
  for (const column of layout.columns) {
    const inner = Math.max(1, column.width - layout.padX * 2);
    const options = {
      width: inner,
      height: NO_PAGE_BREAK,
      align: column.numeric ? ('right' as const) : ('left' as const),
      lineGap: el.fontSize * 0.2,
    };
    if (column.key === 'description') {
      doc.font(layout.fonts.bold).fontSize(el.fontSize).fillColor(el.textColor);
      doc.text(row.description, x + layout.padX, y + layout.padY, options);
      if (row.detail) {
        const nameHeight = doc.heightOfString(row.description || ' ', options);
        doc
          .font(layout.fonts.regular)
          .fontSize(el.fontSize * 0.9)
          .fillColor(el.textColor)
          .fillOpacity(0.65)
          .text(row.detail, x + layout.padX, y + layout.padY + nameHeight + 2, {
            ...options,
            lineGap: el.fontSize * 0.15,
          })
          .fillOpacity(1);
      }
    } else {
      doc.font(layout.fonts.regular).fontSize(el.fontSize).fillColor(el.textColor);
      doc.text(row[column.key], x + layout.padX, y + layout.padY, options);
    }
    if (el.borders === 'grid') {
      doc.rect(x, y, column.width, height).lineWidth(1).stroke(el.borderColor);
    }
    x += column.width;
  }
  if (el.borders === 'rows') {
    doc
      .moveTo(el.x, y + height)
      .lineTo(el.x + el.width, y + height)
      .lineWidth(1)
      .stroke(el.borderColor);
  }
}

/* ----------------------------------------------------------------------------------- totals */

function drawTotals(doc: Doc, el: TotalsElement, data: DesignData): void {
  const size = el.fontSize;
  const regular = pdfFont(el.fontFamily, false, false);
  const bold = pdfFont(el.fontFamily, true, false);
  const padX = size * 0.8;
  let y = el.y;
  for (const key of TOTALS_ORDER.filter((entry) => el.rows[entry])) {
    const value = data.totals[key] ?? '';
    const isTotal = key === 'total';
    const isBalance = key === 'balance';
    const valueSize = isTotal ? size * 1.15 : isBalance ? size * 1.1 : size;
    const padTop = isTotal || isBalance ? size * 0.7 : size * 0.45;
    const padBottom = isBalance ? size * 0.7 : size * 0.45;
    if (isTotal) {
      y += 2;
      doc
        .moveTo(el.x, y)
        .lineTo(el.x + el.width, y)
        .lineWidth(1)
        .stroke(el.textColor);
    }
    if (isBalance) y += 4;
    doc.font(bold).fontSize(valueSize);
    const lineHeight = Math.max(doc.currentLineHeight(true), size * 1.2);
    const height = padTop + lineHeight + padBottom;
    if (isBalance) {
      doc.roundedRect(el.x, y, el.width, height, 6).fill(el.accentFill);
    }
    const labelColor = isBalance ? el.accentText : el.labelColor;
    const valueColor = isBalance ? el.accentText : el.textColor;
    const labelOffset = (lineHeight - size * 1.15) / 2;
    doc
      .font(regular)
      .fontSize(size)
      .fillColor(labelColor)
      .text(TOTALS_LABELS[key], el.x + padX, y + padTop + Math.max(0, labelOffset), {
        width: el.width / 2,
        height: NO_PAGE_BREAK,
        lineBreak: false,
      });
    doc
      .font(bold)
      .fontSize(valueSize)
      .fillColor(valueColor)
      .text(value, el.x + padX, y + padTop, {
        width: el.width - padX * 2,
        height: NO_PAGE_BREAK,
        align: 'right',
        lineBreak: false,
      });
    y += height + 2;
  }
}

/* ------------------------------------------------------------------------------------ pages */

function drawElement(doc: Doc, element: DesignElement, data: DesignData): void {
  switch (element.type) {
    case 'text':
      return transformed(doc, element, () => drawText(doc, element, data));
    case 'shape':
      return transformed(doc, element, () => drawShape(doc, element));
    case 'line':
      return transformed(doc, element, () => drawLine(doc, element));
    case 'image':
      return transformed(doc, element, () => drawImage(doc, element, data));
    case 'totals':
      return transformed(doc, element, () => drawTotals(doc, element, data));
    case 'table':
      return; // drawn by the flow (it may span pages)
  }
}

function drawStamp(doc: Doc, stamp: string, width: number, height: number): void {
  doc.save();
  doc.rotate(-30, { origin: [width / 2, height / 2] });
  doc
    .font('Helvetica-Bold')
    .fontSize(Math.min(120, (width * 1.3) / Math.max(stamp.length, 4)))
    .fillColor('#dc2626')
    .fillOpacity(0.1)
    .text(stamp, 0, height / 2 - 60, {
      width,
      height: NO_PAGE_BREAK,
      align: 'center',
      lineBreak: false,
    });
  doc.restore();
}

interface Block {
  elements: DesignElement[];
  top: number;
  bottom: number;
}

/** Groups move as one block; other elements are blocks of their own. Keeps stacking order. */
function blocksOf(elements: DesignElement[]): Block[] {
  const blocks = new Map<string, Block>();
  for (const element of elements) {
    const key = element.groupId ?? element.id;
    const block = blocks.get(key) ?? { elements: [], top: Infinity, bottom: -Infinity };
    block.elements.push(element);
    block.top = Math.min(block.top, element.y);
    block.bottom = Math.max(block.bottom, element.y + element.height);
    blocks.set(key, block);
  }
  return [...blocks.values()];
}

export function renderDesignPdf(
  design: Pick<DesignSnapshot, 'page' | 'elements'>,
  data: DesignData,
  info: DesignPdfInfo,
  keywords = '',
): Promise<Buffer> {
  const { width, height } = pageDimensions(design.page);
  const doc = new PDFDocument({
    autoFirstPage: false,
    margin: 0,
    // Page 1 is revisited after the table to finish its stacking order.
    bufferPages: true,
    info: {
      Title: info.title,
      Author: info.author,
      Subject: info.subject,
      Creator: 'Rumindium Invoice',
      Keywords: keywords,
    },
  });
  const completed = collect(doc);

  const visible = design.elements.filter((element) => !element.hidden);
  const table = visible.find((element): element is TableElement => element.type === 'table');
  const isFooter = (element: DesignElement) =>
    element !== table && element.y >= height - FOOTER_BAND;
  const isBackdrop = (element: DesignElement) =>
    (element.type === 'shape' || element.type === 'image' || element.type === 'line') &&
    element.height >= height * 0.75;
  const repeating = visible.filter((element) => isFooter(element) || isBackdrop(element));
  const footerTop = Math.min(
    height - BOTTOM_GAP,
    ...visible.filter(isFooter).map((element) => element.y - FOOTER_GAP),
  );

  const startPage = (first: boolean) => {
    doc.addPage({ size: [width * PT_PER_PX, height * PT_PER_PX], margin: 0 });
    doc.scale(PT_PER_PX);
    doc.rect(0, 0, width, height).fill(design.page.background);
    if (!first) {
      for (const element of repeating) drawElement(doc, element, data);
    }
    if (data.stamp) drawStamp(doc, data.stamp, width, height);
  };

  startPage(true);

  if (!table) {
    for (const element of visible) drawElement(doc, element, data);
  } else {
    const designBottom = table.y + table.height;
    const below = visible.filter(
      (element) => element !== table && !isFooter(element) && element.y >= designBottom - 1,
    );
    const tableIndex = visible.indexOf(table);
    const onFirstPage = visible.filter((element) => !below.includes(element));

    // Page 1 in stacking order: what lies under the table, the table, then what lies above it.
    for (const element of onFirstPage.filter((element) => visible.indexOf(element) < tableIndex)) {
      drawElement(doc, element, data);
    }

    // The items table, continuing on new pages with its header repeated.
    const layout = layoutTable(doc, table, data.rows);
    let y = drawTableHeader(doc, table, layout, table.y);
    data.rows.forEach((row, index) => {
      const height = rowHeight(doc, table, layout, row);
      if (y + height > footerTop && index > 0) {
        startPage(false);
        y = drawTableHeader(doc, table, layout, CONTINUATION_TOP);
      }
      drawTableRow(doc, table, layout, row, y, height, index % 2 === 1);
      y += height;
    });
    const tableEnd = y;
    const lastTablePage = doc.bufferedPageRange().count - 1;

    const above = onFirstPage.filter((element) => visible.indexOf(element) > tableIndex);
    if (above.length > 0) {
      doc.switchToPage(0);
      for (const element of above) drawElement(doc, element, data);
      doc.switchToPage(lastTablePage);
    }

    // Everything designed below the table follows it. A block that no longer fits moves up to
    // sit just above the footer when that leaves room, otherwise to the next page (keeping its
    // layout). Grouped elements (a signature block) move together.
    const blocks = blocksOf(below).sort((a, b) => a.top - b.top);
    let delta = tableEnd - designBottom;
    let page = lastTablePage;
    let placedBottom = tableEnd;
    for (const block of blocks) {
      let shift = delta;
      if (block.bottom + shift > footerTop) {
        const pulled = footerTop - block.bottom;
        if (block.top + pulled >= placedBottom + FOOTER_GAP) {
          shift = pulled;
        } else {
          startPage(false);
          page = doc.bufferedPageRange().count - 1;
          delta = CONTINUATION_TOP - block.top;
          shift = delta;
          placedBottom = CONTINUATION_TOP;
        }
      }
      doc.switchToPage(page);
      for (const element of block.elements) {
        drawElement(doc, { ...element, y: element.y + shift }, data);
      }
      placedBottom = Math.max(placedBottom, block.bottom + shift);
    }
  }

  doc.end();
  return completed;
}
