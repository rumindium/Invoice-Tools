import { describe, expect, it } from 'vitest';
import { checksum, numberWithRevision, requireReason, snapshotOf } from './revisions';

describe('document revisions', () => {
  it('snapshots the document, not its live state or the company logo', () => {
    const snapshot = snapshotOf({
      id: 'q-1',
      status: 'SENT',
      totals: { grandTotal: 100 },
      company: { name: 'Studio', logoDataUrl: 'data:image/png;base64,AAAA' },
      history: [{ action: 'quotation.created' }],
      nextStatuses: ['ACCEPTED'],
      revisions: [{ revision: 1 }],
      canRevise: true,
      goodsReceipt: { id: 'g-1' },
    });

    expect(snapshot).toEqual({
      id: 'q-1',
      status: 'SENT',
      totals: { grandTotal: 100 },
      company: { name: 'Studio', logoDataUrl: null },
    });
  });

  it('checksums independently of key order, as jsonb reorders keys', () => {
    const stored = { b: 1, a: { d: [1, { y: 2, x: 1 }], c: 'x' } };
    const reloaded = { a: { c: 'x', d: [1, { x: 1, y: 2 }] }, b: 1 };

    expect(checksum(reloaded)).toBe(checksum(stored));
    expect(checksum({ ...stored, b: 2 })).not.toBe(checksum(stored));
    expect(checksum(stored)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('labels revised numbers and requires a meaningful reason', () => {
    expect(numberWithRevision('QUO/2026/0001', 1)).toBe('QUO/2026/0001');
    expect(numberWithRevision('QUO/2026/0001', 3)).toBe('QUO/2026/0001 · Rev. 3');
    expect(numberWithRevision(null, 2)).toBe('Draft · Rev. 2');

    expect(requireReason('  Wrong price  ')).toBe('Wrong price');
    expect(() => requireReason('no')).toThrow('Describe what was wrong (at least 3 characters).');
    expect(() => requireReason(undefined)).toThrow();
  });
});
