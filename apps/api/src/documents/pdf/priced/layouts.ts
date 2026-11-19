import type { TemplateKey } from '../../../templates/template-catalog';
import type { TemplateTheme } from '../../../templates/template-theme';
import {
  attentionLine,
  companyLines,
  type Ctx,
  detailRows,
  drawLogo,
  ensureSpace,
  FAINT,
  type Fonts,
  type FooterStyle,
  type Frame,
  grandTotal,
  INK,
  LINE,
  MUTED,
  PAGE_HEIGHT,
  PAGE_MARGIN,
  PAGE_WIDTH,
  recipientLines,
  rule,
  type SectionStyle,
  SOFT,
  type TableStyle,
  totalsRows,
} from './kit';

export interface PricedLayout {
  key: TemplateKey;
  fonts: Fonts;
  frame: Frame;
  /** Background drawn on every page before its content (bands, sidebars). */
  decorate(ctx: Ctx, firstPage: boolean): void;
  /** Letterhead, title and parties on page one; returns where the items start. */
  opening(ctx: Ctx): number;
  table(theme: TemplateTheme): TableStyle;
  totals(ctx: Ctx, cursor: number): number;
  section(theme: TemplateTheme): SectionStyle;
  footer(theme: TemplateTheme): FooterStyle;
}

const HELVETICA: Fonts = {
  regular: 'Helvetica',
  bold: 'Helvetica-Bold',
  italic: 'Helvetica-Oblique',
};
const TIMES: Fonts = { regular: 'Times-Roman', bold: 'Times-Bold', italic: 'Times-Italic' };

const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const STANDARD_FRAME: Frame = {
  left: PAGE_MARGIN,
  width: CONTENT_WIDTH,
  top: PAGE_MARGIN,
  bottom: 770,
};

/** The largest font size (down to `min`) at which `text` fits `width` in the current font. */
function fitSize(
  doc: PDFKit.PDFDocument,
  text: string,
  width: number,
  max: number,
  min: number,
): number {
  let size = max;
  while (size > min && doc.fontSize(size).widthOfString(text) > width) {
    size -= 0.5;
  }
  return size;
}

/** Right-aligned "label … value" rows inside a box; returns the y after the last row. */
function totalsLines(
  ctx: Ctx,
  left: number,
  width: number,
  top: number,
  labelColor = MUTED,
  valueColor = INK,
): number {
  const { doc, d, fonts } = ctx;
  let cursor = top;
  for (const [name, value] of totalsRows(d)) {
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(labelColor)
      .text(name, left, cursor, { width: width * 0.45 });
    doc.fillColor(valueColor).text(value, left + width * 0.45, cursor, {
      width: width * 0.55,
      align: 'right',
    });
    cursor += 15;
  }
  return cursor;
}

// ---------------------------------------------------------------- Classic

const classic: PricedLayout = {
  key: 'classic',
  fonts: HELVETICA,
  frame: STANDARD_FRAME,
  decorate: () => undefined,
  opening(ctx) {
    const { doc, d, theme, fonts, frame } = ctx;
    const textLeft = drawLogo(doc, d, frame.left, PAGE_MARGIN, 44) ? frame.left + 56 : frame.left;

    doc
      .fillColor(INK)
      .font(fonts.bold)
      .fontSize(15)
      .text(d.company.name, textLeft, PAGE_MARGIN, { width: 250 });
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(companyLines(d).join('\n'), textLeft, PAGE_MARGIN + 21, { width: 250 });

    doc
      .font(fonts.bold)
      .fontSize(24)
      .fillColor(theme.accentText)
      .text(d.title, frame.left, PAGE_MARGIN - 4, { width: frame.width, align: 'right' });
    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text(d.number, frame.left, PAGE_MARGIN + 26, { width: frame.width, align: 'right' })
      .text(d.status, frame.left, PAGE_MARGIN + 39, {
        width: frame.width,
        align: 'right',
      });

    const top = Math.max(PAGE_MARGIN + 78, doc.y + 12);
    rule(doc, frame.left, frame.left + frame.width, top, { color: LINE, width: 1 });
    return parties(ctx, top + 16, {
      heading: d.party.heading.toUpperCase(),
      headingColor: FAINT,
      labelColor: FAINT,
    });
  },
  table: () => ({
    fontSize: 9,
    headerFontSize: 7.5,
    headerHeight: 22,
    headerFill: SOFT,
    headerText: MUTED,
    rowRule: { color: LINE, width: 1 },
    zebra: null,
    numberColor: MUTED,
  }),
  totals(ctx, start) {
    const { doc, d, theme, fonts, frame } = ctx;
    const width = 240;
    const left = frame.left + frame.width - width;
    let cursor = ensureSpace(ctx, start + 6, totalsRows(d).length * 15 + 44);
    cursor = totalsLines(ctx, left, width, cursor) + 4;

    doc.save().rect(left, cursor, width, 26).fillColor(theme.accent).fill().restore();
    doc
      .font(fonts.bold)
      .fontSize(9.5)
      .fillColor(theme.onAccent)
      .text('TOTAL', left + 10, cursor + 9, { width: 100 });
    doc.text(grandTotal(d), left + 100, cursor + 9, { width: width - 110, align: 'right' });
    return cursor + 40;
  },
  section: () => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 8,
    labelColor: FAINT,
    uppercase: true,
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'center' }),
};

/** Recipient on the left, dates on the right (Classic and Elegant). */
function parties(
  ctx: Ctx,
  top: number,
  options: { heading: string; headingColor: string; labelColor: string; headingFont?: string },
): number {
  const { doc, d, fonts, frame } = ctx;
  const columnWidth = (frame.width - 24) / 2;

  doc
    .font(options.headingFont ?? fonts.bold)
    .fontSize(8)
    .fillColor(options.headingColor)
    .text(options.heading, frame.left, top);
  doc
    .font(fonts.bold)
    .fontSize(10.5)
    .fillColor(INK)
    .text(d.party.name, frame.left, top + 13, { width: columnWidth });

  let bottom = doc.y;
  const attention = attentionLine(d);
  if (attention) {
    doc
      .font(fonts.bold)
      .fontSize(8.5)
      .fillColor(INK)
      .text(attention, frame.left, bottom + 2, { width: columnWidth });
    bottom = doc.y;
  }
  const lines = recipientLines(d);
  if (lines.length) {
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(lines.join('\n'), frame.left, bottom + 2, { width: columnWidth });
    bottom = doc.y;
  }

  const detailsLeft = frame.left + columnWidth + 24;
  let detailY = top;
  for (const [name, value] of detailRows(d)) {
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(options.labelColor)
      .text(name, detailsLeft, detailY, { width: columnWidth * 0.45 });
    doc
      .font(fonts.bold)
      .fillColor(INK)
      .text(value, detailsLeft + columnWidth * 0.45, detailY, {
        width: columnWidth * 0.55,
        align: 'right',
      });
    detailY += 14;
  }

  return Math.max(bottom, detailY) + 18;
}

// ---------------------------------------------------------------- Modern

const MODERN_BAND = 128;

const modern: PricedLayout = {
  key: 'modern',
  fonts: HELVETICA,
  frame: { ...STANDARD_FRAME, top: PAGE_MARGIN + 8, bottom: 770 },
  decorate(ctx, firstPage) {
    const { doc, theme } = ctx;
    doc.save();
    if (firstPage) {
      doc.rect(0, 0, PAGE_WIDTH, MODERN_BAND).fillColor(theme.accent).fill();
      // A darker wedge on the right gives the band depth.
      doc
        .polygon(
          [PAGE_WIDTH - 210, 0],
          [PAGE_WIDTH, 0],
          [PAGE_WIDTH, MODERN_BAND],
          [PAGE_WIDTH - 150, MODERN_BAND],
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
    const { doc, d, theme, fonts, frame } = ctx;
    const backdrop = { padding: 6, radius: 10, color: '#ffffff' };
    const textLeft = drawLogo(doc, d, frame.left + 6, 40, 44, backdrop)
      ? frame.left + 70
      : frame.left;

    doc
      .font(fonts.bold)
      .fontSize(16)
      .fillColor(theme.onAccent)
      .text(d.company.name, textLeft, 36, { width: 250 });
    doc
      .save()
      .fillOpacity(0.85)
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(theme.onAccent)
      .text(companyLines(d).join('\n'), textLeft, doc.y + 3, { width: 250, height: 48 })
      .restore();

    doc
      .font(fonts.bold)
      .fontSize(26)
      .fillColor(theme.onAccent)
      .text(d.title, frame.left, 34, { width: frame.width, align: 'right' });
    doc
      .font(fonts.regular)
      .fontSize(9.5)
      .text(d.number, frame.left, 66, { width: frame.width, align: 'right' });

    const status = d.status;
    doc.font(fonts.bold).fontSize(7.5);
    const pillWidth = doc.widthOfString(status) + 16;
    const pillLeft = frame.left + frame.width - pillWidth;
    doc
      .save()
      .roundedRect(pillLeft, 84, pillWidth, 16, 8)
      .lineWidth(1)
      .strokeColor(theme.onAccent)
      .stroke()
      .restore();
    doc
      .fillColor(theme.onAccent)
      .text(status, pillLeft, 88.5, { width: pillWidth, align: 'center', lineBreak: false });

    // Info tiles: quotation date, validity, reference.
    const tiles = detailRows(d);
    const gap = 10;
    const tileWidth = (frame.width - gap * (tiles.length - 1)) / tiles.length;
    const tileTop = MODERN_BAND + 22;
    tiles.forEach(([name, value], index) => {
      const x = frame.left + index * (tileWidth + gap);
      doc.save().roundedRect(x, tileTop, tileWidth, 40, 7).fillColor(theme.tint).fill().restore();
      doc
        .save()
        .rect(x, tileTop + 8, 3, 24)
        .fillColor(theme.accent)
        .fill()
        .restore();
      const inner = tileWidth - 20;
      doc
        .font(fonts.bold)
        .fontSize(fitSize(doc, name.toUpperCase(), inner, 7, 5.5))
        .fillColor(theme.accentText)
        .text(name.toUpperCase(), x + 12, tileTop + 8, { width: inner, lineBreak: false });
      // Shrink long values (numbers, references) to fit the tile instead of dropping them.
      doc
        .font(fonts.bold)
        .fontSize(fitSize(doc, value, inner, 10, 7))
        .fillColor(INK)
        .text(value, x + 12, tileTop + 20, { width: inner, lineBreak: false });
    });

    // Prepared for, with an accent bar.
    const top = tileTop + 58;
    doc
      .font(fonts.bold)
      .fontSize(7.5)
      .fillColor(theme.accentText)
      .text(d.party.preparedHeading.toUpperCase(), frame.left + 12, top);
    doc
      .font(fonts.bold)
      .fontSize(12)
      .fillColor(INK)
      .text(d.party.name, frame.left + 12, top + 12, { width: frame.width * 0.6 });
    const attention = attentionLine(d);
    if (attention) {
      doc
        .font(fonts.bold)
        .fontSize(8.5)
        .fillColor(INK)
        .text(attention, frame.left + 12, doc.y + 2, { width: frame.width * 0.6 });
    }
    const lines = recipientLines(d);
    if (lines.length) {
      doc
        .font(fonts.regular)
        .fontSize(8.5)
        .fillColor(MUTED)
        .text(lines.join('\n'), frame.left + 12, doc.y + 2, { width: frame.width * 0.6 });
    }
    const bottom = doc.y;
    doc
      .save()
      .rect(frame.left, top, 3, bottom - top)
      .fillColor(theme.accent)
      .fill()
      .restore();
    return bottom + 20;
  },
  table: (theme) => ({
    fontSize: 9,
    headerFontSize: 7.5,
    headerHeight: 24,
    headerFill: theme.accent,
    headerText: theme.onAccent,
    headerRadius: 5,
    rowRule: null,
    zebra: theme.tint,
    numberColor: theme.accentText,
  }),
  totals(ctx, start) {
    const { doc, d, theme, fonts, frame } = ctx;
    const width = 250;
    const left = frame.left + frame.width - width;
    const rows = totalsRows(d).length;
    const height = rows * 15 + 52;
    const top = ensureSpace(ctx, start + 8, height + 10);

    doc.save().roundedRect(left, top, width, height, 10).fillColor(theme.soft).fill().restore();
    const cursor = totalsLines(ctx, left + 14, width - 28, top + 12);
    rule(doc, left + 14, left + width - 14, cursor + 2, { color: theme.accent, width: 0.75 });
    doc
      .font(fonts.bold)
      .fontSize(9)
      .fillColor(theme.accentText)
      .text('TOTAL', left + 14, cursor + 14, { width: 80 });
    doc
      .font(fonts.bold)
      .fontSize(15)
      .fillColor(theme.accentText)
      .text(grandTotal(d), left + 70, cursor + 11, { width: width - 84, align: 'right' });
    return top + height + 16;
  },
  section: (theme) => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 8,
    labelColor: theme.accentText,
    uppercase: true,
    marker: (doc, x, y) => {
      doc
        .save()
        .roundedRect(x, y + 1, 6, 6, 1.5)
        .fillColor(theme.accent)
        .fill()
        .restore();
      return x + 11;
    },
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'center' }),
};

// ---------------------------------------------------------------- Minimal

const minimal: PricedLayout = {
  key: 'minimal',
  fonts: HELVETICA,
  frame: { left: 56, width: PAGE_WIDTH - 112, top: 56, bottom: 770 },
  decorate: () => undefined,
  opening(ctx) {
    const { doc, d, theme, fonts, frame } = ctx;
    const top = 56;
    const textLeft = drawLogo(doc, d, frame.left, top, 28) ? frame.left + 38 : frame.left;

    doc
      .font(fonts.bold)
      .fontSize(11)
      .fillColor(INK)
      .text(d.company.name, textLeft, top, { width: 260 });
    doc
      .font(fonts.regular)
      .fontSize(8)
      .fillColor(MUTED)
      .text(companyLines(d).join('\n'), textLeft, doc.y + 3, { width: 260 });
    const companyBottom = doc.y;

    doc.font(fonts.regular).fontSize(22);
    const titleWidth = doc.widthOfString(d.titleCase);
    const titleLeft = frame.left + frame.width - titleWidth;
    doc
      .save()
      .circle(titleLeft - 10, top + 11, 3.2)
      .fillColor(theme.accent)
      .fill()
      .restore();
    doc.fillColor(INK).text(d.titleCase, titleLeft, top - 2, { lineBreak: false });
    doc
      .font(fonts.regular)
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(`${d.number}  ·  ${d.status}`, frame.left, top + 28, {
        width: frame.width,
        align: 'right',
      });

    let cursor = Math.max(companyBottom, top + 44) + 22;
    rule(doc, frame.left, frame.left + frame.width, cursor, { color: LINE, width: 0.5 });
    cursor += 16;

    // One inline row: recipient (wide) then each date; more than three wrap to a second row.
    const rows = detailRows(d);
    const recipientWidth = frame.width * 0.4;
    const perRow = Math.min(rows.length, 3);
    const cellWidth = (frame.width - recipientWidth - 12) / perRow;
    const metaLabel = (text: string, x: number, width: number, y = cursor) =>
      doc
        .font(fonts.regular)
        .fontSize(7)
        .fillColor(FAINT)
        .text(text.toUpperCase(), x, y, { width, characterSpacing: 0.8 });

    metaLabel(d.party.preparedHeading, frame.left, recipientWidth);
    doc
      .font(fonts.bold)
      .fontSize(9.5)
      .fillColor(INK)
      .text(d.party.name, frame.left, cursor + 12, { width: recipientWidth });
    const attention = attentionLine(d);
    if (attention) {
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(INK)
        .text(attention, frame.left, doc.y + 1, { width: recipientWidth });
    }
    const lines = recipientLines(d);
    if (lines.length) {
      doc
        .font(fonts.regular)
        .fontSize(8)
        .fillColor(MUTED)
        .text(lines.join('\n'), frame.left, doc.y + 1, { width: recipientWidth });
    }
    const recipientBottom = doc.y;

    rows.forEach(([name, value], index) => {
      const x = frame.left + recipientWidth + 12 + (index % perRow) * cellWidth;
      const y = cursor + Math.floor(index / perRow) * 30;
      metaLabel(name, x, cellWidth - 8, y);
      doc
        .font(fonts.regular)
        .fontSize(9.5)
        .fillColor(INK)
        .text(value, x, y + 12, { width: cellWidth - 8 });
    });

    const detailHeight = Math.ceil(rows.length / perRow) * 30 - 4;
    return Math.max(recipientBottom, cursor + detailHeight) + 24;
  },
  table: (theme) => ({
    fontSize: 9,
    headerFontSize: 7,
    headerHeight: 20,
    headerFill: null,
    headerText: FAINT,
    headerRuleTop: { color: theme.accent, width: 1.5 },
    headerRuleBottom: { color: LINE, width: 0.5 },
    rowRule: { color: LINE, width: 0.5 },
    zebra: null,
    numberColor: FAINT,
  }),
  totals(ctx, start) {
    const { doc, d, theme, fonts, frame } = ctx;
    const width = 220;
    const left = frame.left + frame.width - width;
    let cursor = ensureSpace(ctx, start + 6, totalsRows(d).length * 15 + 46);
    cursor = totalsLines(ctx, left, width, cursor, FAINT) + 6;

    doc
      .font(fonts.regular)
      .fontSize(9)
      .fillColor(MUTED)
      .text('Total', left, cursor + 4, { width: 80 });
    doc
      .font(fonts.bold)
      .fontSize(13)
      .fillColor(INK)
      .text(grandTotal(d), left + 60, cursor, { width: width - 60, align: 'right' });
    rule(doc, left + 60, left + width, cursor + 20, { color: theme.accent, width: 2 });
    return cursor + 40;
  },
  section: (theme) => ({
    labelFont: 'Helvetica',
    labelSize: 7,
    labelColor: FAINT,
    uppercase: true,
    marker: (doc, x, y) => {
      rule(doc, x, x + 10, y + 3.5, { color: theme.accent, width: 1.5 });
      return x + 16;
    },
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'left' }),
};

// ---------------------------------------------------------------- Elegant

const elegant: PricedLayout = {
  key: 'elegant',
  fonts: TIMES,
  frame: STANDARD_FRAME,
  decorate(ctx) {
    const { doc, theme } = ctx;
    // A fine frame line around the page.
    doc
      .save()
      .rect(22, 22, PAGE_WIDTH - 44, PAGE_HEIGHT - 44)
      .lineWidth(0.6)
      .strokeColor(theme.accent)
      .strokeOpacity(0.5)
      .stroke()
      .restore();
  },
  opening(ctx) {
    const { doc, d, theme, fonts, frame } = ctx;
    let cursor = PAGE_MARGIN - 6;
    if (drawLogo(doc, d, frame.left + frame.width / 2 - 20, cursor, 40)) {
      cursor += 48;
    }

    doc
      .font(fonts.bold)
      .fontSize(19)
      .fillColor(INK)
      .text(d.company.name, frame.left, cursor, { width: frame.width, align: 'center' });
    const details = companyLines(d);
    if (details.length) {
      doc
        .font(fonts.regular)
        .fontSize(9)
        .fillColor(MUTED)
        .text(details.join('  ·  '), frame.left + 40, doc.y + 3, {
          width: frame.width - 80,
          align: 'center',
        });
    }

    cursor = doc.y + 12;
    rule(doc, frame.left, frame.left + frame.width, cursor, { color: theme.accent, width: 1.6 });
    rule(doc, frame.left, frame.left + frame.width, cursor + 3.5, {
      color: theme.accent,
      width: 0.5,
    });

    doc
      .font(fonts.bold)
      .fontSize(15)
      .fillColor(theme.accentText)
      .text(d.title, frame.left, cursor + 16, {
        width: frame.width,
        align: 'center',
        characterSpacing: 5,
      });
    doc
      .font(fonts.italic)
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(`No. ${d.number}  —  ${d.status.toLowerCase()}`, frame.left, doc.y + 3, {
        width: frame.width,
        align: 'center',
      });

    return parties(ctx, doc.y + 22, {
      heading: d.party.preparedHeading,
      headingColor: theme.accentText,
      headingFont: fonts.italic,
      labelColor: MUTED,
    });
  },
  table: (theme) => ({
    fontSize: 9.5,
    headerFontSize: 8,
    headerHeight: 20,
    headerFill: null,
    headerText: theme.accentText,
    headerRuleTop: { color: theme.accent, width: 0.9 },
    headerRuleBottom: { color: theme.accent, width: 0.5 },
    rowRule: { color: LINE, width: 0.5 },
    zebra: null,
    closingDoubleRule: theme.accent,
    numberColor: MUTED,
  }),
  totals(ctx, start) {
    const { doc, d, theme, fonts, frame } = ctx;
    const width = 240;
    const left = frame.left + frame.width - width;
    let cursor = ensureSpace(ctx, start + 8, totalsRows(d).length * 15 + 50);
    cursor = totalsLines(ctx, left, width, cursor) + 6;

    doc
      .save()
      .rect(left, cursor, width, 30)
      .lineWidth(1.2)
      .strokeColor(theme.accent)
      .stroke()
      .rect(left + 3, cursor + 3, width - 6, 24)
      .lineWidth(0.4)
      .stroke()
      .restore();
    doc
      .font(fonts.italic)
      .fontSize(10.5)
      .fillColor(theme.accentText)
      .text('Total', left + 12, cursor + 10, { width: 80 });
    doc
      .font(fonts.bold)
      .fontSize(12)
      .fillColor(theme.accentText)
      .text(grandTotal(d), left + 80, cursor + 9, { width: width - 92, align: 'right' });
    return cursor + 46;
  },
  section: (theme) => ({
    labelFont: 'Times-Italic',
    labelSize: 10.5,
    labelColor: theme.accentText,
    uppercase: false,
  }),
  footer: () => ({ font: 'Times-Italic', color: FAINT, align: 'center' }),
};

// ---------------------------------------------------------------- Bold

const SIDEBAR_WIDTH = 168;
const SIDEBAR_PAD = 24;

const bold: PricedLayout = {
  key: 'bold',
  fonts: HELVETICA,
  frame: {
    left: SIDEBAR_WIDTH + 30,
    width: PAGE_WIDTH - SIDEBAR_WIDTH - 30 - 40,
    top: PAGE_MARGIN,
    bottom: 770,
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
    const { doc, d, theme, fonts, frame } = ctx;
    const x = SIDEBAR_PAD;
    const width = SIDEBAR_WIDTH - SIDEBAR_PAD * 2;
    let y = 44;

    if (drawLogo(doc, d, x + 6, y + 6, 40, { padding: 6, radius: 9, color: '#ffffff' })) {
      y += 66;
    }

    doc
      .font(fonts.bold)
      .fontSize(13)
      .fillColor(theme.onAccent)
      .text(d.company.name, x, y, { width, height: 50, ellipsis: true });
    doc
      .save()
      .fillOpacity(0.85)
      .font(fonts.regular)
      .fontSize(7.5)
      .fillColor(theme.onAccent)
      .text(companyLines(d).join('\n'), x, doc.y + 4, { width, height: 90, ellipsis: true })
      .restore();
    y = doc.y + 26;

    const sidebarLabel = (text: string) => {
      doc
        .save()
        .fillOpacity(0.7)
        .font(fonts.bold)
        .fontSize(6.5)
        .fillColor(theme.onAccent)
        .text(text, x, y, { width, characterSpacing: 1 })
        .restore();
      y = doc.y + 4;
    };

    sidebarLabel(d.party.heading.toUpperCase());
    doc
      .font(fonts.bold)
      .fontSize(10.5)
      .fillColor(theme.onAccent)
      .text(d.party.name, x, y, { width, height: 40, ellipsis: true });
    const attention = attentionLine(d);
    if (attention) {
      doc
        .font(fonts.regular)
        .fontSize(7.5)
        .text(attention, x, doc.y + 2, { width, height: 28, ellipsis: true });
    }
    const lines = recipientLines(d);
    if (lines.length) {
      doc
        .save()
        .fillOpacity(0.85)
        .font(fonts.regular)
        .fontSize(7.5)
        .fillColor(theme.onAccent)
        .text(lines.join('\n'), x, doc.y + 3, { width, height: 80, ellipsis: true })
        .restore();
    }
    y = doc.y + 22;

    for (const [name, value] of detailRows(d)) {
      sidebarLabel(name.toUpperCase());
      doc
        .font(fonts.bold)
        .fontSize(9.5)
        .fillColor(theme.onAccent)
        .text(value, x, y, { width, height: 24, ellipsis: true });
      y = doc.y + 14;
    }

    // Main column: large title, accent bar, number and status.
    doc
      .font(fonts.bold)
      .fontSize(32)
      .fillColor(INK)
      .text(d.title, frame.left, PAGE_MARGIN - 4, { width: frame.width, lineBreak: false });
    const barY = PAGE_MARGIN + 38;
    doc.save().rect(frame.left, barY, 46, 5).fillColor(theme.accent).fill().restore();
    doc
      .font(fonts.regular)
      .fontSize(10)
      .fillColor(MUTED)
      .text(d.number, frame.left, barY + 14, { width: frame.width });
    doc
      .font(fonts.bold)
      .fontSize(8)
      .fillColor(theme.accentText)
      .text(d.status, frame.left, doc.y + 3, {
        width: frame.width,
        characterSpacing: 1,
      });
    return doc.y + 28;
  },
  table: (theme) => ({
    fontSize: 8.5,
    headerFontSize: 7,
    headerHeight: 20,
    headerFill: null,
    headerText: theme.accentText,
    headerRuleBottom: { color: theme.accent, width: 2 },
    rowRule: { color: LINE, width: 0.6 },
    zebra: null,
    numberColor: theme.accentText,
  }),
  totals(ctx, start) {
    const { doc, d, theme, fonts, frame } = ctx;
    const width = 230;
    const left = frame.left + frame.width - width;
    let cursor = ensureSpace(ctx, start + 6, totalsRows(d).length * 15 + 60);
    cursor = totalsLines(ctx, left, width, cursor) + 8;

    doc
      .font(fonts.bold)
      .fontSize(7.5)
      .fillColor(FAINT)
      .text('TOTAL', left, cursor, { width, align: 'right', characterSpacing: 1 });
    doc
      .font(fonts.bold)
      .fontSize(21)
      .fillColor(theme.accentText)
      .text(grandTotal(d), left - 60, cursor + 11, { width: width + 60, align: 'right' });
    return doc.y + 18;
  },
  section: (theme) => ({
    labelFont: 'Helvetica-Bold',
    labelSize: 8,
    labelColor: theme.accentText,
    uppercase: true,
  }),
  footer: () => ({ font: 'Helvetica', color: FAINT, align: 'left' }),
};

export const PRICED_LAYOUTS: Record<TemplateKey, PricedLayout> = {
  classic,
  modern,
  minimal,
  elegant,
  bold,
};
