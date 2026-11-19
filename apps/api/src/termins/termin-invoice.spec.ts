import { describe, expect, it } from 'vitest';
import type { InvoicePayloadDto } from '../documents/dto/invoice.dto';
import { terminBounds } from './termin-math';
import { terminInvoicePayload } from './termin-invoice';

const base: InvoicePayloadDto = {
  customer: { name: 'PT Kopi Senja' },
  issueDate: '2026-11-02',
  dueDate: '2026-11-16',
  discountType: 'AMOUNT',
  discountAmount: 100_000,
  shippingAmount: 50_000,
  items: [
    { name: 'Design', quantity: 1, unitPrice: 1_500_000, taxRate: 11 },
    {
      name: 'Retainer',
      quantity: 3,
      unitPrice: 800_000,
      discountType: 'AMOUNT',
      discountAmount: 30_000,
    },
  ],
};

describe('terminInvoicePayload', () => {
  it('bills the termin share of quantities, discounts and charges', () => {
    const payload = terminInvoicePayload(base, terminBounds([30, 70], 1), '2026-11-02');

    expect(payload.items.map((item) => item.quantity)).toEqual([0.3, 0.9]);
    expect(payload.items[1]!.discountAmount).toBe(9_000);
    expect(payload.discountAmount).toBe(30_000);
    expect(payload.shippingAmount).toBe(15_000);
    expect(payload.issueDate).toBe('2026-11-02');
    expect(payload.dueDate).toBe('2026-11-16');
  });

  it('makes the termins of a full plan add up to the typed invoice', () => {
    const percentages = [33.33, 33.33, 33.34];
    const parts = [1, 2, 3].map((sequence) =>
      terminInvoicePayload(base, terminBounds(percentages, sequence), '2026-11-02'),
    );

    const quantity = (index: number) =>
      parts.reduce((total, part) => total + part.items[index]!.quantity, 0);
    expect(quantity(0)).toBeCloseTo(1, 10);
    expect(quantity(1)).toBeCloseTo(3, 10);
    expect(parts.reduce((total, part) => total + part.shippingAmount!, 0)).toBe(50_000);
  });

  it('dates a later termin today and keeps the payment term', () => {
    const payload = terminInvoicePayload(base, terminBounds([50, 50], 2), '2026-12-01');
    expect(payload.issueDate).toBe('2026-12-01');
    expect(payload.dueDate).toBe('2026-12-15');
  });

  it('leaves out lines whose share rounds to zero', () => {
    const payload = terminInvoicePayload(
      { ...base, items: [{ name: 'Pin', quantity: 0.0001, unitPrice: 10 }, ...base.items] },
      terminBounds([10, 90], 1),
      '2026-11-02',
    );
    expect(payload.items.map((item) => item.name)).toEqual(['Design', 'Retainer']);
  });
});
