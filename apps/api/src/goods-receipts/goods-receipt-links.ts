import type { EntityManager } from 'typeorm';
import { DocumentStatus, DocumentType } from '../database/entities/enums';
import { activeConvertedDocument, type LinkedDocument } from '../documents/document-links';

export type LinkedGoodsReceipt = LinkedDocument;

/**
 * The quotation's current goods receipt: linked by a CONVERTED_TO relation, not deleted and
 * not cancelled. A quotation has at most one; cancelling or deleting it allows a new one.
 */
export function activeGoodsReceipt(
  manager: EntityManager,
  quotationId: string,
): Promise<LinkedGoodsReceipt | null> {
  return activeConvertedDocument(
    manager,
    quotationId,
    DocumentType.GOODS_RECEIPT,
    DocumentStatus.CANCELLED,
  );
}

/**
 * SQL fragment: true when quotation alias `q` has no active goods receipt and is not
 * received in payment termins.
 */
export const NO_ACTIVE_GOODS_RECEIPT = `NOT EXISTS (
  SELECT 1 FROM termin_plans p
   WHERE p.source_document_id = q.id
     AND p.document_type = 'GOODS_RECEIPT')
  AND NOT EXISTS (
  SELECT 1 FROM document_relations r
    JOIN documents g ON g.id = r.target_document_id
   WHERE r.source_document_id = q.id
     AND r.relation_type = 'CONVERTED_TO'
     AND g.document_type = 'GOODS_RECEIPT'
     AND g.deleted_at IS NULL
     AND g.status <> 'CANCELLED')`;
