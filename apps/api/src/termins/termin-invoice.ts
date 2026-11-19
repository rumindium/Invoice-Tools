import { toDateOnly } from '../documents/document-support';
import type { InvoicePayloadDto } from '../documents/dto/invoice.dto';
import { moneyShare, quantityShare, type TerminBounds } from './termin-math';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round(
    (Date.parse(`${to}T00:00:00.000Z`) - Date.parse(`${from}T00:00:00.000Z`)) / 86_400_000,
  );
}

/**
 * The invoice of one termin of an invoice typed in the generator: its share of every
 * quantity, amount discount and charge. A termin generated later than the typed invoice date
 * is dated today and keeps the same payment term.
 */
export function terminInvoicePayload(
  base: InvoicePayloadDto,
  bounds: TerminBounds,
  today = todayIso(),
): InvoicePayloadDto {
  const baseIssue = toDateOnly(base.issueDate);
  const issueDate = today > baseIssue ? today : baseIssue;
  const dueDate = base.dueDate
    ? addDays(issueDate, Math.max(0, daysBetween(baseIssue, toDateOnly(base.dueDate))))
    : undefined;
  const money = (value: number | undefined) =>
    value === undefined ? undefined : moneyShare(value, bounds).toNumber();

  return {
    ...base,
    issueDate,
    dueDate,
    discountAmount: base.discountType === 'AMOUNT' ? money(base.discountAmount) : undefined,
    shippingAmount: money(base.shippingAmount),
    additionalCharges: money(base.additionalCharges),
    items: base.items
      .map((item) => ({
        ...item,
        quantity: quantityShare(item.quantity, bounds).toNumber(),
        discountAmount: item.discountType === 'AMOUNT' ? money(item.discountAmount) : undefined,
      }))
      .filter((item) => item.quantity > 0),
  };
}
