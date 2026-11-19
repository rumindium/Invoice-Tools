import {
  FAINT,
  type Fonts,
  type Frame,
  INK,
  MUTED,
  rule,
  type Rule,
} from '../../documents/pdf/drawing';
import { formatDate } from '../../documents/pdf/pdf-helpers';
import { numberWithRevision } from '../../documents/revisions';
import type { TemplateTheme } from '../../templates/template-theme';
import type { GoodsReceiptView } from '../views';
import { terminText } from '../../termins/termin-math';

/**
 * Drawing kit shared by the goods receipt note (GRN) layouts: pagination, the reference
 * cells, the eight-column quantity table, the inspection statement, the three sign-offs and
 * the footers. Layouts decide the letterhead, how parties and references are presented,
 * colours, fonts and the styles passed to these helpers. No prices are printed.
 */

export const FOOTER_Y = 810;
/** The border grey of the original (Classic) goods receipt note. */
export const GRID = '#d1d5db';

export interface GrCtx {
  doc: PDFKit.PDFDocument;
  r: GoodsReceiptView;
  theme: TemplateTheme;
  fonts: Fonts;
  frame: Frame;
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}

export function goodsReceiptStatusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

/** "RECEIVED", "DRAFT", or "SUPERSEDED · VERSION 1" for archived versions. */
export function statusText(r: GoodsReceiptView): string {
  return r.supersededRevision
    ? `SUPERSEDED · VERSION ${r.supersededRevision.revision}`
    : goodsReceiptStatusLabel(r.status);
}

export const numberText = (r: GoodsReceiptView) => numberWithRevision(r.number, r.revision);

export function newPage(ctx: GrCtx): number {
  ctx.doc.addPage();
  return ctx.frame.top;
}

export function ensureSpace(ctx: GrCtx, cursor: number, needed: number): number {
  return cursor + needed <= ctx.frame.bottom ? cursor : newPage(ctx);
}

export function companyLines(r: GoodsReceiptView): string[] {
  return [
    r.company.address,
    [r.company.phone, r.company.email].filter(Boolean).join(' · ') || null,
    r.company.taxId ? `Tax ID ${r.company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));
}

export function supplierLines(r: GoodsReceiptView): string[] {
  return [
    r.company.address,
    [r.company.phone, r.company.email].filter(Boolean).join(' · ') || null,
  ].filter((line): line is string => Boolean(line));
}

export function customerLines(r: GoodsReceiptView): string[] {
  const attention = r.recipient.attention;
  return [
    attention
      ? `Attn. ${attention.name}${attention.jobTitle ? ` · ${attention.jobTitle}` : ''}`
      : null,
    r.recipient.address,
    [r.recipient.phone, r.recipient.email].filter(Boolean).join(' · ') || null,
  ].filter((line): line is string => Boolean(line));
}

/** The reference cells of a GRN in reading order: eight, and the termin of termin receipts. */
export function referenceCells(r: GoodsReceiptView): Array<[string, string]> {
  const cells: Array<[string, string]> = [
    ['GRN No.', r.number ?? 'Draft'],
    ['Receipt date', formatDate(r.receiptDate)],
    ['Quotation No.', r.source.quotationNumber ?? '—'],
    ['Quotation date', formatDate(r.source.quotationDate || null)],
    ['Customer PO / Ref.', r.source.customerReference ?? '—'],
    ['Delivery note No.', r.details.deliveryNoteNumber ?? '—'],
    ['Carrier', r.details.carrier ?? '—'],
    ['Vehicle No.', r.details.vehicleNumber ?? '—'],
  ];
  if (r.termin) cells.push(['Termin', terminText(r.termin)]);
  return cells;
}

/**
 * Grid placement of reference cells, four per row, with the receiving location (last) taking
 * the rest of its row — the whole row after eight cells, three columns after a termin cell.
 */
export function gridCell(
  index: number,
  count: number,
): { column: number; row: number; span: number } {
  const column = index % 4;
  return { column, row: Math.floor(index / 4), span: index === count - 1 ? 4 - column : 1 };
}

/** Rows the reference grid takes. */
export const gridRows = (count: number) => Math.ceil(count / 4);

export const receivingLocation = (r: GoodsReceiptView) => r.details.receivingLocation ?? '—';

// ---------------------------------------------------------------- Quantity table

export interface LineTableStyle {
  fontSize: number;
  headerFontSize: number;
  headerHeight: number;
  headerFill: string | null;
  headerText: string;
  headerRadius?: number;
  headerRuleTop?: Rule | null;
  headerRuleBottom?: Rule | null;
  /** Full cell borders (Classic); otherwise rows only. */
  grid: string | null;
  rowRule: Rule | null;
  zebra: string | null;
  numberColor: string;
  /** Colour of the accepted quantity, the figure the receipt certifies. */
  acceptedColor: string;
  total: {
    fill: string | null;
    ruleTop?: Rule | null;
    /** Elegant closes the table with a double rule. */
    doubleRule?: string | null;
    labelColor: string;
  };
}

const HEADERS = [
  '#',
  'DESCRIPTION',
  'UNIT',
  'ORDERED',
  'RECEIVED',
  'REJECTED',
  'ACCEPTED',
  'REMARKS',
];
const NUMERIC = [false, false, false, true, true, true, true, false];
/** Used when a header does not fit its column (narrow sidebar layouts). */
const ABBREVIATIONS: Record<string, string> = {
  DESCRIPTION: 'ITEM',
  ORDERED: 'ORD.',
  RECEIVED: 'RCVD',
  REJECTED: 'REJ.',
  ACCEPTED: 'ACC.',
  REMARKS: 'NOTES',
};

/** Column widths scaled to the frame, so narrow (sidebar) layouts keep every column. */
function columnWidths(width: number): number[] {
  const ratios = [0.04, 0.285, 0.085, 0.1, 0.1, 0.1, 0.1];
  const widths = ratios.map((ratio) => Math.round(width * ratio));
  widths.push(width - widths.reduce((total, value) => total + value, 0));
  return widths;
}

export function drawLinesTable(ctx: GrCtx, startY: number, style: LineTableStyle): number {
  const { doc, r, fonts, frame } = ctx;
  const widths = columnWidths(frame.width);
  const xs = widths.map((_, index) =>
    widths.slice(0, index).reduce((total, width) => total + width, frame.left),
  );
  const right = frame.left + frame.width;
  const small = style.fontSize - 0.5;

  const cellBorders = (top: number, height: number) => {
    if (!style.grid) return;
    widths.forEach((width, index) => {
      doc
        .save()
        .rect(xs[index]!, top, width, height)
        .lineWidth(0.8)
        .strokeColor(style.grid!)
        .stroke();
      doc.restore();
    });
  };

  const drawHeader = (top: number): number => {
    if (style.headerFill) {
      doc.save();
      if (style.headerRadius) {
        doc.roundedRect(frame.left, top, frame.width, style.headerHeight, style.headerRadius);
      } else {
        doc.rect(frame.left, top, frame.width, style.headerHeight);
      }
      doc.fillColor(style.headerFill).fill().restore();
    }
    cellBorders(top, style.headerHeight);
    if (style.headerRuleTop) rule(doc, frame.left, right, top, style.headerRuleTop);
    if (style.headerRuleBottom) {
      rule(doc, frame.left, right, top + style.headerHeight, style.headerRuleBottom);
    }
    const textY = top + (style.headerHeight - style.headerFontSize) / 2 + 0.5;
    doc.font(fonts.bold).fontSize(style.headerFontSize).fillColor(style.headerText);
    HEADERS.forEach((header, index) => {
      const fits = doc.widthOfString(header) <= widths[index]! - 8;
      doc.text(fits ? header : (ABBREVIATIONS[header] ?? header), xs[index]! + 4, textY, {
        width: widths[index]! - 8,
        align: NUMERIC[index] ? 'right' : 'left',
        lineBreak: false,
      });
    });
    return top + style.headerHeight;
  };

  let cursor = drawHeader(ensureSpace(ctx, startY, 60));

  r.lines.forEach((line, index) => {
    const nameHeight = doc
      .font(fonts.bold)
      .fontSize(style.fontSize)
      .heightOfString(line.name, { width: widths[1]! - 8 });
    const descriptionHeight = line.description
      ? doc
          .font(fonts.regular)
          .fontSize(small - 0.5)
          .heightOfString(line.description, { width: widths[1]! - 8 }) + 1
      : 0;
    const remarksHeight = doc
      .font(fonts.regular)
      .fontSize(small)
      .heightOfString(line.remarks ?? '', { width: widths[7]! - 8 });
    const height = Math.max(nameHeight + descriptionHeight, remarksHeight) + 12;

    if (cursor + height > frame.bottom) {
      cursor = drawHeader(newPage(ctx));
    }

    if (style.zebra && index % 2 === 1) {
      doc.save().rect(frame.left, cursor, frame.width, height).fillColor(style.zebra).fill();
      doc.restore();
    }
    cellBorders(cursor, height);

    const y = cursor + 6;
    doc.font(fonts.regular).fontSize(small).fillColor(style.numberColor);
    doc.text(String(index + 1), xs[0]! + 3, y, { width: widths[0]! - 4, lineBreak: false });
    doc.font(fonts.bold).fontSize(style.fontSize).fillColor(INK);
    doc.text(line.name, xs[1]! + 4, y, { width: widths[1]! - 8 });
    if (line.description) {
      doc
        .font(fonts.regular)
        .fontSize(small - 0.5)
        .fillColor(MUTED)
        .text(line.description, xs[1]! + 4, y + nameHeight + 1, { width: widths[1]! - 8 });
    }
    doc.font(fonts.regular).fontSize(small).fillColor(INK);
    doc.text(line.unit, xs[2]! + 4, y, { width: widths[2]! - 8 });
    const quantities = [
      line.orderedQuantity,
      line.receivedQuantity,
      line.rejectedQuantity,
      line.acceptedQuantity,
    ];
    quantities.forEach((value, offset) => {
      const accepted = offset === 3;
      doc
        .font(accepted ? fonts.bold : fonts.regular)
        .fillColor(accepted ? style.acceptedColor : INK)
        .text(formatQuantity(value), xs[3 + offset]! + 4, y, {
          width: widths[3 + offset]! - 8,
          align: 'right',
        });
    });
    doc
      .font(fonts.regular)
      .fillColor(MUTED)
      .text(line.remarks ?? '', xs[7]! + 4, y, { width: widths[7]! - 8 });

    cursor += height;
    if (style.rowRule) rule(doc, frame.left, right, cursor, style.rowRule);
  });

  // Total row.
  cursor = ensureSpace(ctx, cursor, 26);
  if (style.total.doubleRule) {
    rule(doc, frame.left, right, cursor + 1, { color: style.total.doubleRule, width: 0.75 });
    rule(doc, frame.left, right, cursor + 3.5, { color: style.total.doubleRule, width: 0.75 });
    cursor += 4;
  }
  const totalHeight = 20;
  if (style.total.fill) {
    doc.save().rect(frame.left, cursor, frame.width, totalHeight).fillColor(style.total.fill);
    doc.fill().restore();
  }
  cellBorders(cursor, totalHeight);
  if (style.total.ruleTop) rule(doc, frame.left, right, cursor, style.total.ruleTop);

  const y = cursor + 6;
  doc
    .font(fonts.bold)
    .fontSize(style.fontSize)
    .fillColor(style.total.labelColor)
    .text('TOTAL', xs[1]! + 4, y, { width: widths[1]! - 8, lineBreak: false });
  const totals = [r.totals.ordered, r.totals.received, r.totals.rejected, r.totals.accepted];
  totals.forEach((value, offset) => {
    doc
      .fillColor(offset === 3 ? style.acceptedColor : INK)
      .text(formatQuantity(value), xs[3 + offset]! + 4, y, {
        width: widths[3 + offset]! - 8,
        align: 'right',
        lineBreak: false,
      });
  });

  return cursor + totalHeight + 14;
}

// ---------------------------------------------------------------- Statement

export interface SectionStyle {
  labelFont: string;
  labelSize: number;
  labelColor: string;
  uppercase: boolean;
  marker?: (doc: PDFKit.PDFDocument, x: number, y: number) => number;
}

export const INSPECTION_STATEMENT =
  'We confirm that the goods listed above were received and inspected. Accepted quantities were ' +
  'received in good condition; rejected quantities and their reasons are noted in Remarks.';

function section(
  ctx: GrCtx,
  cursor: number,
  label: string,
  body: string,
  style: SectionStyle,
  color = MUTED,
): number {
  const { doc, fonts, frame } = ctx;
  const top = ensureSpace(ctx, cursor, 36);
  const x = style.marker ? style.marker(doc, frame.left, top) : frame.left;
  doc
    .font(style.labelFont)
    .fontSize(style.labelSize)
    .fillColor(color === MUTED ? style.labelColor : color)
    .text(style.uppercase ? label.toUpperCase() : label, x, top, {
      width: frame.width - (x - frame.left),
    });
  doc
    .font(fonts.regular)
    .fontSize(8)
    .fillColor(color)
    .text(body, frame.left, top + style.labelSize + 4, { width: frame.width });
  return doc.y + 10;
}

/** Inspection statement, notes and (for cancelled receipts) the reason. */
export function drawStatement(ctx: GrCtx, cursor: number, style: SectionStyle): number {
  const { r } = ctx;
  let top = section(ctx, cursor, 'Inspection', INSPECTION_STATEMENT, style);
  if (r.notes?.trim()) {
    top = section(ctx, top, 'Notes', r.notes.trim(), style);
  }
  if (r.status === 'CANCELLED' && r.cancelReason) {
    top = section(ctx, top, 'Cancelled', r.cancelReason, style, '#dc2626');
  }
  return top;
}

// ---------------------------------------------------------------- Sign-off

export interface SignOffStyle {
  /** Bordered boxes with a label strip, rounded cards, or plain signature lines. */
  kind: 'boxes' | 'cards' | 'lines';
  height: number;
  labelFont: string;
  labelColor: string;
  labelUppercase: boolean;
  /** Strip behind the label (boxes) or card fill (cards). */
  fill: string | null;
  border: string;
  /** Accent bar on top of each card. */
  accentBar?: string | null;
  captionFont: string;
}

export function signOffEntries(r: GoodsReceiptView): Array<[string, string | null, string | null]> {
  return [
    ['Delivered by', r.details.deliveredByName, r.company.name],
    ['Checked by', r.details.checkedByName, null],
    ['Received by', r.details.receivedByName, r.details.receivedByTitle ?? r.recipient.name],
  ];
}

/** Delivered by · Checked by · Received by, anchored to the bottom of the last page. */
export function drawSignOff(ctx: GrCtx, cursor: number, style: SignOffStyle): void {
  const { doc, r, fonts, frame } = ctx;
  let top = Math.max(cursor + 10, frame.bottom - style.height);
  if (top + style.height > frame.bottom) {
    newPage(ctx);
    top = frame.bottom - style.height;
  }

  const gap = 10;
  const width = (frame.width - gap * 2) / 3;

  signOffEntries(r).forEach(([label, name, caption], index) => {
    const x = frame.left + index * (width + gap);
    const text = style.labelUppercase ? label.toUpperCase() : label;

    if (style.kind === 'boxes') {
      doc.save().rect(x, top, width, style.height).lineWidth(0.8).strokeColor(style.border);
      doc.stroke().restore();
      if (style.fill) {
        doc.save().rect(x, top, width, 16).fillColor(style.fill).fill().restore();
      }
    } else if (style.kind === 'cards') {
      doc.save().roundedRect(x, top, width, style.height, 8);
      doc
        .fillColor(style.fill ?? '#ffffff')
        .fill()
        .restore();
      if (style.accentBar) {
        doc.save().roundedRect(x, top, width, 4, 2).fillColor(style.accentBar).fill().restore();
      }
    }

    const labelY = style.kind === 'lines' ? top + 2 : top + 5;
    doc
      .font(style.labelFont)
      .fontSize(style.kind === 'lines' ? 8 : 7.5)
      .fillColor(style.labelColor)
      .text(text, x, labelY + (style.kind === 'cards' ? 4 : 0), { width, align: 'center' });

    const lineY = top + style.height - 40;
    rule(doc, x + 14, x + width - 14, lineY, {
      color: style.kind === 'lines' ? style.border : '#9ca3af',
      width: style.kind === 'lines' ? 0.9 : 1,
    });
    doc
      .font(fonts.bold)
      .fontSize(8.5)
      .fillColor(INK)
      .text(name || '(name)', x + 6, lineY + 5, {
        width: width - 12,
        align: 'center',
        height: 11,
        ellipsis: true,
      });
    doc
      .font(style.captionFont)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(caption ?? ' ', x + 6, lineY + 17, {
        width: width - 12,
        align: 'center',
        height: 10,
        ellipsis: true,
      })
      .text('Date: ____________', x + 6, lineY + 27, { width: width - 12, align: 'center' });
  });
}

// ---------------------------------------------------------------- Footers

export interface FooterStyle {
  font: string;
  color: string;
  align: 'center' | 'left';
}

export function drawFooters(ctx: GrCtx, style: FooterStyle): void {
  const { doc, r, frame } = ctx;
  const range = doc.bufferedPageRange();
  const footer =
    r.company.footerText?.trim() ||
    `Generated with Rumindium Invoice · ${r.number ?? 'Draft'} · ref. ${r.source.quotationNumber ?? '—'}`;

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Writing below the bottom margin must not open another page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    const pageLabel = range.count > 1 ? `Page ${index + 1} of ${range.count}` : '';
    doc.font(style.font).fontSize(7).fillColor(style.color);
    if (style.align === 'left') {
      doc.text(footer, frame.left, FOOTER_Y, {
        width: frame.width - 90,
        lineBreak: false,
        ellipsis: true,
      });
      if (pageLabel) {
        doc.text(pageLabel, frame.left + frame.width - 90, FOOTER_Y, {
          width: 90,
          align: 'right',
          lineBreak: false,
        });
      }
    } else {
      doc.text(`${footer}${pageLabel ? ` · ${pageLabel}` : ''}`, frame.left, FOOTER_Y, {
        width: frame.width,
        align: 'center',
        lineBreak: false,
      });
    }
    doc.page.margins.bottom = bottomMargin;
  }
}

export { FAINT, INK, MUTED };
