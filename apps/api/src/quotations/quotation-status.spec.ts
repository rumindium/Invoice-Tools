import { describe, expect, it } from 'vitest';
import {
  canTransition,
  isDeletable,
  isEditable,
  isExpired,
  nextQuotationStatuses,
} from './quotation-status';

describe('quotation status rules', () => {
  it('moves draft → sent → accepted or rejected, and nowhere else', () => {
    expect(nextQuotationStatuses('DRAFT')).toEqual(['SENT']);
    expect(nextQuotationStatuses('SENT')).toEqual(['ACCEPTED', 'REJECTED']);
    expect(nextQuotationStatuses('ACCEPTED')).toEqual([]);
    expect(nextQuotationStatuses('REJECTED')).toEqual([]);
    expect(nextQuotationStatuses('PAID')).toEqual([]);

    expect(canTransition('DRAFT', 'ACCEPTED')).toBe(false);
    expect(canTransition('SENT', 'REJECTED')).toBe(true);
    expect(canTransition('ACCEPTED', 'SENT')).toBe(false);
  });

  it('only lets drafts be edited and drafts or rejected quotations be deleted', () => {
    expect(isEditable('DRAFT')).toBe(true);
    expect(isEditable('SENT')).toBe(false);
    expect(isDeletable('DRAFT')).toBe(true);
    expect(isDeletable('REJECTED')).toBe(true);
    expect(isDeletable('SENT')).toBe(false);
    expect(isDeletable('ACCEPTED')).toBe(false);
  });

  it('reports a sent quotation past its valid-until date as expired', () => {
    expect(isExpired('SENT', '2026-01-10', '2026-01-11')).toBe(true);
    expect(isExpired('SENT', '2026-01-11', '2026-01-11')).toBe(false);
    expect(isExpired('DRAFT', '2026-01-10', '2026-01-11')).toBe(false);
    expect(isExpired('ACCEPTED', '2026-01-10', '2026-01-11')).toBe(false);
    expect(isExpired('SENT', null, '2026-01-11')).toBe(false);
  });
});
