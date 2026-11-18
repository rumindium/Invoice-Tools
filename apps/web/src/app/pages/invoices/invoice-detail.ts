import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatMoney } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  Invoice,
  InvoiceHistoryEntry,
  InvoiceService,
  InvoiceStatus,
  STATUS_ACTION_LABEL,
  STATUS_LABEL,
  displayStatus,
  pdfFilename,
  statusClass,
} from '../../core/invoice.service';

type TrackerState = 'done' | 'current' | 'todo' | 'skipped';

const TRACKER_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ISSUED', label: 'Issued' },
  { key: 'PAID', label: 'Paid' },
] as const;

@Component({
  selector: 'app-invoice-detail',
  imports: [RouterLink],
  templateUrl: './invoice-detail.html',
  styleUrl: './invoice-detail.scss',
})
export class InvoiceDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invoicesApi = inject(InvoiceService);

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly selectedStatus = signal<'ISSUED' | 'PAID' | 'VOID' | ''>('');
  protected readonly voidReason = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusActionLabel = STATUS_ACTION_LABEL;
  protected readonly statusClass = statusClass;

  protected readonly displayStatus = computed(() => {
    const invoice = this.invoice();
    return invoice ? displayStatus(invoice) : 'DRAFT';
  });

  protected readonly canEdit = computed(() => this.invoice()?.status === 'DRAFT');
  protected readonly canDelete = computed(
    () => this.invoice()?.status === 'DRAFT' || this.invoice()?.status === 'VOID',
  );

  protected readonly nextStatuses = computed(() => this.invoice()?.nextStatuses ?? []);

  protected readonly history = computed(() => (this.invoice()?.history ?? []).slice().reverse());

  protected readonly tracker = computed(() => {
    const invoice = this.invoice();
    const current = invoice ? displayStatus(invoice) : 'DRAFT';

    if (current === 'VOID') {
      return TRACKER_STEPS.map((step) => ({ ...step, state: 'skipped' as TrackerState }));
    }

    const normalized: InvoiceStatus =
      current === 'OVERDUE' || current === 'PARTIALLY_PAID' ? 'ISSUED' : current;
    const index = TRACKER_STEPS.findIndex((step) => step.key === normalized);

    return TRACKER_STEPS.map((step, position) => ({
      ...step,
      state: (position < index ? 'done' : position === index ? 'current' : 'todo') as TrackerState,
    }));
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  protected async download(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    this.actionError.set('');

    try {
      await this.invoicesApi.downloadPdf(invoice.id, pdfFilename(invoice));
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected updateSelection(event: Event): void {
    this.selectedStatus.set(
      (event.target as HTMLSelectElement).value as 'ISSUED' | 'PAID' | 'VOID',
    );
    this.actionError.set('');
  }

  protected updateReason(event: Event): void {
    this.voidReason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async applyStatus(): Promise<void> {
    const invoice = this.invoice();
    const status = this.selectedStatus();

    if (!invoice || !status) return;

    if (status === 'VOID' && !this.voidReason().trim()) {
      this.actionError.set('Add a reason before voiding this invoice.');
      return;
    }

    this.busy.set(true);
    this.actionError.set('');

    try {
      const updated = await this.invoicesApi.changeStatus(
        invoice.id,
        status,
        status === 'VOID' ? this.voidReason().trim() : undefined,
      );

      this.invoice.set(updated);
      this.selectedStatus.set('');
      this.voidReason.set('');
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected async remove(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    if (!confirm(`Delete invoice ${invoice.number ?? ''}? This cannot be undone.`)) {
      return;
    }

    this.busy.set(true);
    this.actionError.set('');

    try {
      await this.invoicesApi.remove(invoice.id);
      await this.router.navigate(['/documents']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected historyTitle(entry: InvoiceHistoryEntry): string {
    if (entry.action === 'invoice.created') {
      return 'Invoice created';
    }

    const from = entry.fromStatus ? (STATUS_LABEL[entry.fromStatus] ?? entry.fromStatus) : '—';
    const to = entry.toStatus ? (STATUS_LABEL[entry.toStatus] ?? entry.toStatus) : '—';

    return `${from} → ${to}`;
  }

  protected formatDateTime(value: string): string {
    return new Intl.DateTimeFormat('en-US', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(value));
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set('');
    this.selectedStatus.set('');
    this.voidReason.set('');

    if (!id) {
      this.loadError.set('Invoice not found.');
      this.loading.set(false);
      return;
    }

    try {
      this.invoice.set(await this.invoicesApi.get(id));
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
