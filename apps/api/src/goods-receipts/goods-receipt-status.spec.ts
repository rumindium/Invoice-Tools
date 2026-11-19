import { describe, expect, it } from 'vitest';
import {
  canTransitionReceipt,
  isReceiptDeletable,
  isReceiptEditable,
  nextGoodsReceiptStatuses,
  validateReceiptLine,
} from './goods-receipt-status';

describe('goods receipt status rules', () => {
  it('posts drafts as received and lets drafts or posted receipts be cancelled', () => {
    expect(nextGoodsReceiptStatuses('DRAFT')).toEqual(['RECEIVED', 'CANCELLED']);
    expect(nextGoodsReceiptStatuses('RECEIVED')).toEqual(['CANCELLED']);
    expect(nextGoodsReceiptStatuses('CANCELLED')).toEqual([]);
    expect(canTransitionReceipt('RECEIVED', 'RECEIVED')).toBe(false);
    expect(canTransitionReceipt('CANCELLED', 'RECEIVED')).toBe(false);
  });

  it('edits drafts only and deletes drafts or cancelled receipts', () => {
    expect(isReceiptEditable('DRAFT')).toBe(true);
    expect(isReceiptEditable('RECEIVED')).toBe(false);
    expect(isReceiptDeletable('DRAFT')).toBe(true);
    expect(isReceiptDeletable('CANCELLED')).toBe(true);
    expect(isReceiptDeletable('RECEIVED')).toBe(false);
  });

  it('keeps 0 ≤ rejected ≤ received ≤ ordered on every line', () => {
    const line = (received: number, rejected: number) =>
      validateReceiptLine({ name: 'Cable', ordered: 10, received, rejected });

    expect(line(10, 0)).toBeNull();
    expect(line(4, 4)).toBeNull();
    expect(line(0, 0)).toBeNull();
    expect(line(11, 0)).toBe('Received quantity for "Cable" cannot exceed the ordered 10.');
    expect(line(3, 4)).toBe('Rejected quantity for "Cable" cannot exceed the received 3.');
    expect(line(-1, 0)).toBe('Quantities for "Cable" cannot be negative.');
  });
});
