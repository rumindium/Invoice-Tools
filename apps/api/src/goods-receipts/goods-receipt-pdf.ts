import PDFDocument from 'pdfkit';
import { DocumentType } from '../database/entities/enums';
import { collect } from '../documents/pdf/drawing';
import { findTemplate } from '../templates/template-catalog';
import { buildTheme } from '../templates/template-theme';
import { drawFooters, drawLinesTable, drawSignOff, drawStatement, type GrCtx } from './pdf/kit';
import { GOODS_RECEIPT_LAYOUTS } from './pdf/layouts';
import type { GoodsReceiptView } from './views';
import { goodsReceiptDesignData } from '../template-designs/design-data';
import { renderWithDesign } from '../template-designs/design-render';

/**
 * Goods Receipt Note (GRN), A4 portrait, in the receipt's template (Classic, Modern, Minimal,
 * Elegant or Bold) and the company's accent colour. Every layout carries the issuer, the
 * delivering and receiving parties, the references (GRN, quotation, customer PO, delivery
 * note, carrier, vehicle, location), the line table with ordered / received / rejected /
 * accepted quantities and remarks, the inspection statement, and the three sign-offs
 * (delivered by, checked by, received by) at the bottom of the last page. No prices.
 */

export { formatQuantity, goodsReceiptStatusLabel } from './pdf/kit';

export function renderGoodsReceiptPdf(receipt: GoodsReceiptView): Promise<Buffer> {
  const custom = renderWithDesign(receipt.template, () => goodsReceiptDesignData(receipt), {
    title: `Goods Receipt Note ${receipt.number ?? ''}`.trim(),
    subject: `Goods receipt for ${receipt.source.quotationNumber ?? 'quotation'}`,
    author: receipt.company.name,
  });
  if (custom) return custom;
  const definition = findTemplate(receipt.template?.key, DocumentType.GOODS_RECEIPT);
  const layout = GOODS_RECEIPT_LAYOUTS[definition.key];
  const theme = buildTheme(receipt.template?.accentColor ?? definition.defaultColor);

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: 42,
    bufferPages: true,
    info: {
      Title: `Goods Receipt Note ${receipt.number ?? ''}`.trim(),
      Author: receipt.company.name,
      Subject: `Goods receipt for ${receipt.source.quotationNumber ?? 'quotation'}`,
      Creator: 'Rumindium Invoice',
      Keywords: `template:${definition.key} accent:${theme.accent}`,
    },
  });
  const completed = collect(doc);

  const ctx: GrCtx = { doc, r: receipt, theme, fonts: layout.fonts, frame: layout.frame };
  layout.decorate(ctx, true);
  doc.on('pageAdded', () => layout.decorate(ctx, false));

  let cursor = layout.opening(ctx);
  cursor = drawLinesTable(ctx, cursor, layout.table(theme));
  cursor = drawStatement(ctx, cursor, layout.section(theme));
  drawSignOff(ctx, cursor, layout.signOff(theme));
  drawFooters(ctx, layout.footer(theme));
  doc.end();

  return completed;
}
