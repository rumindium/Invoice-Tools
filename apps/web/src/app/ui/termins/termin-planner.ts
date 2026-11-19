import { Component, computed, input, model } from '@angular/core';
import { formatMoney } from '../../core/format';
import {
  MAX_TERMINS,
  MIN_TERMINS,
  TerminDraft,
  TerminGenerate,
  evenSplit,
  formatPercentage,
  sumPercentages,
  terminAmount,
  terminSplitError,
} from '../../core/termin.service';

/** Segment colours of the allocation bar, one per termin (repeating). */
export const TERMIN_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#059669', '#d97706', '#db2777'];

export const SINGLE_DRAFT: TerminDraft = { split: false, percentages: [], generate: 'FIRST' };

/** The blocking problem of a draft (only split drafts can have one). */
export function terminDraftError(draft: TerminDraft): string | null {
  return draft.split ? terminSplitError(draft.percentages) : null;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * Chooses between one document and payment termins, and splits the termins: how many
 * (2–12), each termin's percentage (slider or typed, 0–100%), with the amount of each, an
 * allocation bar and what is left. The total can never exceed 100%; termins with a live
 * document (`locked`) keep their percentage.
 */
@Component({
  selector: 'app-termin-planner',
  templateUrl: './termin-planner.html',
  styleUrl: './termin-planner.scss',
})
export class TerminPlanner {
  readonly draft = model.required<TerminDraft>();
  /** Value of the whole source, for the amount of each termin. */
  readonly total = input(0);
  readonly currency = input('IDR');
  /** "goods receipt" / "invoice". */
  readonly noun = input('invoice');
  readonly nounPlural = input('invoices');
  /** Offer "one document" next to termins (off when editing an existing plan). */
  readonly allowSingle = input(true);
  /** Offer "create termin 1 now" / "create all now" (off when editing a plan). */
  readonly showGenerate = input(true);
  /** Per termin: the number of its live document (percentage fixed), or null. */
  readonly locked = input<Array<string | null>>([]);
  readonly testId = input('termin-planner');

  protected readonly minTermins = MIN_TERMINS;
  protected readonly maxTermins = MAX_TERMINS;
  protected readonly colors = TERMIN_COLORS;
  protected readonly formatPercentage = formatPercentage;

  protected readonly split = computed(() => this.draft().split || !this.allowSingle());
  protected readonly percentages = computed(() => this.draft().percentages);
  protected readonly count = computed(() => this.percentages().length);
  protected readonly allocated = computed(() => sumPercentages(this.percentages()));
  protected readonly remaining = computed(() => round2(100 - this.allocated()));
  protected readonly error = computed(() => terminSplitError(this.percentages()));
  protected readonly lockedCount = computed(() => this.locked().filter(Boolean).length);
  /** The termin count cannot drop below the last termin that has a live document. */
  protected readonly minCount = computed(() =>
    Math.max(
      MIN_TERMINS,
      this.locked().reduce((last, doc, index) => (doc ? index + 1 : last), 0),
    ),
  );
  protected readonly zeroTermins = computed(() =>
    this.percentages()
      .map((value, index) => (value === 0 ? index + 1 : 0))
      .filter(Boolean),
  );
  protected readonly withShare = computed(() => this.percentages().filter((value) => value > 0));
  protected readonly firstWithShare = computed(
    () => this.percentages().findIndex((value) => value > 0) + 1,
  );

  protected readonly rows = computed(() => {
    const percentages = this.percentages();
    return percentages.map((percentage, index) => ({
      sequence: index + 1,
      percentage,
      amount: terminAmount(this.total(), percentages, index + 1),
      color: TERMIN_COLORS[index % TERMIN_COLORS.length]!,
      locked: this.locked()[index] ?? null,
    }));
  });

  protected money(value: number): string {
    return formatMoney(value, this.currency());
  }

  protected setSplit(split: boolean): void {
    const current = this.draft();
    if (split === current.split) return;
    this.draft.set({
      ...current,
      split,
      percentages: split && current.percentages.length === 0 ? evenSplit(2) : current.percentages,
    });
  }

  protected setCount(count: number): void {
    const next = clamp(count, this.minCount(), MAX_TERMINS);
    if (next === this.count()) return;
    this.draft.update((draft) => ({ ...draft, percentages: this.spread(next) }));
  }

  protected splitEvenly(): void {
    this.draft.update((draft) => ({ ...draft, percentages: this.spread(this.count()) }));
  }

  /** Slider: clamped to what the other termins leave, so the total never exceeds 100%. */
  protected slide(index: number, event: Event): void {
    const others = round2(this.allocated() - (this.percentages()[index] ?? 0));
    const value = clamp(Number((event.target as HTMLInputElement).value), 0, round2(100 - others));
    (event.target as HTMLInputElement).value = String(value);
    this.setPercentage(index, value);
  }

  /** Typed percentage: 0–100 with two decimals; a total above 100% is reported, not fixed. */
  protected type(index: number, event: Event): void {
    const raw = (event.target as HTMLInputElement).value;
    const value = raw.trim() === '' ? 0 : Number(raw);
    this.setPercentage(index, Number.isFinite(value) ? round2(clamp(value, 0, 100)) : 0);
  }

  protected setGenerate(generate: TerminGenerate): void {
    this.draft.update((draft) => ({ ...draft, generate }));
  }

  private setPercentage(index: number, value: number): void {
    this.draft.update((draft) => ({
      ...draft,
      percentages: draft.percentages.map((current, position) =>
        position === index ? value : current,
      ),
    }));
  }

  /**
   * `count` termins: locked ones keep their percentage, the others share what is left
   * evenly.
   */
  private spread(count: number): number[] {
    const current = this.percentages();
    const locked = this.locked();
    const fixed = Array.from({ length: count }, (_, index) =>
      locked[index] ? (current[index] ?? 0) : null,
    );
    const fixedTotal = sumPercentages(fixed.filter((value): value is number => value !== null));
    const free = fixed.filter((value) => value === null).length;
    const shares = free ? evenSplit(free, Math.max(0, round2(100 - fixedTotal))) : [];
    return fixed.map((value) => value ?? shares.shift() ?? 0);
  }
}
