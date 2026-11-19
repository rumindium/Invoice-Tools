import { BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import type { EntityManager } from 'typeorm';
import { Document, DocumentRevision } from '../database/entities';

/**
 * Revisions of issued documents (quotations, goods receipts, invoices).
 *
 * The document row always holds the current version. Revising stores the current version's
 * view as a snapshot in document_revisions (revision_number = that version, reason = why it
 * was replaced), applies the corrections and bumps `documents.revision`. The id and number
 * never change, so links between documents stay intact.
 */

export interface RevisionSummary {
  /** The archived version number. */
  revision: number;
  /** Why it was replaced by the next version. */
  reason: string | null;
  supersededAt: string;
  supersededByName: string | null;
  status: string;
  issueDate: string | null;
  total: number | null;
  acceptedQuantity: number | null;
}

export interface SupersededRevision {
  revision: number;
  reason: string | null;
  supersededAt: string;
  supersededByName: string | null;
  currentRevision: number;
  /** The stored snapshot still matches the checksum taken when it was archived. */
  checksumValid: boolean;
}

/** Revision facts every document view carries. */
export interface RevisionState {
  revisions: RevisionSummary[];
  /** The document is in a revisable status and nothing downstream depends on it. */
  canRevise: boolean;
  /** Why a revisable document cannot be revised right now (a downstream document exists). */
  revisionBlockedBy: string | null;
}

export const NO_REVISION_STATE: RevisionState = {
  revisions: [],
  canRevise: false,
  revisionBlockedBy: null,
};

/** Fields of a view that describe the live document, not the version being archived. */
const LIVE_FIELDS = [
  'history',
  'nextStatuses',
  'followUps',
  'flow',
  'revisions',
  'canRevise',
  'revisionBlockedBy',
  'canCreateGoodsReceipt',
  'canCreateInvoice',
  'goodsReceipt',
  'invoice',
  'supersededRevision',
];

/** A JSON copy of the view without live fields; the company logo is re-read on display. */
export function snapshotOf(view: object): Record<string, unknown> {
  const snapshot = JSON.parse(JSON.stringify(view)) as Record<string, unknown>;
  for (const field of LIVE_FIELDS) {
    delete snapshot[field];
  }
  const company = snapshot['company'] as Record<string, unknown> | undefined;
  if (company) {
    company['logoDataUrl'] = null;
  }
  return snapshot;
}

/** "QUO/2026/0001 · Rev. 2" for revised documents, the plain number otherwise. */
export function numberWithRevision(number: string | null, revision: number | undefined): string {
  const base = number ?? 'Draft';
  return revision && revision > 1 ? `${base} · Rev. ${revision}` : base;
}

export function requireReason(reason: string | undefined): string {
  const value = reason?.trim();
  if (!value || value.length < 3) {
    throw new BadRequestException('Describe what was wrong (at least 3 characters).');
  }
  return value;
}

/** Archives the document's current version and returns the next version number. */
export async function archiveCurrentVersion(
  manager: EntityManager,
  document: Document,
  view: object,
  reason: string,
  userId: string,
): Promise<number> {
  const snapshot = snapshotOf(view);

  await manager.getRepository(DocumentRevision).save(
    manager.getRepository(DocumentRevision).create({
      id: randomUUID(),
      documentId: document.id,
      revisionNumber: document.revision,
      snapshot,
      checksum: checksum(snapshot),
      reason,
      createdById: userId,
    }),
  );

  return document.revision + 1;
}

interface RevisionRow {
  revision: number;
  reason: string | null;
  supersededAt: Date;
  supersededByName: string | null;
  snapshot: Record<string, unknown>;
  checksum: string;
}

const SELECT_REVISIONS = `
  SELECT r.revision_number AS revision, r.reason, r.created_at AS "supersededAt",
         u.display_name AS "supersededByName", r.snapshot, r.checksum
    FROM document_revisions r
    LEFT JOIN users u ON u.id = r.created_by
   WHERE r.document_id = $1`;

function summary(row: RevisionRow): RevisionSummary {
  const snapshot = row.snapshot;
  const totals = (snapshot['totals'] ?? {}) as Record<string, unknown>;
  return {
    revision: row.revision,
    reason: row.reason,
    supersededAt: new Date(row.supersededAt).toISOString(),
    supersededByName: row.supersededByName,
    status: String(snapshot['status'] ?? ''),
    issueDate: (snapshot['issueDate'] ?? snapshot['receiptDate'] ?? null) as string | null,
    total: typeof totals['grandTotal'] === 'number' ? totals['grandTotal'] : null,
    acceptedQuantity: typeof totals['accepted'] === 'number' ? totals['accepted'] : null,
  };
}

/** Older versions of a document, newest first. */
export async function listRevisions(
  manager: EntityManager,
  documentId: string,
): Promise<RevisionSummary[]> {
  const rows = (await manager.query(`${SELECT_REVISIONS} ORDER BY r.revision_number DESC`, [
    documentId,
  ])) as RevisionRow[];
  return rows.map(summary);
}

/** One archived version: its snapshot and who replaced it, when and why. */
export async function loadRevision(
  manager: EntityManager,
  document: Document,
  revision: number,
): Promise<{ snapshot: Record<string, unknown>; superseded: SupersededRevision }> {
  const rows = (await manager.query(`${SELECT_REVISIONS} AND r.revision_number = $2`, [
    document.id,
    revision,
  ])) as RevisionRow[];
  const row = rows[0];

  if (!row) {
    throw new NotFoundException(`Version ${revision} of this document does not exist.`);
  }

  return {
    snapshot: row.snapshot,
    superseded: {
      revision: row.revision,
      reason: row.reason,
      supersededAt: new Date(row.supersededAt).toISOString(),
      supersededByName: row.supersededByName,
      currentRevision: document.revision,
      checksumValid: checksum(row.snapshot) === row.checksum,
    },
  };
}

/** SHA-256 of a key-sorted serialisation (jsonb does not keep key order). */
export function checksum(snapshot: Record<string, unknown>): string {
  return createHash('sha256').update(stableJson(snapshot)).digest('hex');
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableJson).join(',')}]`;
  }
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson((value as Record<string, unknown>)[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}
