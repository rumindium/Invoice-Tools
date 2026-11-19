import type { TemplateTheme } from '../../../templates/template-theme';
import { type Fonts, type Frame, INK, MUTED, rule } from '../drawing';
import { decodeImage, formatMoney } from '../pdf-helpers';
import type { PricedDocument } from './model';

export {
  drawLogo,
  FAINT,
  type Fonts,
  type Frame,
  INK,
  LINE,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  rule,
  type Rule,
  SOFT,
} from '../drawing';

/**
 * Drawing kit shared by the priced-document layouts (quotations, invoices): page geometry,
 * pagination, the item table, totals rows, text sections, the signature block and footers.
 * Layouts decide the header, party block, colours, fonts and totals presentation.
 */

export const PAGE_MARGIN = 48;
export const FOOTER_Y = 806;

const SIGNATURE_WIDTH = 200;
const SIGNATURE_IMAGE_HEIGHT = 62;
export const SIGNATURE_BLOCK_HEIGHT = 132;

export interface Ctx {
  doc: PDFKit.PDFDocument;
  d: PricedDocument;
  theme: TemplateTheme;
  fonts: Fonts;
  frame: Frame;
}

export interface TableStyle {
  fontSize: number;
  headerFontSize: number;
  headerHeight: number;
  headerFill: string | null;
  headerText: string;
  headerRadius?: number;
  headerRuleTop?: { color: string; width: number } | null;
  headerRuleBottom?: { color: string; width: number } | null;
  rowRule: { color: string; width: number } | null;
  zebra: string | null;
  /** Elegant closes the table with a double rule. */
  closingDoubleRule?: string | null;
  numberColor: string;
}

export function newPage(ctx: Ctx): number {
  ctx.doc.addPage();
  return ctx.frame.top;
}

export function ensureSpace(ctx: Ctx, cursor: number, needed: number): number {
  return cursor + needed <= ctx.frame.bottom ? cursor : newPage(ctx);
}

export function companyLines(d: PricedDocument): string[] {
  return [
    d.company.address,
    [d.company.phone, d.company.email].filter(Boolean).join(' · ') || null,
    d.company.taxId ? `Tax ID ${d.company.taxId}` : null,
  ].filter((line): line is string => Boolean(line));
}

export const recipientLines = (d: PricedDocument): string[] => d.party.lines;
export const attentionLine = (d: PricedDocument): string | null => d.party.attention;
export const detailRows = (d: PricedDocument): Array<[string, string]> => d.details;
export const totalsRows = (d: PricedDocument): Array<[string, string]> => d.totals;
export const grandTotal = (d: PricedDocument): string => d.grandTotal;

interface Columns {
  number: { x: number; width: number };
  description: { x: number; width: number };
  quantity: { x: number; width: number };
  price: { x: number; width: number };
  tax: { x: number; width: number };
  amount: { x: number; width: number };
}

/** Column geometry scaled to the frame, so narrow (sidebar) layouts keep every column. */
function columnsFor(frame: Frame): Columns {
  const gap = 4;
  const width = frame.width;
  const number = 16;
  const quantity = Math.round(width * 0.115);
  const price = Math.round(width * 0.165);
  const tax = Math.round(width * 0.07);
  const amount = Math.round(width * 0.185);
  const description = width - 16 - number - quantity - price - tax - amount - gap * 5;

  let x = frame.left + 8;
  const place = (size: number) => {
    const column = { x, width: size };
    x += size + gap;
    return column;
  };

  return {
    number: place(number),
    description: place(description),
    quantity: place(quantity),
    price: place(price),
    tax: place(tax),
    amount: place(amount),
  };
}

export function drawItemsTable(ctx: Ctx, startY: number, style: TableStyle): number {
  const { doc, d, fonts, frame } = ctx;
  const columns = columnsFor(frame);
  const right = frame.left + frame.width;

  const drawHeader = (top: number): number => {
    if (style.headerFill) {
      doc.save();
      if (style.headerRadius) {
        doc.roundedRect(frame.left, top, frame.width, style.headerHeight, style.headerRadius);
      } else {
        doc.rect(frame.left, top, frame.width, style.headerHeight);
      }
      doc.fillColor(style.headerFill).fill();
      doc.restore();
    }
    if (style.headerRuleTop) {
      rule(doc, frame.left, right, top, style.headerRuleTop);
    }
    if (style.headerRuleBottom) {
      rule(doc, frame.left, right, top + style.headerHeight, style.headerRuleBottom);
    }

    const textY = top + (style.headerHeight - style.headerFontSize) / 2 + 0.5;
    doc.font(fonts.bold).fontSize(style.headerFontSize).fillColor(style.headerText);
    doc.text('#', columns.number.x, textY, { width: columns.number.width, lineBreak: false });
    doc.text('DESCRIPTION', columns.description.x, textY, { width: columns.description.width });
    doc.text('QTY', columns.quantity.x, textY, { width: columns.quantity.width, align: 'right' });
    doc.text('UNIT PRICE', columns.price.x, textY, { width: columns.price.width, align: 'right' });
    doc.text('TAX', columns.tax.x, textY, { width: columns.tax.width, align: 'right' });
    doc.text('AMOUNT', columns.amount.x, textY, { width: columns.amount.width, align: 'right' });
    return top + style.headerHeight + 8;
  };

  let cursor = drawHeader(ensureSpace(ctx, startY, 60));

  d.items.forEach((item, index) => {
    const quantity = `${item.quantity} ${item.unit}`.trim();
    const price = formatMoney(item.unitPrice, d.currency);
    const amount = formatMoney(item.lineTotal, d.currency);
    const nameHeight = doc
      .font(fonts.bold)
      .fontSize(style.fontSize)
      .heightOfString(item.name, { width: columns.description.width });
    const detailHeight = item.description
      ? doc
          .font(fonts.regular)
          .fontSize(style.fontSize - 1.5)
          .heightOfString(item.description, { width: columns.description.width }) + 1
      : 0;
    doc.font(fonts.regular).fontSize(style.fontSize);
    const valueHeight = Math.max(
      doc.heightOfString(quantity, { width: columns.quantity.width }),
      doc.heightOfString(price, { width: columns.price.width }),
      doc.heightOfString(amount, { width: columns.amount.width }),
    );
    const rowHeight = Math.max(nameHeight + detailHeight, valueHeight) + 12;

    if (cursor + rowHeight > frame.bottom) {
      cursor = drawHeader(newPage(ctx));
    }

    if (style.zebra && index % 2 === 0) {
      doc
        .save()
        .rect(frame.left, cursor - 6, frame.width, rowHeight)
        .fillColor(style.zebra)
        .fill()
        .restore();
    }

    doc.font(fonts.regular).fontSize(style.fontSize).fillColor(style.numberColor);
    doc.text(String(index + 1), columns.number.x, cursor, { width: columns.number.width });

    doc.font(fonts.bold).fontSize(style.fontSize).fillColor(INK);
    doc.text(item.name, columns.description.x, cursor, { width: columns.description.width });
    if (item.description) {
      doc
        .font(fonts.regular)
        .fontSize(style.fontSize - 1.5)
        .fillColor(MUTED)
        .text(item.description, columns.description.x, cursor + nameHeight + 1, {
          width: columns.description.width,
        });
    }

    doc.font(fonts.regular).fontSize(style.fontSize).fillColor(INK);
    doc.text(quantity, columns.quantity.x, cursor, {
      width: columns.quantity.width,
      align: 'right',
    });
    doc.text(price, columns.price.x, cursor, { width: columns.price.width, align: 'right' });
    doc.text(item.taxRate > 0 ? `${item.taxRate}%` : '—', columns.tax.x, cursor, {
      width: columns.tax.width,
      align: 'right',
    });
    doc.text(amount, columns.amount.x, cursor, { width: columns.amount.width, align: 'right' });

    cursor += rowHeight;
    if (style.rowRule) {
      rule(doc, frame.left, right, cursor - 6, style.rowRule);
    }
  });

  if (style.closingDoubleRule) {
    rule(doc, frame.left, right, cursor - 4, { color: style.closingDoubleRule, width: 0.75 });
    rule(doc, frame.left, right, cursor - 1.5, { color: style.closingDoubleRule, width: 0.75 });
  }

  return cursor + 6;
}

export interface SectionStyle {
  labelFont: string;
  labelSize: number;
  labelColor: string;
  uppercase: boolean;
  /** Optional marker drawn before the label (accent square, dash, ...). */
  marker?: (doc: PDFKit.PDFDocument, x: number, y: number) => number;
}

export function drawTextSection(
  ctx: Ctx,
  label: string,
  body: string | null,
  cursor: number,
  style: SectionStyle,
  tone?: 'danger',
): number {
  const text = body?.trim();
  if (!text) {
    return cursor;
  }
  const { doc, fonts, frame } = ctx;
  const height = doc.font(fonts.regular).fontSize(8.5).heightOfString(text, { width: frame.width });
  const top = ensureSpace(ctx, cursor, Math.min(height, 200) + 22);

  const labelX = style.marker ? style.marker(doc, frame.left, top) : frame.left;
  const danger = tone === 'danger' ? '#dc2626' : null;
  doc
    .font(style.labelFont)
    .fontSize(style.labelSize)
    .fillColor(danger ?? style.labelColor)
    .text(style.uppercase ? label.toUpperCase() : label, labelX, top, {
      width: frame.width - (labelX - frame.left),
    });
  doc
    .font(fonts.regular)
    .fontSize(8.5)
    .fillColor(danger ?? MUTED)
    .text(text, frame.left, top + style.labelSize + 5, { width: frame.width });

  return doc.y + 12;
}

/** Signature block in the bottom-right corner of the frame on the last page. */
export function drawSignature(ctx: Ctx, cursor: number, lineColor = '#9ca3af'): void {
  const { doc, d, fonts, frame } = ctx;
  const signature = d.signature;
  if (!signature) {
    return;
  }
  const imageHeight = signature.compact ? 22 : SIGNATURE_IMAGE_HEIGHT;
  const blockHeight = SIGNATURE_BLOCK_HEIGHT - (SIGNATURE_IMAGE_HEIGHT - imageHeight);
  let top = Math.max(cursor + (signature.compact ? 8 : 16), frame.bottom - blockHeight);

  if (top + blockHeight > frame.bottom) {
    newPage(ctx);
    top = frame.bottom - blockHeight;
  }

  const left = frame.left + frame.width - SIGNATURE_WIDTH;

  doc
    .font(fonts.regular)
    .fontSize(8.5)
    .fillColor(MUTED)
    .text(signature.date, left, top, { width: SIGNATURE_WIDTH, align: 'center' })
    .text(signature.greeting, left, top + 12, { width: SIGNATURE_WIDTH, align: 'center' });

  const imageTop = top + 28;
  const image = decodeImage(signature.imageDataUrl);
  if (image) {
    try {
      doc.image(image, left, imageTop, {
        fit: [SIGNATURE_WIDTH, imageHeight],
        align: 'center',
        valign: 'center',
      });
    } catch {
      // An unreadable image leaves the space blank for a wet signature.
    }
  }

  const lineY = imageTop + imageHeight + 6;
  rule(doc, left + 10, left + SIGNATURE_WIDTH - 10, lineY, { color: lineColor, width: 1 });

  doc
    .font(fonts.bold)
    .fontSize(9.5)
    .fillColor(INK)
    .text(signature.name, left, lineY + 6, {
      width: SIGNATURE_WIDTH,
      align: 'center',
    });
  doc
    .font(fonts.regular)
    .fontSize(8)
    .fillColor(MUTED)
    .text(signature.title, left, lineY + 19, {
      width: SIGNATURE_WIDTH,
      align: 'center',
    });
}

export interface FooterStyle {
  font: string;
  color: string;
  align: 'center' | 'left';
}

export function drawFooters(ctx: Ctx, style: FooterStyle): void {
  const { doc, d, frame } = ctx;
  const range = doc.bufferedPageRange();
  const footer = d.footer;

  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    // Writing below the bottom margin must not open another page.
    const bottomMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    const pageLabel = range.count > 1 ? `Page ${index + 1} of ${range.count}` : '';
    doc.font(style.font).fontSize(7.5).fillColor(style.color);
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

/** Rows after the total (paid, balance due), right-aligned; the last row is emphasised. */
export function drawSettlement(ctx: Ctx, cursor: number): number {
  const { doc, d, theme, fonts, frame } = ctx;
  if (!d.settlement.length) {
    return cursor;
  }
  const width = 240;
  const left = frame.left + frame.width - width;
  let top = ensureSpace(ctx, cursor, d.settlement.length * 15 + 6);
  d.settlement.forEach(([label, value], index) => {
    const last = index === d.settlement.length - 1;
    doc
      .font(last ? fonts.bold : fonts.regular)
      .fontSize(last ? 10 : 9)
      .fillColor(last ? theme.accentText : MUTED)
      .text(label, left, top, { width: width * 0.45 });
    doc
      .fillColor(last ? theme.accentText : INK)
      .text(value, left + width * 0.45, top, { width: width * 0.55, align: 'right' });
    top += 15;
  });
  return top + 10;
}
