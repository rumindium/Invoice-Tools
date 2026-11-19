import { DocumentStatus } from '../database/entities/enums';

/**
 * Quotation lifecycle: DRAFT → SENT → ACCEPTED | REJECTED. EXPIRED is not stored; a sent
 * quotation whose valid-until date has passed is reported as expired.
 */
export const QUOTATION_STATUSES = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED'] as const;
export type QuotationStatus = (typeof QUOTATION_STATUSES)[number];

export const QUOTATION_TARGET_STATUSES = ['SENT', 'ACCEPTED', 'REJECTED'] as const;
export type QuotationTargetStatus = (typeof QUOTATION_TARGET_STATUSES)[number];

export const QUOTATION_TRANSITIONS: Record<string, QuotationTargetStatus[]> = {
  [DocumentStatus.DRAFT]: ['SENT'],
  [DocumentStatus.SENT]: ['ACCEPTED', 'REJECTED'],
  [DocumentStatus.ACCEPTED]: [],
  [DocumentStatus.REJECTED]: [],
};

export function nextQuotationStatuses(status: string): QuotationTargetStatus[] {
  return QUOTATION_TRANSITIONS[status] ?? [];
}

export function canTransition(from: string, to: string): boolean {
  return nextQuotationStatuses(from).includes(to as QuotationTargetStatus);
}

/** Only drafts can be edited; drafts and rejected quotations can be deleted. */
export function isEditable(status: string): boolean {
  return status === DocumentStatus.DRAFT;
}

/** Sent or accepted quotations are corrected with a revision (drafts are simply edited). */
export function isRevisable(status: string): boolean {
  return status === DocumentStatus.SENT || status === DocumentStatus.ACCEPTED;
}

export function isDeletable(status: string): boolean {
  return status === DocumentStatus.DRAFT || status === DocumentStatus.REJECTED;
}

export function isExpired(status: string, validUntil: string | null, today = todayIso()): boolean {
  return status === DocumentStatus.SENT && Boolean(validUntil) && validUntil!.slice(0, 10) < today;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
