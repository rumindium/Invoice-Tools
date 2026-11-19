import type { EntityManager } from 'typeorm';
import { DocumentStatus, DocumentType, RelationType } from '../database/entities/enums';

/** A document reached through a CONVERTED_TO link (quotation → goods receipt → invoice). */
export interface LinkedDocument {
  id: string;
  number: string | null;
  status: string;
  issueDate: string;
}

/**
 * The live document of `type` converted from `sourceId`: not deleted and not in
 * `inactiveStatus` (cancelled receipt, void invoice). There is at most one.
 */
export async function activeConvertedDocument(
  manager: EntityManager,
  sourceId: string,
  type: DocumentType,
  inactiveStatus: DocumentStatus,
): Promise<LinkedDocument | null> {
  const rows = (await manager.query(
    `SELECT d.id, d.document_number AS number, d.status,
            to_char(d.issue_date, 'YYYY-MM-DD') AS "issueDate"
       FROM document_relations r
       JOIN documents d ON d.id = r.target_document_id
      WHERE r.source_document_id = $1
        AND r.relation_type = $2
        AND d.document_type = $3
        AND d.deleted_at IS NULL
        AND d.status <> $4
      ORDER BY d.created_at DESC
      LIMIT 1`,
    [sourceId, RelationType.CONVERTED_TO, type, inactiveStatus],
  )) as LinkedDocument[];

  return rows[0] ?? null;
}

/** The id of the document `targetId` was converted from, if it was of `sourceType`. */
export async function convertedFromId(
  manager: EntityManager,
  targetId: string,
  sourceType: DocumentType,
): Promise<string | null> {
  const rows = (await manager.query(
    `SELECT r.source_document_id AS id
       FROM document_relations r
       JOIN documents s ON s.id = r.source_document_id
      WHERE r.target_document_id = $1
        AND r.relation_type = $2
        AND s.document_type = $3
      LIMIT 1`,
    [targetId, RelationType.CONVERTED_TO, sourceType],
  )) as Array<{ id: string }>;

  return rows[0]?.id ?? null;
}

export function activeInvoiceOf(manager: EntityManager, goodsReceiptId: string) {
  return activeConvertedDocument(
    manager,
    goodsReceiptId,
    DocumentType.INVOICE,
    DocumentStatus.VOID,
  );
}
