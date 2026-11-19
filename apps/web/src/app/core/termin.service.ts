import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import type { InvoicePayload } from './invoice.service';

/**
 * Payment termins: an accepted quotation received as several goods receipts, or a goods
 * receipt / typed invoice billed as several invoices, each carrying a percentage (0–100%,
 * together at most 100%). Mirrors apps/api/src/termins.
 */

export const MIN_TERMINS = 2;
export const MAX_TERMINS = 12;

export type TerminGenerate = 'FIRST' | 'ALL';

/** The termin a document is. */
export interface TerminRef {
  planId: string | null;
  sequence: number;
  count: number | null;
  percentage: number;
  /** Invoices of a termin goods receipt carry the receipt's termin. */
  via: 'GOODS_RECEIPT' | null;
}

export interface TerminDocument {
  id: string;
  number: string | null;
  status: string;
  revision: number;
  issueDate: string;
  total: number;
}

export interface TerminSlot {
  sequence: number;
  percentage: number;
  amount: number;
  document: TerminDocument | null;
  previous: TerminDocument | null;
  canGenerate: boolean;
}

export interface TerminPlan {
  id: string;
  documentType: 'GOODS_RECEIPT' | 'INVOICE';
  source: { type: 'QUOTATION' | 'GOODS_RECEIPT'; id: string; number: string | null } | null;
  currency: string;
  baseTotal: number;
  totalPercentage: number;
  remainingPercentage: number;
  termins: TerminSlot[];
  liveCount: number;
  blockedReason: string | null;
  canDelete: boolean;
  createdAt: string;
}

export interface TerminPlanResult {
  plan: TerminPlan;
  documents: Array<{ id: string; sequence: number }>;
}

/** What the termin planner produces. */
export interface TerminDraft {
  /** False: one document for the whole source. */
  split: boolean;
  percentages: number[];
  generate: TerminGenerate;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

export function sumPercentages(percentages: number[]): number {
  return round2(percentages.reduce((total, value) => total + value, 0));
}

/** An even split that adds up to `total`% (the last termin takes the rounding). */
export function evenSplit(count: number, total = 100): number[] {
  const share = Math.floor((total / count) * 100) / 100;
  const values = Array.from({ length: count }, () => share);
  values[count - 1] = round2(total - share * (count - 1));
  return values;
}

/** A blocking problem with the split, or null. Mirrors the API's validation. */
export function terminSplitError(percentages: number[]): string | null {
  if (percentages.length < MIN_TERMINS || percentages.length > MAX_TERMINS) {
    return `Split into ${MIN_TERMINS} to ${MAX_TERMINS} termins.`;
  }
  const invalid = percentages.findIndex(
    (value) => !Number.isFinite(value) || value < 0 || value > 100,
  );
  if (invalid >= 0) {
    return `Termin ${invalid + 1} must be between 0% and 100%.`;
  }
  const total = sumPercentages(percentages);
  if (total > 100) {
    return `The termins add up to ${formatPercentage(total)}. Lower a termin by ${formatPercentage(
      round2(total - 100),
    )} so the total is at most 100%.`;
  }
  if (total <= 0) {
    return 'Give at least one termin a percentage above 0%.';
  }
  return null;
}

/**
 * The termin's amount: round(total × through) − round(total × before), the same cumulative
 * split the API uses, so the termins of a 100% plan add up to the total exactly.
 */
export function terminAmount(total: number, percentages: number[], sequence: number): number {
  const before = percentages.slice(0, sequence - 1).reduce((sum, value) => sum + value, 0);
  const through = before + (percentages[sequence - 1] ?? 0);
  return round2(round2((total * through) / 100) - round2((total * before) / 100));
}

export function formatPercentage(value: number): string {
  return `${Number(value.toFixed(2))}%`;
}

/** "Termin 1 of 3 · 30%". */
export function terminLabel(termin: Pick<TerminRef, 'sequence' | 'count' | 'percentage'>): string {
  const of = termin.count ? ` of ${termin.count}` : '';
  return `Termin ${termin.sequence}${of} · ${formatPercentage(termin.percentage)}`;
}

/** "1/3" for list badges. */
export function terminShortLabel(termin: Pick<TerminRef, 'sequence' | 'count'>): string {
  return termin.count ? `${termin.sequence}/${termin.count}` : `${termin.sequence}`;
}

@Injectable({ providedIn: 'root' })
export class TerminService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  private async url(path: string): Promise<string> {
    return `${await this.api.apiOrigin}/api/v1/termin-plans${path}`;
  }

  /** Accepted quotation → goods receipts in termins. */
  async forQuotation(quotationId: string, draft: TerminDraft): Promise<TerminPlanResult> {
    return firstValueFrom(
      this.http.post<TerminPlanResult>(
        await this.url('/goods-receipts'),
        { quotationId, percentages: draft.percentages, generate: draft.generate },
        { withCredentials: true },
      ),
    );
  }

  /** Received goods receipt → invoices in termins. */
  async forGoodsReceipt(goodsReceiptId: string, draft: TerminDraft): Promise<TerminPlanResult> {
    return firstValueFrom(
      this.http.post<TerminPlanResult>(
        await this.url('/invoices/from-goods-receipt'),
        { goodsReceiptId, percentages: draft.percentages, generate: draft.generate },
        { withCredentials: true },
      ),
    );
  }

  /** Typed invoice → invoices in termins. */
  async forInvoice(invoice: InvoicePayload, draft: TerminDraft): Promise<TerminPlanResult> {
    return firstValueFrom(
      this.http.post<TerminPlanResult>(
        await this.url('/invoices'),
        { invoice, percentages: draft.percentages, generate: draft.generate },
        { withCredentials: true },
      ),
    );
  }

  async get(planId: string): Promise<TerminPlan> {
    const response = await firstValueFrom(
      this.http.get<{ plan: TerminPlan }>(await this.url(`/${planId}`), { withCredentials: true }),
    );
    return response.plan;
  }

  async update(planId: string, percentages: number[]): Promise<TerminPlan> {
    const response = await firstValueFrom(
      this.http.put<{ plan: TerminPlan }>(
        await this.url(`/${planId}`),
        { percentages },
        { withCredentials: true },
      ),
    );
    return response.plan;
  }

  async generate(planId: string, sequence: number): Promise<TerminPlanResult> {
    return firstValueFrom(
      this.http.post<TerminPlanResult>(
        await this.url(`/${planId}/termins/${sequence}/generate`),
        {},
        { withCredentials: true },
      ),
    );
  }

  async generateRemaining(planId: string): Promise<TerminPlanResult> {
    return firstValueFrom(
      this.http.post<TerminPlanResult>(
        await this.url(`/${planId}/generate-remaining`),
        {},
        { withCredentials: true },
      ),
    );
  }

  async remove(planId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(await this.url(`/${planId}`), { withCredentials: true }),
    );
  }
}

/** History titles of termin plan events (recorded on the split document). */
export function terminPlanEventTitle(action: string): string | null {
  if (action.endsWith('.termin_plan_created')) return 'Split into payment termins';
  if (action.endsWith('.termin_plan_updated')) return 'Termin split changed';
  if (action.endsWith('.termin_plan_deleted')) return 'Termin plan deleted';
  return null;
}

/** "Goods receipt created · termin 2 of 3" for creation events of termin documents. */
export function withTermin(
  title: string,
  entry: { termin?: { sequence: number; count: number } | null },
): string {
  return entry.termin
    ? `${title} · termin ${entry.termin.sequence} of ${entry.termin.count}`
    : title;
}
