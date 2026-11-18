import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { formatDate, formatMoney } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  FOLLOW_UP_METHOD_LABEL,
  FOLLOW_UP_STATUS_LABEL,
  FollowUpMethod,
  FollowUpStatus,
  Invoice,
  InvoiceFollowUp,
  InvoiceHistoryEntry,
  InvoiceService,
  InvoiceStatus,
  STATUS_ACTION_LABEL,
  STATUS_LABEL,
  displayStatus,
  followUpStatusClass,
  pdfFilename,
  statusClass,
} from '../../core/invoice.service';

type TrackerState = 'done' | 'current' | 'todo' | 'skipped';

const TRACKER_STEPS = [
  { key: 'DRAFT', label: 'Draft' },
  { key: 'ISSUED', label: 'Issued' },
  { key: 'PAID', label: 'Paid' },
] as const;

const FOLLOW_UP_METHODS: FollowUpMethod[] = [
  'EMAIL',
  'WHATSAPP',
  'PHONE',
  'MEETING',
  'VISIT',
  'OTHER',
];

const FOLLOW_UP_STATUSES: FollowUpStatus[] = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

@Component({
  selector: 'app-invoice-detail',
  imports: [ReactiveFormsModule, RouterLink],
  templateUrl: './invoice-detail.html',
  styleUrl: './invoice-detail.scss',
})
export class InvoiceDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly invoicesApi = inject(InvoiceService);

  protected readonly invoice = signal<Invoice | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly selectedStatus = signal<'ISSUED' | 'PAID' | 'VOID' | ''>('');
  protected readonly voidReason = signal('');

  protected readonly followUps = signal<InvoiceFollowUp[]>([]);
  protected readonly followUpSaving = signal(false);
  protected readonly followUpError = signal('');
  protected readonly followUpRowBusy = signal<string | null>(null);

  protected readonly followUpMethods = FOLLOW_UP_METHODS;
  protected readonly followUpStatuses = FOLLOW_UP_STATUSES;
  protected readonly methodLabel = FOLLOW_UP_METHOD_LABEL;
  protected readonly followUpStatusLabel = FOLLOW_UP_STATUS_LABEL;
  protected readonly followUpStatusClass = followUpStatusClass;

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusActionLabel = STATUS_ACTION_LABEL;
  protected readonly statusClass = statusClass;

  protected readonly followUpForm = this.fb.nonNullable.group({
    activity: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(160)]],
    method: ['EMAIL' as FollowUpMethod, Validators.required],
    followUpDate: [today(), Validators.required],
    status: ['OPEN' as FollowUpStatus, Validators.required],
    feedback: ['', [Validators.required, Validators.maxLength(2000)]],
    evidence: ['', [Validators.maxLength(1000)]],
  });

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

  protected async addFollowUp(): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    this.followUpError.set('');

    if (this.followUpForm.invalid) {
      this.followUpForm.markAllAsTouched();
      this.followUpError.set('Activity, date and feedback are required.');
      return;
    }

    const value = this.followUpForm.getRawValue();
    this.followUpSaving.set(true);

    try {
      const created = await this.invoicesApi.addFollowUp(invoice.id, {
        activity: value.activity,
        method: value.method,
        followUpDate: value.followUpDate,
        feedback: value.feedback,
        status: value.status,
        evidence: value.evidence.trim() || undefined,
      });

      this.followUps.update((rows) =>
        [created, ...rows].sort((left, right) =>
          right.followUpDate.localeCompare(left.followUpDate),
        ),
      );
      this.followUpForm.reset({
        activity: '',
        method: 'EMAIL',
        followUpDate: today(),
        status: 'OPEN',
        feedback: '',
        evidence: '',
      });
    } catch (error) {
      this.followUpError.set(apiErrorMessage(error));
    } finally {
      this.followUpSaving.set(false);
    }
  }

  protected async updateFollowUpStatus(followUp: InvoiceFollowUp, event: Event): Promise<void> {
    const invoice = this.invoice();
    const select = event.target as HTMLSelectElement;
    const status = select.value as FollowUpStatus;

    if (!invoice || status === followUp.status) return;

    this.followUpError.set('');
    this.followUpRowBusy.set(followUp.id);

    try {
      const updated = await this.invoicesApi.changeFollowUpStatus(invoice.id, followUp.id, status);
      this.followUps.update((rows) => rows.map((row) => (row.id === updated.id ? updated : row)));
    } catch (error) {
      select.value = followUp.status;
      this.followUpError.set(apiErrorMessage(error));
    } finally {
      this.followUpRowBusy.set(null);
    }
  }

  protected async removeFollowUp(followUp: InvoiceFollowUp): Promise<void> {
    const invoice = this.invoice();
    if (!invoice) return;

    if (!confirm(`Delete the follow-up "${followUp.activity}"?`)) {
      return;
    }

    this.followUpError.set('');
    this.followUpRowBusy.set(followUp.id);

    try {
      await this.invoicesApi.removeFollowUp(invoice.id, followUp.id);
      this.followUps.update((rows) => rows.filter((row) => row.id !== followUp.id));
    } catch (error) {
      this.followUpError.set(apiErrorMessage(error));
    } finally {
      this.followUpRowBusy.set(null);
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
    this.followUpError.set('');

    if (!id) {
      this.loadError.set('Invoice not found.');
      this.loading.set(false);
      return;
    }

    try {
      const invoice = await this.invoicesApi.get(id);
      this.invoice.set(invoice);
      this.followUps.set(invoice.followUps);
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
