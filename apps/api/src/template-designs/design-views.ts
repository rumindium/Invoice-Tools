import type { TemplateAsset, TemplateDesign } from '../database/entities';
import {
  type DesignElement,
  type DesignKind,
  type DesignPage,
  type DesignSnapshot,
  kindOf,
} from './design-schema';

/** A design as the template builder receives it. */
export interface TemplateDesignView {
  id: string;
  name: string;
  kind: DesignKind;
  accentColor: string;
  page: DesignPage;
  elements: DesignElement[];
  /** Send it back with the next save; a newer revision on the server means a conflict. */
  revision: number;
  /** Document types (URL segments) whose active template this design is. */
  appliedTo: string[];
  createdAt: string;
  updatedAt: string;
}

export interface TemplateAssetView {
  id: string;
  kind: 'upload' | 'signature';
  name: string;
  dataUrl: string;
  byteSize: number;
  createdAt: string;
}

export function toDesignSnapshot(row: TemplateDesign): DesignSnapshot {
  return {
    id: row.id,
    name: row.name,
    kind: kindOf(row.kind) ?? 'invoice',
    accentColor: row.accentColor,
    page: row.page as unknown as DesignPage,
    elements: row.elements as DesignElement[],
    revision: row.revision,
  };
}

export function toDesignView(row: TemplateDesign, appliedTo: string[] = []): TemplateDesignView {
  const snapshot = toDesignSnapshot(row);
  return {
    ...snapshot,
    appliedTo,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toAssetView(row: TemplateAsset): TemplateAssetView {
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    dataUrl: row.dataUrl,
    byteSize: row.byteSize,
    createdAt: row.createdAt.toISOString(),
  };
}
