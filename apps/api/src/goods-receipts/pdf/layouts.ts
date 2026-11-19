import {
  drawLogo,
  FAINT,
  type Fonts,
  type Frame,
  HELVETICA,
  INK,
  LINE,
  MUTED,
  PAGE_HEIGHT,
  PAGE_WIDTH,
  rule,
  SOFT,
  TIMES,
} from '../../documents/pdf/drawing';
import type { TemplateKey } from '../../templates/template-catalog';
import type { TemplateTheme } from '../../templates/template-theme';
import {
  companyLines,
  customerLines,
  type FooterStyle,
  type GrCtx,
  GRID,
  type LineTableStyle,
  numberText,
  gridCell,
  gridRows,
  receivingLocation,
  referenceCells,
  type SectionStyle,
  type SignOffStyle,
  statusText,
  supplierLines,
} from './kit';

export interface GoodsReceiptLayout {
  key: TemplateKey;
  fonts: Fonts;
  frame: Frame;
  /** Background drawn on every page before its content (bands, frames, sidebars). */
  decorate(ctx: GrCtx, firstPage: boolean): void;
  /** Letterhead, title, parties and references on page one; returns where the table starts. */
  opening(ctx: GrCtx): number;
  table(theme: TemplateTheme): LineTableStyle;
  section(theme: TemplateTheme): SectionStyle;
  signOff(theme: TemplateTheme): SignOffStyle;
  footer(theme: TemplateTheme): FooterStyle;
}

const MARGIN = 42;
const STANDARD_FRAME: Frame = {
  left: MARGIN,
  width: PAGE_WIDTH - MARGIN * 2,
  top: MARGIN,
  bottom: 780,
};

/** Two side-by-side blocks of label, name and lines; returns the height used. */
function measureParty(ctx: GrCtx, width: number, lines: string[], size = 8): number {
  return ctx.doc
    .font(ctx.fonts.regular)
    .fontSize(size)
    .heightOfString(lines.join('\n') || ' ', { width });
}

// ---------------------------------------------------------------- Classic

/** The original goods receipt note, with the title in the accent colour. */
const classic: GoodsReceiptLayout = {
  key: 'classic',
  fonts: HELVETICA,
  frame: STANDARD_FRAME,
  decorate: () => undefined,
  opening(ctx) {
    const { doc, r, theme, fonts, frame } = ctx;
    const left = drawLogo(doc, r, frame.left, MARGIN, 42) ? frame.left + 52 : frame.left;

    doc
      .font(fonts.bold)
      .fontSize(14)
      .fillColor(INK)
      .text(r.company.name, left, MARGIN, { width: 250 });
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(companyLines(r).join('\n'), left, MARGIN + 19, { width: 250 });

    doc
      .font(fonts.bold)
      .fontSize(18)
      .fillColor(theme.accentText)
      .text('GOODS RECEIPT NOTE', frame.left, MARGIN - 2, { width: frame.width, align: 'right' });
    doc
      .font(fonts.bold)
      .fontSize(10)
      .fillColor(INK)
      .text(numberText(r), frame.left, MARGIN + 22, { width: frame.width, align: 'right' });
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(statusText(r), frame.left, MARGIN + 36, { width: frame.width, align: 'right' });

    let top = MARGIN + 66;
    rule(doc, frame.left, frame.left + frame.width, top, { color: theme.accent, width: 1.4 });
    top += 12;

    // Party boxes with a grey label strip.
    const gap = 12;
    const width = (frame.width - gap) / 2;
    const parties: Array<[string, string, string[]]> = [
      ['DELIVERED BY (SUPPLIER)', r.company.name, supplierLines(r)],
      ['RECEIVED BY (CUSTOMER)', r.recipient.name, customerLines(r)],
    ];
    const height =
      Math.max(...parties.map(([, , lines]) => measureParty(ctx, width - 16, lines))) + 44;
    parties.forEach(([label, name, lines], index) => {
      const x = frame.left + index * (width + gap);
      doc.save().rect(x, top, width, height).lineWidth(0.8).strokeColor(GRID).stroke().restore();
      doc.save().rect(x, top, width, 16).fillColor(SOFT).fill().restore();
      doc
        .font(fonts.bold)
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(label, x + 8, top + 5, { width: width - 16 });
      doc
        .font(fonts.bold)
        .fontSize(9.5)
        .fillColor(INK)
        .text(name, x + 8, top + 22, { width: width - 16 });
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(MUTED)
        .text(lines.join('\n'), x + 8, doc.y + 2, { width: width - 16 });
    });
    top += height + 10;

    // Bordered reference grid: 4 × 2 cells and the receiving location.
    const cellWidth = frame.width / 4;
    const cellHeight = 28;
    const cells = [...referenceCells(r), ['Receiving location', receivingLocation(r)]];
    cells.forEach(([label, value], index) => {
      const { column, row, span } = gridCell(index, cells.length);
      const x = frame.left + column * cellWidth;
      const y = top + row * cellHeight;
      const w = span * cellWidth;
      doc.save().rect(x, y, w, cellHeight).lineWidth(0.8).strokeColor(GRID).stroke().restore();
      doc
        .font(fonts.regular)
        .fontSize(7)
        .fillColor(FAINT)
        .text(label!.toUpperCase(), x + 6, y + 5, { width: w - 12 });
      doc
        .font(fonts.bold)
        .fontSize(8.5)
        .fillColor(INK)
        .text(value!, x + 6, y + 15, { width: w - 12, height: 11, ellipsis: true });
    });
    return top + cellHeight * gridRows(cells.length) + 14;
  },
  table: () => ({
    fontSize: 8,
    headerFontSize: 7.5,
    headerHeight: 20,
    headerFill: SOFT,
    headerText: MUTED,
    grid: GRID,
    rowRule: null,
    zebra: null,
    numberColor: INK,
    acceptedColor: INK,
    total: { fill: null, labelColor: INK },
  }),
  section: () => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 7.5,
    labelColor: FAINT,
    uppercase: true,
  }),
  signOff: () => ({
    kind: 'boxes',
    height: 104,
    labelFont: 'Helvetica-Bold',
    labelColor: MUTED,
    labelUppercase: true,
    fill: SOFT,
    border: GRID,
    captionFont: 'Helvetica',
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'center' }),
};

// ---------------------------------------------------------------- Modern

const MODERN_BAND = 116;

const modern: GoodsReceiptLayout = {
  key: 'modern',
  fonts: HELVETICA,
  frame: { ...STANDARD_FRAME, top: MARGIN + 8, bottom: 772 },
  decorate(ctx, firstPage) {
    const { doc, theme } = ctx;
    doc.save();
    if (firstPage) {
      doc.rect(0, 0, PAGE_WIDTH, MODERN_BAND).fillColor(theme.accent).fill();
      doc
        .polygon(
          [PAGE_WIDTH - 220, 0],
          [PAGE_WIDTH, 0],
          [PAGE_WIDTH, MODERN_BAND],
          [PAGE_WIDTH - 160, MODERN_BAND],
        )
        .fillColor(theme.accentDeep)
        .fillOpacity(0.35)
        .fill();
    } else {
      doc.rect(0, 0, PAGE_WIDTH, 8).fillColor(theme.accent).fill();
    }
    doc
      .fillOpacity(1)
      .rect(0, PAGE_HEIGHT - 8, PAGE_WIDTH, 8)
      .fillColor(theme.accent)
      .fill();
    doc.restore();
  },
  opening(ctx) {
    const { doc, r, theme, fonts, frame } = ctx;
    const backdrop = { padding: 6, radius: 10, color: '#ffffff' };
    const textLeft = drawLogo(doc, r, frame.left + 6, 32, 42, backdrop)
      ? frame.left + 66
      : frame.left;

    doc
      .font(fonts.bold)
      .fontSize(15)
      .fillColor(theme.onAccent)
      .text(r.company.name, textLeft, 32, { width: 240 });
    doc
      .save()
      .fillOpacity(0.85)
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(theme.onAccent)
      .text(companyLines(r).join('\n'), textLeft, doc.y + 3, { width: 240, height: 44 })
      .restore();

    doc
      .font(fonts.bold)
      .fontSize(20)
      .fillColor(theme.onAccent)
      .text('GOODS RECEIPT NOTE', frame.left, 32, { width: frame.width, align: 'right' });
    doc
      .font(fonts.regular)
      .fontSize(9.5)
      .text(numberText(r), frame.left, 58, { width: frame.width, align: 'right' });
    const status = statusText(r);
    doc.font(fonts.bold).fontSize(7.5);
    const pillWidth = doc.widthOfString(status) + 16;
    const pillLeft = frame.left + frame.width - pillWidth;
    doc.save().roundedRect(pillLeft, 76, pillWidth, 16, 8).lineWidth(1);
    doc.strokeColor(theme.onAccent).stroke().restore();
    doc
      .fillColor(theme.onAccent)
      .text(status, pillLeft, 80.5, { width: pillWidth, align: 'center', lineBreak: false });

    // Party cards with an accent bar.
    let top = MODERN_BAND + 20;
    const gap = 12;
    const width = (frame.width - gap) / 2;
    const parties: Array<[string, string, string[]]> = [
      ['DELIVERED BY (SUPPLIER)', r.company.name, supplierLines(r)],
      ['RECEIVED BY (CUSTOMER)', r.recipient.name, customerLines(r)],
    ];
    const height =
      Math.max(...parties.map(([, , lines]) => measureParty(ctx, width - 24, lines))) + 38;
    parties.forEach(([label, name, lines], index) => {
      const x = frame.left + index * (width + gap);
      doc.save().roundedRect(x, top, width, height, 8).fillColor(theme.tint).fill().restore();
      doc
        .save()
        .rect(x, top + 10, 3, height - 20)
        .fillColor(theme.accent)
        .fill()
        .restore();
      doc
        .font(fonts.bold)
        .fontSize(7)
        .fillColor(theme.accentText)
        .text(label, x + 14, top + 10, { width: width - 24 });
      doc
        .font(fonts.bold)
        .fontSize(10)
        .fillColor(INK)
        .text(name, x + 14, top + 21, { width: width - 24 });
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(MUTED)
        .text(lines.join('\n'), x + 14, doc.y + 2, { width: width - 24 });
    });
    top += height + 12;

    // Reference tiles: 4 per row, then the receiving location across.
    const tileGap = 8;
    const tileWidth = (frame.width - tileGap * 3) / 4;
    const tileHeight = 32;
    const cells = [...referenceCells(r), ['Receiving location', receivingLocation(r)]];
    cells.forEach(([label, value], index) => {
      const { column, row, span } = gridCell(index, cells.length);
      const x = frame.left + column * (tileWidth + tileGap);
      const y = top + row * (tileHeight + tileGap);
      const w = span * tileWidth + (span - 1) * tileGap;
      doc.save().roundedRect(x, y, w, tileHeight, 6).fillColor(theme.tint).fill().restore();
      doc
        .font(fonts.bold)
        .fontSize(6.5)
        .fillColor(theme.accentText)
        .text(label!.toUpperCase(), x + 9, y + 6, { width: w - 18, lineBreak: false });
      doc
        .font(fonts.bold)
        .fontSize(8.5)
        .fillColor(INK)
        .text(value!, x + 9, y + 17, { width: w - 18, height: 11, ellipsis: true });
    });
    return top + (tileHeight + tileGap) * gridRows(cells.length) + 8;
  },
  table: (theme) => ({
    fontSize: 8,
    headerFontSize: 7,
    headerHeight: 22,
    headerFill: theme.accent,
    headerText: theme.onAccent,
    headerRadius: 5,
    grid: null,
    rowRule: null,
    zebra: theme.tint,
    numberColor: theme.accentText,
    acceptedColor: theme.accentText,
    total: { fill: theme.soft, labelColor: theme.accentText },
  }),
  section: (theme) => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 7.5,
    labelColor: theme.accentText,
    uppercase: true,
    marker: (doc, x, y) => {
      doc
        .save()
        .roundedRect(x, y + 0.5, 6, 6, 1.5)
        .fillColor(theme.accent)
        .fill()
        .restore();
      return x + 11;
    },
  }),
  signOff: (theme) => ({
    kind: 'cards',
    height: 104,
    labelFont: 'Helvetica-Bold',
    labelColor: theme.accentText,
    labelUppercase: true,
    fill: theme.tint,
    border: LINE,
    accentBar: theme.accent,
    captionFont: 'Helvetica',
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'center' }),
};

// ---------------------------------------------------------------- Minimal

const minimal: GoodsReceiptLayout = {
  key: 'minimal',
  fonts: HELVETICA,
  frame: { left: 56, width: PAGE_WIDTH - 112, top: 56, bottom: 780 },
  decorate: () => undefined,
  opening(ctx) {
    const { doc, r, theme, fonts, frame } = ctx;
    const top = 56;
    const textLeft = drawLogo(doc, r, frame.left, top, 26) ? frame.left + 36 : frame.left;

    doc
      .font(fonts.bold)
      .fontSize(10.5)
      .fillColor(INK)
      .text(r.company.name, textLeft, top, { width: 250 });
    doc
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(MUTED)
      .text(companyLines(r).join('\n'), textLeft, doc.y + 3, { width: 250 });
    const companyBottom = doc.y;

    doc.font(fonts.regular).fontSize(20);
    const titleWidth = doc.widthOfString('Goods receipt');
    const titleLeft = frame.left + frame.width - titleWidth;
    doc
      .save()
      .circle(titleLeft - 10, top + 10, 3.2)
      .fillColor(theme.accent)
      .fill()
      .restore();
    doc.fillColor(INK).text('Goods receipt', titleLeft, top - 2, { lineBreak: false });
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(`${numberText(r)}  ·  ${statusText(r)}`, frame.left, top + 26, {
        width: frame.width,
        align: 'right',
      });

    let cursor = Math.max(companyBottom, top + 40) + 20;
    rule(doc, frame.left, frame.left + frame.width, cursor, { color: LINE, width: 0.5 });
    cursor += 14;

    const label = (text: string, x: number, y: number, width: number) =>
      doc
        .font(fonts.regular)
        .fontSize(6.5)
        .fillColor(FAINT)
        .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8 });

    // Parties as two quiet columns.
    const half = (frame.width - 24) / 2;
    const parties: Array<[string, string, string[]]> = [
      ['Delivered by', r.company.name, supplierLines(r)],
      ['Received by', r.recipient.name, customerLines(r)],
    ];
    let partiesBottom = cursor;
    parties.forEach(([title, name, lines], index) => {
      const x = frame.left + index * (half + 24);
      label(title, x, cursor, half);
      doc
        .font(fonts.bold)
        .fontSize(9.5)
        .fillColor(INK)
        .text(name, x, cursor + 11, { width: half });
      doc
        .font(fonts.regular)
        .fontSize(7.5)
        .fillColor(MUTED)
        .text(lines.join('\n'), x, doc.y + 1, { width: half });
      partiesBottom = Math.max(partiesBottom, doc.y);
    });
    cursor = partiesBottom + 16;

    // References as label/value pairs in four open columns.
    const cellWidth = frame.width / 4;
    const cells = [...referenceCells(r), ['Receiving location', receivingLocation(r)]];
    cells.forEach(([title, value], index) => {
      const { column, row, span } = gridCell(index, cells.length);
      const x = frame.left + column * cellWidth;
      const y = cursor + row * 26;
      const width = span === 1 ? cellWidth - 10 : span * cellWidth;
      label(title!, x, y, width);
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(INK)
        .text(value!, x, y + 10, { width, height: 11, ellipsis: true });
    });
    return cursor + 26 * gridRows(cells.length) + 12;
  },
  table: (theme) => ({
    fontSize: 8,
    headerFontSize: 6.5,
    headerHeight: 20,
    headerFill: null,
    headerText: FAINT,
    headerRuleTop: { color: theme.accent, width: 1.5 },
    headerRuleBottom: { color: LINE, width: 0.5 },
    grid: null,
    rowRule: { color: LINE, width: 0.5 },
    zebra: null,
    numberColor: FAINT,
    acceptedColor: INK,
    total: { fill: null, ruleTop: { color: theme.accent, width: 1.2 }, labelColor: MUTED },
  }),
  section: (theme) => ({
    labelFont: 'Helvetica',
    labelSize: 6.5,
    labelColor: FAINT,
    uppercase: true,
    marker: (doc, x, y) => {
      rule(doc, x, x + 10, y + 3, { color: theme.accent, width: 1.5 });
      return x + 16;
    },
  }),
  signOff: () => ({
    kind: 'lines',
    height: 78,
    labelFont: 'Helvetica',
    labelColor: FAINT,
    labelUppercase: true,
    fill: null,
    border: INK,
    captionFont: 'Helvetica',
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'left' }),
};

// ---------------------------------------------------------------- Elegant

const elegant: GoodsReceiptLayout = {
  key: 'elegant',
  fonts: TIMES,
  frame: STANDARD_FRAME,
  decorate(ctx) {
    const { doc, theme } = ctx;
    doc
      .save()
      .rect(20, 20, PAGE_WIDTH - 40, PAGE_HEIGHT - 40)
      .lineWidth(0.6)
      .strokeColor(theme.accent)
      .strokeOpacity(0.5)
      .stroke()
      .restore();
  },
  opening(ctx) {
    const { doc, r, theme, fonts, frame } = ctx;
    let cursor = MARGIN - 8;
    if (drawLogo(doc, r, frame.left + frame.width / 2 - 18, cursor, 36)) {
      cursor += 42;
    }
    doc
      .font(fonts.bold)
      .fontSize(18)
      .fillColor(INK)
      .text(r.company.name, frame.left, cursor, { width: frame.width, align: 'center' });
    const details = companyLines(r);
    if (details.length) {
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(details.join('  ·  '), frame.left + 40, doc.y + 2, {
          width: frame.width - 80,
          align: 'center',
        });
    }
    cursor = doc.y + 10;
    rule(doc, frame.left, frame.left + frame.width, cursor, { color: theme.accent, width: 1.6 });
    rule(doc, frame.left, frame.left + frame.width, cursor + 3.5, {
      color: theme.accent,
      width: 0.5,
    });
    doc
      .font(fonts.bold)
      .fontSize(13)
      .fillColor(theme.accentText)
      .text('GOODS RECEIPT NOTE', frame.left, cursor + 14, {
        width: frame.width,
        align: 'center',
        characterSpacing: 3.5,
      });
    doc
      .font(fonts.italic)
      .fontSize(9)
      .fillColor(MUTED)
      .text(`No. ${numberText(r)}  —  ${statusText(r).toLowerCase()}`, frame.left, doc.y + 2, {
        width: frame.width,
        align: 'center',
      });
    cursor = doc.y + 16;

    // Parties with italic captions.
    const half = (frame.width - 30) / 2;
    const parties: Array<[string, string, string[]]> = [
      ['Delivered by the supplier', r.company.name, supplierLines(r)],
      ['Received by the customer', r.recipient.name, customerLines(r)],
    ];
    let bottom = cursor;
    parties.forEach(([caption, name, lines], index) => {
      const x = frame.left + index * (half + 30);
      doc
        .font(fonts.italic)
        .fontSize(9.5)
        .fillColor(theme.accentText)
        .text(caption, x, cursor, { width: half });
      doc
        .font(fonts.bold)
        .fontSize(10.5)
        .fillColor(INK)
        .text(name, x, doc.y + 1, { width: half });
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(lines.join('\n'), x, doc.y + 1, { width: half });
      bottom = Math.max(bottom, doc.y);
    });
    cursor = bottom + 12;

    // Particulars: two columns of label … value rows between hairlines.
    const rows = [...referenceCells(r), ['Receiving location', receivingLocation(r)]];
    const columnWidth = (frame.width - 30) / 2;
    const rowHeight = 15;
    const perColumn = Math.ceil(rows.length / 2);
    rule(doc, frame.left, frame.left + frame.width, cursor, { color: theme.accent, width: 0.6 });
    rows.forEach(([label, value], index) => {
      const column = Math.floor(index / perColumn);
      const x = frame.left + column * (columnWidth + 30);
      const y = cursor + 4 + (index % perColumn) * rowHeight;
      doc
        .font(fonts.italic)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(label!, x, y, { width: columnWidth * 0.45 });
      doc
        .font(fonts.bold)
        .fontSize(8.5)
        .fillColor(INK)
        .text(value!, x + columnWidth * 0.45, y, {
          width: columnWidth * 0.55,
          align: 'right',
          height: 11,
          ellipsis: true,
        });
    });
    const end = cursor + 8 + perColumn * rowHeight;
    rule(doc, frame.left, frame.left + frame.width, end, { color: theme.accent, width: 0.6 });
    return end + 16;
  },
  table: (theme) => ({
    fontSize: 8.5,
    headerFontSize: 7.5,
    headerHeight: 20,
    headerFill: null,
    headerText: theme.accentText,
    headerRuleTop: { color: theme.accent, width: 0.9 },
    headerRuleBottom: { color: theme.accent, width: 0.5 },
    grid: null,
    rowRule: { color: LINE, width: 0.5 },
    zebra: null,
    numberColor: MUTED,
    acceptedColor: theme.accentText,
    total: { fill: null, doubleRule: theme.accent, labelColor: theme.accentText },
  }),
  section: (theme) => ({
    labelFont: 'Times-Italic',
    labelSize: 10,
    labelColor: theme.accentText,
    uppercase: false,
  }),
  signOff: (theme) => ({
    kind: 'lines',
    height: 80,
    labelFont: 'Times-Italic',
    labelColor: theme.accentText,
    labelUppercase: false,
    fill: null,
    border: theme.accent,
    captionFont: 'Times-Italic',
  }),
  footer: () => ({ font: 'Times-Italic', color: FAINT, align: 'center' }),
};

// ---------------------------------------------------------------- Bold

const SIDEBAR_WIDTH = 168;
const SIDEBAR_PAD = 24;

const bold: GoodsReceiptLayout = {
  key: 'bold',
  fonts: HELVETICA,
  frame: {
    left: SIDEBAR_WIDTH + 26,
    width: PAGE_WIDTH - SIDEBAR_WIDTH - 26 - 34,
    top: MARGIN,
    bottom: 780,
  },
  decorate(ctx) {
    const { doc, theme } = ctx;
    doc.save().rect(0, 0, SIDEBAR_WIDTH, PAGE_HEIGHT).fillColor(theme.accent).fill();
    doc
      .polygon(
        [0, PAGE_HEIGHT - 170],
        [SIDEBAR_WIDTH, PAGE_HEIGHT - 110],
        [SIDEBAR_WIDTH, PAGE_HEIGHT],
        [0, PAGE_HEIGHT],
      )
      .fillColor(theme.accentDeep)
      .fillOpacity(0.45)
      .fill()
      .restore();
  },
  opening(ctx) {
    const { doc, r, theme, fonts, frame } = ctx;
    const x = SIDEBAR_PAD;
    const width = SIDEBAR_WIDTH - SIDEBAR_PAD * 2;
    let y = 40;

    if (drawLogo(doc, r, x + 6, y + 6, 38, { padding: 6, radius: 9, color: '#ffffff' })) {
      y += 62;
    }
    const sideLabel = (text: string) => {
      doc
        .save()
        .fillOpacity(0.7)
        .font(fonts.bold)
        .fontSize(6.5)
        .fillColor(theme.onAccent)
        .text(text.toUpperCase(), x, y, { width, characterSpacing: 1 })
        .restore();
      y = doc.y + 3;
    };
    const sideText = (text: string, size: number, bold: boolean, height: number) => {
      doc
        .font(bold ? fonts.bold : fonts.regular)
        .fontSize(size)
        .fillColor(theme.onAccent)
        .text(text, x, y, { width, height, ellipsis: true });
      y = doc.y;
    };

    sideLabel('Delivered by');
    sideText(r.company.name, 12, true, 44);
    doc.save().fillOpacity(0.85);
    sideText(supplierLines(r).join('\n'), 7.5, false, 70);
    doc.restore();
    y += 18;

    sideLabel('Received by');
    sideText(r.recipient.name, 10.5, true, 40);
    doc.save().fillOpacity(0.85);
    sideText(customerLines(r).join('\n'), 7.5, false, 80);
    doc.restore();
    y += 18;

    for (const [label, value] of referenceCells(r).slice(0, 5)) {
      sideLabel(label);
      sideText(value, 9.5, true, 24);
      y += 11;
    }

    // Main column: title, accent bar, number and status.
    doc
      .font(fonts.bold)
      .fontSize(27)
      .fillColor(INK)
      .text('GOODS RECEIPT', frame.left, MARGIN - 2, { width: frame.width, lineBreak: false });
    const barY = MARGIN + 32;
    doc.save().rect(frame.left, barY, 46, 5).fillColor(theme.accent).fill().restore();
    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor(MUTED)
      .text(numberText(r), frame.left, barY + 13, { width: frame.width });
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(theme.accentText)
      .text(statusText(r), frame.left, doc.y + 3, { width: frame.width, characterSpacing: 1 });

    // Delivery references in a 3-column strip with an accent top rule.
    let top = doc.y + 18;
    rule(doc, frame.left, frame.left + frame.width, top, { color: theme.accent, width: 2 });
    const strip = [...referenceCells(r).slice(5), ['Receiving location', receivingLocation(r)]];
    const cellWidth = frame.width / 2;
    strip.forEach(([label, value], index) => {
      const cx = frame.left + (index % 2) * cellWidth;
      const cy = top + 8 + Math.floor(index / 2) * 26;
      doc
        .font(fonts.bold)
        .fontSize(6.5)
        .fillColor(theme.accentText)
        .text(label!.toUpperCase(), cx, cy, { width: cellWidth - 10, lineBreak: false });
      doc
        .font(fonts.bold)
        .fontSize(8.5)
        .fillColor(INK)
        .text(value!, cx, cy + 10, { width: cellWidth - 10, height: 11, ellipsis: true });
    });
    top += 8 + Math.ceil(strip.length / 2) * 26;
    return top + 12;
  },
  table: (theme) => ({
    fontSize: 7.5,
    headerFontSize: 6.5,
    headerHeight: 20,
    headerFill: null,
    headerText: theme.accentText,
    headerRuleBottom: { color: theme.accent, width: 2 },
    grid: null,
    rowRule: { color: LINE, width: 0.6 },
    zebra: null,
    numberColor: theme.accentText,
    acceptedColor: theme.accentText,
    total: { fill: null, ruleTop: { color: theme.accent, width: 2 }, labelColor: INK },
  }),
  section: (theme) => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 7.5,
    labelColor: theme.accentText,
    uppercase: true,
  }),
  signOff: (theme) => ({
    kind: 'boxes',
    height: 100,
    labelFont: 'Helvetica-Bold',
    labelColor: theme.onAccent,
    labelUppercase: true,
    fill: theme.accent,
    border: theme.accent,
    captionFont: 'Helvetica',
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'left' }),
};

export const GOODS_RECEIPT_LAYOUTS: Record<TemplateKey, GoodsReceiptLayout> = {
  classic,
  modern,
  minimal,
  elegant,
  bold,
};
