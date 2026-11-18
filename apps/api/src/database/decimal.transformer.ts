import Decimal from 'decimal.js';
import type { ValueTransformer } from 'typeorm';

/**
 * PostgreSQL returns `numeric` as a string and expects one on write. Money stays in
 * `Decimal` inside the application so no amount is ever a floating point number.
 */
export const decimalTransformer: ValueTransformer = {
  to(value?: Decimal | null): string | null {
    return value === null || value === undefined ? null : value.toString();
  },
  from(value?: string | null): Decimal | null {
    return value === null || value === undefined ? null : new Decimal(value);
  },
};

export { Decimal };
