import { CUSTOM_TEMPLATE_KEY, type DocumentTemplateView } from '../templates/template-snapshot';
import type { DesignData } from './design-data';
import { type DesignPdfInfo, renderDesignPdf } from './design-pdf';

/**
 * Draws a document with its template-builder design, or returns null when the document uses a
 * built-in layout (the caller then uses its own renderer).
 */
export function renderWithDesign(
  template: DocumentTemplateView | undefined,
  data: () => DesignData,
  info: DesignPdfInfo,
): Promise<Buffer> | null {
  if (template?.key !== CUSTOM_TEMPLATE_KEY || !template.design) {
    return null;
  }
  const { design } = template;
  return renderDesignPdf(
    design,
    data(),
    info,
    `template:${CUSTOM_TEMPLATE_KEY} design:${design.id} revision:${design.revision}`,
  );
}
