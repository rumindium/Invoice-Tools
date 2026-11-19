import { DocumentType } from '../database/entities/enums';
import { type DesignSnapshot, readDesignSnapshot } from '../template-designs/design-schema';
import { findTemplate, isTemplateKey } from './template-catalog';
import { isHexColor } from './template-theme';

/** Layout key of templates made in the template builder. */
export const CUSTOM_TEMPLATE_KEY = 'custom';

/** The template a document is drawn with, as returned to the web app and used by the PDF. */
export interface DocumentTemplateView {
  key: string;
  name: string;
  accentColor: string;
  /**
   * False for drafts, which follow the company's active template. True once the document
   * left draft: it keeps the design it was issued with even if the company switches templates.
   */
  locked: boolean;
  /** The builder design (key `custom`): drawn instead of a built-in layout. */
  design?: DesignSnapshot | null;
}

/** What `documents.template_snapshot` stores. */
export interface TemplateSnapshot {
  templateId: string | null;
  key: string;
  name: string;
  accentColor: string;
  /** A copy of the builder design for `custom` templates, so issued documents keep it. */
  design?: DesignSnapshot | null;
}

/**
 * Documents issued before templates existed were drawn in the Classic layout with the app's
 * blue; they keep that look.
 */
export const LEGACY_TEMPLATE: DocumentTemplateView = {
  key: 'classic',
  name: 'Classic',
  accentColor: '#2563eb',
  locked: true,
};

export const LEGACY_QUOTATION_TEMPLATE = LEGACY_TEMPLATE;

export function readTemplateSnapshot(
  value: unknown,
  documentType: DocumentType = DocumentType.QUOTATION,
): TemplateSnapshot | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const snapshot = value as Record<string, unknown>;
  if (snapshot['key'] === CUSTOM_TEMPLATE_KEY) {
    const design = readDesignSnapshot(snapshot['design']);
    return design
      ? {
          templateId: typeof snapshot['templateId'] === 'string' ? snapshot['templateId'] : null,
          key: CUSTOM_TEMPLATE_KEY,
          name: design.name,
          accentColor: design.accentColor,
          design,
        }
      : null;
  }
  if (!isTemplateKey(snapshot['key']) || !isHexColor(snapshot['accentColor'])) {
    return null;
  }
  return {
    templateId: typeof snapshot['templateId'] === 'string' ? snapshot['templateId'] : null,
    key: snapshot['key'],
    name: findTemplate(snapshot['key'], documentType).name,
    accentColor: snapshot['accentColor'].toLowerCase(),
  };
}

export function toTemplateView(
  snapshot: Pick<TemplateSnapshot, 'key' | 'accentColor' | 'design'>,
  locked: boolean,
  documentType: DocumentType = DocumentType.QUOTATION,
): DocumentTemplateView {
  if (snapshot.key === CUSTOM_TEMPLATE_KEY && snapshot.design) {
    return {
      key: CUSTOM_TEMPLATE_KEY,
      name: snapshot.design.name,
      accentColor: snapshot.design.accentColor,
      locked,
      design: snapshot.design,
    };
  }
  const definition = findTemplate(snapshot.key, documentType);
  return {
    key: definition.key,
    name: definition.name,
    accentColor: isHexColor(snapshot.accentColor)
      ? snapshot.accentColor.toLowerCase()
      : definition.defaultColor,
    locked,
  };
}

/** A stored view (revision snapshot) may predate templates; fall back to the legacy look. */
export function templateOfStoredView(
  value: unknown,
  documentType: DocumentType = DocumentType.QUOTATION,
): DocumentTemplateView {
  const template = readTemplateSnapshot(value, documentType);
  return template ? toTemplateView(template, true, documentType) : LEGACY_TEMPLATE;
}

/** The document columns that record which template a document was generated with. */
export function templateColumns(template: TemplateSnapshot): {
  templateId: string | null;
  templateSnapshot: Record<string, unknown>;
} {
  return {
    templateId: template.templateId,
    templateSnapshot: { ...template } as Record<string, unknown>,
  };
}
