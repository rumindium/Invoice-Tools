import Decimal from 'decimal.js';

/**
 * Payment termins split a source into 2–12 documents. Each termin has a percentage
 * (0–100, two decimals) and the plan's total may not exceed 100%. A termin carries its share
 * of every quantity and amount, computed cumulatively — termin k gets
 * round(value × through_k) − round(value × before_k) — so the termins of a 100% plan add up
 * to the source exactly, whatever order they are generated in.
 */
export const MIN_TERMINS = 2;
export const MAX_TERMINS = 12;

const QUANTITY_PLACES = 4;
const MONEY_PLACES = 2;

/** Fractions (0–1) of the source before and through one termin. */
export interface TerminBounds {
  from: Decimal;
  to: Decimal;
}

const sum = (values: number[]): Decimal =>
  values.reduce((total, value) => total.plus(value), new Decimal(0));

export function totalPercentage(percentages: number[]): number {
  return sum(percentages).toDecimalPlaces(2).toNumber();
}

/** An error message for an invalid split, or null. */
export function validatePercentages(percentages: number[]): string | null {
  if (percentages.length < MIN_TERMINS || percentages.length > MAX_TERMINS) {
    return `Split into ${MIN_TERMINS} to ${MAX_TERMINS} termins.`;
  }

  for (const [index, value] of percentages.entries()) {
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return `Termin ${index + 1} must be between 0% and 100%.`;
    }
    if (!new Decimal(value).toDecimalPlaces(2).eq(value)) {
      return `Termin ${index + 1} can have at most two decimals.`;
    }
  }

  const total = sum(percentages);
  if (total.gt(100)) {
    return `The termins add up to ${formatPercentage(total.toNumber())}; the total cannot exceed 100%.`;
  }
  if (total.lte(0)) {
    return 'Give at least one termin a percentage above 0%.';
  }

  return null;
}

/** An even split that adds up to exactly 100% (the last termin takes the rounding). */
export function evenSplit(count: number): number[] {
  const share = new Decimal(100).div(count).toDecimalPlaces(2, Decimal.ROUND_DOWN);
  const values = Array.from({ length: count }, () => share.toNumber());
  values[count - 1] = new Decimal(100)
    .minus(share.mul(count - 1))
    .toDecimalPlaces(2)
    .toNumber();
  return values;
}

export function terminBounds(percentages: number[], sequence: number): TerminBounds {
  const before = sum(percentages.slice(0, sequence - 1));
  const through = before.plus(percentages[sequence - 1] ?? 0);
  return { from: before.div(100), to: through.div(100) };
}

function share(value: Decimal.Value, bounds: TerminBounds, places: number): Decimal {
  const whole = new Decimal(value);
  return whole
    .mul(bounds.to)
    .toDecimalPlaces(places, Decimal.ROUND_HALF_UP)
    .minus(whole.mul(bounds.from).toDecimalPlaces(places, Decimal.ROUND_HALF_UP));
}

/** The termin's part of a quantity (four decimals). */
export function quantityShare(quantity: Decimal.Value, bounds: TerminBounds): Decimal {
  return share(quantity, bounds, QUANTITY_PLACES);
}

/** The termin's part of an amount (cents). */
export function moneyShare(amount: Decimal.Value, bounds: TerminBounds): Decimal {
  return share(amount, bounds, MONEY_PLACES);
}

export function formatPercentage(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** "1 of 3 · 30%" — printed on termin documents. */
export function terminText(termin: {
  sequence: number;
  count: number | null;
  percentage: number;
}): string {
  const of = termin.count ? ` of ${termin.count}` : '';
  return `${termin.sequence}${of} · ${formatPercentage(termin.percentage)}`;
}
