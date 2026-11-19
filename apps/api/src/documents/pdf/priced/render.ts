import PDFDocument from 'pdfkit';
import type { DocumentType } from '../../../database/entities/enums';
import { findTemplate } from '../../../templates/template-catalog';
import { buildTheme } from '../../../templates/template-theme';
import { collect } from '../drawing';
import {
  type Ctx,
  drawFooters,
  drawItemsTable,
  drawSettlement,
  drawSignature,
  drawTextSection,
  PAGE_MARGIN,
} from './kit';
import { PRICED_LAYOUTS } from './layouts';
import type { PricedDocument } from './model';

/**
 * Draws a priced document (quotation, invoice) as an A4 portrait PDF in one of the five
 * template layouts and the company's accent colour. Falls back to Classic for unknown keys.
 */
export function renderPricedPdf(
  document: PricedDocument,
  template: { key?: string | null; accentColor?: string | null } | undefined,
  documentType: DocumentType,
  info: { title: string; subject: string },
): Promise<Buffer> {
  const definition = findTemplate(template?.key, documentType);
  const layout = PRICED_LAYOUTS[definition.key];
  const theme = buildTheme(template?.accentColor ?? definition.defaultColor);

  const doc = new PDFDocument({
    size: 'A4',
    layout: 'portrait',
    margin: PAGE_MARGIN,
    bufferPages: true,
    info: {
      Title: info.title,
      Author: document.company.name,
      Subject: info.subject,
      Creator: 'Rumindium Invoice',
      Keywords: `template:${definition.key} accent:${theme.accent}`,
    },
  });
  const completed = collect(doc);

  const ctx: Ctx = { doc, d: document, theme, fonts: layout.fonts, frame: layout.frame };
  layout.decorate(ctx, true);
  doc.on('pageAdded', () => layout.decorate(ctx, false));

  let cursor = layout.opening(ctx);
  cursor = drawItemsTable(ctx, cursor, layout.table(theme));
  cursor = layout.totals(ctx, cursor);
  cursor = drawSettlement(ctx, cursor);
  for (const section of document.sections) {
    cursor = drawTextSection(
      ctx,
      section.label,
      section.body,
      cursor,
      layout.section(theme),
      section.tone,
    );
  }
  drawSignature(ctx, cursor);
  drawFooters(ctx, layout.footer(theme));
  doc.end();

  return completed;
}
