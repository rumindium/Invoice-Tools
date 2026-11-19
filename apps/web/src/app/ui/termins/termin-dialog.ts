import { isPlatformBrowser } from '@angular/common';
import {
  Component,
  ElementRef,
  PLATFORM_ID,
  computed,
  effect,
  inject,
  input,
  linkedSignal,
  output,
  viewChild,
} from '@angular/core';
import { formatMoney } from '../../core/format';
import { TerminDraft } from '../../core/termin.service';
import { SINGLE_DRAFT, TerminPlanner, terminDraftError } from './termin-planner';

/**
 * A modal (native <dialog>) that asks how a document is created: one document or payment
 * termins, with the termin planner. Also edits the split of an existing plan
 * (`mode="edit"`). The parent does the saving: it gets `confirmed` and passes `busy`/`error`.
 */
@Component({
  selector: 'app-termin-dialog',
  imports: [TerminPlanner],
  templateUrl: './termin-dialog.html',
  styleUrl: './termin-dialog.scss',
})
export class TerminDialog {
  private readonly browser = isPlatformBrowser(inject(PLATFORM_ID));

  readonly open = input(false);
  readonly heading = input.required<string>();
  readonly intro = input('');
  /** "QUO/2026/0001 · PT Kopi Senja" — what is being split. */
  readonly sourceLabel = input('');
  readonly total = input(0);
  readonly currency = input('IDR');
  readonly noun = input('invoice');
  readonly nounPlural = input('invoices');
  readonly mode = input<'create' | 'edit'>('create');
  /** Starting point (edit: the plan's percentages). */
  readonly initial = input<TerminDraft>(SINGLE_DRAFT);
  readonly locked = input<Array<string | null>>([]);
  /** Termins are not offered (a termin goods receipt is invoiced as a whole); shown as a note. */
  readonly splitBlockedReason = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  readonly testId = input('termin-dialog');

  readonly confirmed = output<TerminDraft>();
  readonly closed = output<void>();

  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** Reset to `initial` every time the dialog opens. */
  protected readonly draft = linkedSignal<TerminDraft>(() => {
    this.open();
    return this.initial();
  });

  protected readonly problem = computed(() => terminDraftError(this.draft()));
  protected readonly formatMoney = formatMoney;

  protected readonly confirmLabel = computed(() => {
    const draft = this.draft();
    if (this.mode() === 'edit') return 'Save split';
    if (!draft.split) return `Create ${this.noun()}`;
    const withShare = draft.percentages
      .map((value, index) => (value > 0 ? index + 1 : 0))
      .filter(Boolean);
    if (draft.generate === 'ALL') {
      return `Create ${withShare.length} ${withShare.length === 1 ? this.noun() : this.nounPlural()}`;
    }
    return `Create termin ${withShare[0] ?? 1}`;
  });

  constructor() {
    effect(() => {
      const element = this.dialog()?.nativeElement;
      if (!this.browser || !element || typeof element.showModal !== 'function') return;
      if (this.open() && !element.open) element.showModal();
      if (!this.open() && element.open) element.close();
    });
  }

  protected confirm(): void {
    if (this.busy() || this.problem()) return;
    this.confirmed.emit(this.splitBlockedReason() ? SINGLE_DRAFT : this.draft());
  }

  /** Escape or the close button: the parent decides (it keeps the dialog while saving). */
  protected cancel(event?: Event): void {
    event?.preventDefault();
    if (!this.busy()) this.closed.emit();
  }
}
