import { describe, expect, it } from 'vitest';
import Decimal from 'decimal.js';
import {
  evenSplit,
  moneyShare,
  quantityShare,
  terminBounds,
  terminText,
  totalPercentage,
  validatePercentages,
} from './termin-math';

describe('termin math', () => {
  it('validates the number of termins, each percentage and the total', () => {
    expect(validatePercentages([50, 50])).toBeNull();
    expect(validatePercentages([30, 30])).toBeNull();
    expect(validatePercentages([0, 40])).toBeNull();
    expect(validatePercentages([100])).toMatch(/2 to 12/);
    expect(validatePercentages(Array.from({ length: 13 }, () => 5))).toMatch(/2 to 12/);
    expect(validatePercentages([60, 50])).toMatch(/110%.*cannot exceed 100%/);
    expect(validatePercentages([-1, 50])).toMatch(/Termin 1 must be between/);
    expect(validatePercentages([50, 101])).toMatch(/Termin 2 must be between/);
    expect(validatePercentages([33.333, 20])).toMatch(/two decimals/);
    expect(validatePercentages([0, 0])).toMatch(/above 0%/);
  });

  it('splits evenly into termins that add up to 100%', () => {
    expect(evenSplit(2)).toEqual([50, 50]);
    expect(evenSplit(3)).toEqual([33.33, 33.33, 33.34]);
    expect(evenSplit(7).reduce((a, b) => a + b, 0)).toBeCloseTo(100, 8);
    expect(totalPercentage(evenSplit(6))).toBe(100);
  });

  it('gives every termin its cumulative share so a full plan adds up exactly', () => {
    const percentages = [33.33, 33.33, 33.34];
    const quantities = [1, 2, 3].map((sequence) =>
      quantityShare(7, terminBounds(percentages, sequence)),
    );
    expect(quantities.map(String)).toEqual(['2.3331', '2.3331', '2.3338']);
    expect(quantities.reduce((a, b) => a.plus(b), new Decimal(0)).toNumber()).toBe(7);

    const amounts = [1, 2, 3].map((sequence) =>
      moneyShare('100000.01', terminBounds(percentages, sequence)),
    );
    expect(amounts.reduce((a, b) => a.plus(b), new Decimal(0)).toString()).toBe('100000.01');
  });

  it('leaves the rest of a plan below 100% unbilled', () => {
    const bounds = terminBounds([30, 40], 2);
    expect(bounds.from.toNumber()).toBe(0.3);
    expect(bounds.to.toNumber()).toBe(0.7);
    expect(quantityShare(10, bounds).toNumber()).toBe(4);
  });

  it('prints the termin label', () => {
    expect(terminText({ sequence: 1, count: 3, percentage: 30 })).toBe('1 of 3 · 30%');
    expect(terminText({ sequence: 2, count: null, percentage: 33.33 })).toBe('2 · 33.33%');
  });
});
