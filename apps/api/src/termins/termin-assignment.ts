import { Decimal } from '../database/decimal.transformer';
import type { TerminBounds } from './termin-math';

/** The termin a document is generated for: its plan, number, share and bounds. */
export interface TerminAssignment {
  planId: string;
  sequence: number;
  count: number;
  percentage: number;
  bounds: TerminBounds;
}

/** The documents.termin_* columns for a generated document. */
export function terminColumns(termin?: TerminAssignment) {
  return termin
    ? {
        terminPlanId: termin.planId,
        terminSequence: termin.sequence,
        terminPercentage: new Decimal(termin.percentage),
      }
    : {};
}

/** Audit metadata: `termin: { sequence, count, percentage }`. */
export function terminMetadata(termin?: TerminAssignment) {
  return termin
    ? {
        termin: {
          sequence: termin.sequence,
          count: termin.count,
          percentage: termin.percentage,
        },
      }
    : {};
}
