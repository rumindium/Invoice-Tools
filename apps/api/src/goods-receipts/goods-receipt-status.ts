import { DocumentStatus } from '../database/entities/enums';

/**
 * Goods receipt lifecycle: DRAFT (counting and inspecting) → RECEIVED (posted), and either
 * can be CANCELLED with a reason. Cancelling frees the quotation for a new receipt.
 */
export const GOODS_RECEIPT_STATUSES = ['DRAFT', 'RECEIVED', 'CANCELLED'] as const;
export type GoodsReceiptStatus = (typeof GOODS_RECEIPT_STATUSES)[number];

export const GOODS_RECEIPT_TARGET_STATUSES = ['RECEIVED', 'CANCELLED'] as const;
export type GoodsReceiptTargetStatus = (typeof GOODS_RECEIPT_TARGET_STATUSES)[number];

const TRANSITIONS: Record<string, GoodsReceiptTargetStatus[]> = {
  [DocumentStatus.DRAFT]: ['RECEIVED', 'CANCELLED'],
  [DocumentStatus.RECEIVED]: ['CANCELLED'],
  [DocumentStatus.CANCELLED]: [],
};

export function nextGoodsReceiptStatuses(status: string): GoodsReceiptTargetStatus[] {
  return TRANSITIONS[status] ?? [];
}

export function canTransitionReceipt(from: string, to: string): boolean {
  return nextGoodsReceiptStatuses(from).includes(to as GoodsReceiptTargetStatus);
}

export function isReceiptEditable(status: string): boolean {
  return status === DocumentStatus.DRAFT;
}

export function isReceiptDeletable(status: string): boolean {
  return status === DocumentStatus.DRAFT || status === DocumentStatus.CANCELLED;
}

/** Per line: 0 ≤ rejected ≤ received ≤ ordered. Returns an error message or null. */
export function validateReceiptLine(line: {
  name: string;
  ordered: number;
  received: number;
  rejected: number;
}): string | null {
  if (line.received < 0 || line.rejected < 0) {
    return `Quantities for "${line.name}" cannot be negative.`;
  }
  if (line.received > line.ordered) {
    return `Received quantity for "${line.name}" cannot exceed the ordered ${line.ordered}.`;
  }
  if (line.rejected > line.received) {
    return `Rejected quantity for "${line.name}" cannot exceed the received ${line.received}.`;
  }
  return null;
}
