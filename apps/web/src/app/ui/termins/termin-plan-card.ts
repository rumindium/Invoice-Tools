import { Component, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DOCUMENT_STATUS_LABEL } from '../../core/document-flow';
import { formatDate, formatMoney } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  TerminDraft,
  TerminPlan,
  TerminService,
  TerminSlot,
  formatPercentage,
} from '../../core/termin.service';
import { TerminDialog } from './termin-dialog';
import { TERMIN_COLORS } from './termin-planner';

/**
 * A termin plan on a document page (quotation, goods receipt, invoice): every termin with
 * its percentage, amount and document, and the actions — generate a termin, generate all
 * remaining, change the split, delete the plan. Emits the updated plan (null when deleted).
 */
@Component({
  selector: 'app-termin-plan-card',
  imports: [RouterLink, TerminDialog],
  templateUrl: './termin-plan-card.html',
  styleUrl: './termin-plan-card.scss',
})
export class TerminPlanCard {
  private readonly terminsApi = inject(TerminService);

  readonly plan = input.required<TerminPlan>();
  /** The document this page shows (highlighted in the list). */
  readonly currentId = input<string | null>(null);
  /** The page shows the source itself: no "from QUO/…" line. */
  readonly hideSource = input(false);
  readonly testId = input('termin-plan');

  readonly changed = output<TerminPlan | null>();

  protected readonly busy = signal<string | null>(null);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  protected readonly editing = signal(false);
  protected readonly editError = signal('');

  protected readonly formatMoney = formatMoney;
  protected readonly formatDate = formatDate;
  protected readonly formatPercentage = formatPercentage;
  protected readonly statusLabel = (status: string) => DOCUMENT_STATUS_LABEL[status] ?? status;
  protected readonly colors = TERMIN_COLORS;

  protected readonly isReceipts = computed(() => this.plan().documentType === 'GOODS_RECEIPT');
  protected readonly noun = computed(() => (this.isReceipts() ? 'goods receipt' : 'invoice'));
  protected readonly nounPlural = computed(() =>
    this.isReceipts() ? 'goods receipts' : 'invoices',
  );
  protected readonly mark = computed(() => (this.isReceipts() ? 'GR' : 'INV'));
  protected readonly remaining = computed(() =>
    this.plan().termins.filter((termin) => termin.canGenerate),
  );
  protected readonly sourceLink = computed(() => {
    const source = this.plan().source;
    if (!source) return null;
    return source.type === 'QUOTATION'
      ? ['/quotations', source.id]
      : ['/goods-receipts', source.id];
  });
  protected readonly baseLabel = computed(() => {
    const source = this.plan().source;
    if (!source) return 'Invoice total';
    return source.type === 'QUOTATION' ? 'Quotation total' : 'Billable receipt total';
  });

  protected readonly editDraft = computed<TerminDraft>(() => ({
    split: true,
    percentages: this.plan().termins.map((termin) => termin.percentage),
    generate: 'FIRST',
  }));
  protected readonly locked = computed(() =>
    this.plan().termins.map((termin) => termin.document?.number ?? (termin.document ? '—' : null)),
  );

  protected link(id: string): unknown[] {
    return [this.isReceipts() ? '/goods-receipts' : '/documents', id];
  }

  protected color(termin: TerminSlot): string {
    return TERMIN_COLORS[(termin.sequence - 1) % TERMIN_COLORS.length]!;
  }

  protected badgeClass(status: string): string {
    switch (status) {
      case 'RECEIVED':
      case 'PAID':
        return 'ui-badge ui-badge-green';
      case 'ISSUED':
        return 'ui-badge ui-badge-blue';
      case 'CANCELLED':
      case 'VOID':
        return 'ui-badge ui-badge-red';
      default:
        return 'ui-badge ui-badge-neutral';
    }
  }

  protected async generate(termin: TerminSlot): Promise<void> {
    await this.run(`termin-${termin.sequence}`, async () => {
      const result = await this.terminsApi.generate(this.plan().id, termin.sequence);
      const created = result.plan.termins.find((slot) => slot.sequence === termin.sequence);
      this.notice.set(
        `${created?.document?.number ?? 'The document'} was created for termin ${termin.sequence}.`,
      );
      return result.plan;
    });
  }

  protected async generateRemaining(): Promise<void> {
    await this.run('remaining', async () => {
      const result = await this.terminsApi.generateRemaining(this.plan().id);
      const numbers = result.documents
        .map((doc) => result.plan.termins.find((slot) => slot.sequence === doc.sequence))
        .map((slot) => slot?.document?.number)
        .filter(Boolean);
      this.notice.set(`Created ${numbers.join(', ')}.`);
      return result.plan;
    });
  }

  protected async saveSplit(draft: TerminDraft): Promise<void> {
    this.busy.set('edit');
    this.editError.set('');
    try {
      const plan = await this.terminsApi.update(this.plan().id, draft.percentages);
      this.editing.set(false);
      this.notice.set('The termin split was updated.');
      this.changed.emit(plan);
    } catch (error) {
      this.editError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }

  protected async remove(): Promise<void> {
    if (
      !confirm(
        `Delete this termin plan? The ${this.noun()} can then be created as a whole or split again.`,
      )
    ) {
      return;
    }
    await this.run('delete', async () => {
      await this.terminsApi.remove(this.plan().id);
      return null;
    });
  }

  protected openEdit(): void {
    this.editError.set('');
    this.editing.set(true);
  }

  private async run(key: string, action: () => Promise<TerminPlan | null>): Promise<void> {
    if (this.busy()) return;
    this.busy.set(key);
    this.error.set('');
    this.notice.set('');
    try {
      this.changed.emit(await action());
    } catch (error) {
      this.error.set(apiErrorMessage(error));
    } finally {
      this.busy.set(null);
    }
  }
}
