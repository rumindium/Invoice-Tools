/** Older versions of a quotation, goods receipt or invoice (see the API's document_revisions). */
export interface RevisionSummary {
  revision: number;
  /** Why this version was replaced. */
  reason: string | null;
  supersededAt: string;
  supersededByName: string | null;
  status: string;
  issueDate: string | null;
  total: number | null;
  acceptedQuantity: number | null;
}

/** Present when a view is an archived older version. */
export interface SupersededRevision {
  revision: number;
  reason: string | null;
  supersededAt: string;
  supersededByName: string | null;
  currentRevision: number;
  checksumValid: boolean;
}

export interface Versioned {
  /** Current version, 1 for the original. */
  revision: number;
  revisions: RevisionSummary[];
  canRevise: boolean;
  revisionBlockedBy: string | null;
  supersededRevision?: SupersededRevision;
}

export function revisionFilename(
  number: string | null,
  fallback: string,
  revision: number,
): string {
  return `${(number ?? fallback).replace(/[^A-Za-z0-9._-]+/g, '-')}-v${revision}.pdf`;
}
