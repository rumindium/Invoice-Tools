import type { CustomerFeedback, Document } from '../database/entities';
import type { DocumentHistoryEntry } from '../documents/document-support';
import { nextFeedbackStatuses } from './feedback-rules';

export type RelatedDocumentType = 'QUOTATION' | 'GOODS_RECEIPT' | 'INVOICE';

export interface RelatedDocumentView {
  id: string;
  type: RelatedDocumentType;
  number: string | null;
  date: string;
  status: string;
}

export interface FeedbackView {
  id: string;
  customer: { id: string | null; name: string; archived: boolean };
  contactName: string | null;
  source: string;
  sourceDetail: string | null;
  category: string;
  rating: number | null;
  subject: string;
  message: string;
  receivedOn: string;
  status: string;
  nextStatuses: string[];
  resolution: string | null;
  resolvedAt: string | null;
  relatedDocument: RelatedDocumentView | null;
  evidence: string | null;
  createdByName: string | null;
  history: DocumentHistoryEntry[];
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackListRow {
  id: string;
  customerId: string | null;
  customerName: string;
  contactName: string | null;
  source: string;
  sourceDetail: string | null;
  category: string;
  rating: number | null;
  subject: string;
  receivedOn: string;
  status: string;
  relatedDocument: RelatedDocumentView | null;
  createdAt: string;
}

export interface FeedbackSummary {
  total: number;
  open: number;
  byStatus: Record<string, number>;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
  ratedCount: number;
  averageRating: number | null;
  thisMonth: number;
}

export type FeedbackWithRelations = CustomerFeedback & {
  relatedDocument?: Document | null;
  createdBy?: { displayName: string } | null;
  customer?: { archivedAt: Date | null } | null;
};

export function toRelatedDocumentView(
  document: Document | null | undefined,
): RelatedDocumentView | null {
  if (!document || document.deletedAt) {
    return null;
  }
  return {
    id: document.id,
    type: document.documentType as RelatedDocumentType,
    number: document.documentNumber,
    date: document.issueDate,
    status: document.status,
  };
}

export function toFeedbackListRow(feedback: FeedbackWithRelations): FeedbackListRow {
  return {
    id: feedback.id,
    customerId: feedback.customerId,
    customerName: feedback.customerName,
    contactName: feedback.contactName,
    source: feedback.source,
    sourceDetail: feedback.sourceDetail,
    category: feedback.category,
    rating: feedback.rating,
    subject: feedback.subject,
    receivedOn: feedback.receivedOn,
    status: feedback.status,
    relatedDocument: toRelatedDocumentView(feedback.relatedDocument),
    createdAt: feedback.createdAt.toISOString(),
  };
}

export function toFeedbackView(
  feedback: FeedbackWithRelations,
  history: DocumentHistoryEntry[] = [],
): FeedbackView {
  return {
    id: feedback.id,
    customer: {
      id: feedback.customerId,
      name: feedback.customerName,
      archived: Boolean(feedback.customer?.archivedAt),
    },
    contactName: feedback.contactName,
    source: feedback.source,
    sourceDetail: feedback.sourceDetail,
    category: feedback.category,
    rating: feedback.rating,
    subject: feedback.subject,
    message: feedback.message,
    receivedOn: feedback.receivedOn,
    status: feedback.status,
    nextStatuses: nextFeedbackStatuses(feedback.status),
    resolution: feedback.resolution,
    resolvedAt: feedback.resolvedAt?.toISOString() ?? null,
    relatedDocument: toRelatedDocumentView(feedback.relatedDocument),
    evidence: feedback.evidence,
    createdByName: feedback.createdBy?.displayName ?? null,
    history,
    createdAt: feedback.createdAt.toISOString(),
    updatedAt: feedback.updatedAt.toISOString(),
  };
}
