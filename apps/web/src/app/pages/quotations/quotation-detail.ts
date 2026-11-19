import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { revisionFilename } from '../../core/revisions';
import { QuotationSheet } from '../../ui/quotation-sheet/quotation-sheet';
import { VersionsCard } from '../../ui/versions-card';
import { TerminDialog } from '../../ui/termins/termin-dialog';
import { TerminPlanCard } from '../../ui/termins/termin-plan-card';
import {
  TerminDraft,
  TerminService,
  terminPlanEventTitle,
  withTermin,
} from '../../core/termin.service';
import { formatDate, formatMoney } from '../../core/format';
import {
  GOODS_RECEIPT_STATUS_LABEL,
  GoodsReceiptService,
  GoodsReceiptStatus,
  goodsReceiptStatusClass,
} from '../../core/goods-receipt.service';
import { DOCUMENT_STATUS_LABEL } from '../../core/document-flow';
import { apiErrorMessage } from '../../core/http-error';
import {
  QUOTATION_ACTION_LABEL,
  QUOTATION_STATUS_LABEL,
  Quotation,
  QuotationHistoryEntry,
  QuotationService,
  QuotationTargetStatus,
  quotationDisplayStatus,
  quotationPdfFilename,
  quotationStatusClass,
} from '../../core/quotation.service';

type TrackerState = 'done' | 'current' | 'todo' | 'skipped' | 'rejected';

@Component({
  selector: 'app-quotation-detail',
  imports: [RouterLink, VersionsCard, QuotationSheet, TerminDialog, TerminPlanCard],
  templateUrl: './quotation-detail.html',
  styleUrls: ['../invoices/invoice-detail.scss', './quotation-detail.scss'],
})
export class QuotationDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly quotationsApi = inject(QuotationService);
  private readonly goodsReceiptsApi = inject(GoodsReceiptService);
  private readonly terminsApi = inject(TerminService);

  protected readonly quotation = signal<Quotation | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly selectedStatus = signal<QuotationTargetStatus | ''>('');
  protected readonly reason = signal('');
  protected readonly creatingReceipt = signal(false);
  /** "Create goods receipt": one receipt or payment termins. */
  protected readonly receiptDialog = signal(false);
  protected readonly receiptError = signal('');
  protected readonly receiptStatusLabel = (status: string) =>
    GOODS_RECEIPT_STATUS_LABEL[status as GoodsReceiptStatus] ??
    DOCUMENT_STATUS_LABEL[status] ??
    status;
  protected readonly receiptStatusClass = goodsReceiptStatusClass;

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly statusLabel = QUOTATION_STATUS_LABEL;
  protected readonly statusActionLabel = QUOTATION_ACTION_LABEL;
  protected readonly statusClass = quotationStatusClass;

  protected readonly displayStatus = computed(() => {
    const quotation = this.quotation();
    return quotation ? quotationDisplayStatus(quotation) : 'DRAFT';
  });

  /** Set when an archived older version is shown (read-only). */
  protected readonly viewing = computed(() => this.quotation()?.supersededRevision ?? null);
  protected readonly canEdit = computed(
    () => !this.viewing() && this.quotation()?.status === 'DRAFT',
  );
  protected readonly canDelete = computed(
    () =>
      !this.viewing() &&
      (this.quotation()?.status === 'DRAFT' || this.quotation()?.status === 'REJECTED'),
  );
  protected readonly canRevise = computed(
    () => !this.viewing() && Boolean(this.quotation()?.canRevise),
  );
  protected readonly nextStatuses = computed(() => this.quotation()?.nextStatuses ?? []);
  protected readonly history = computed(() => (this.quotation()?.history ?? []).slice().reverse());

  /** Draft → Sent → Accepted; a rejection replaces the last step. */
  protected readonly tracker = computed(() => {
    const status = this.quotation()?.status ?? 'DRAFT';
    const order = ['DRAFT', 'SENT', 'DECIDED'];
    const current = status === 'ACCEPTED' || status === 'REJECTED' ? 'DECIDED' : status;
    const index = order.indexOf(current);
    const last =
      status === 'REJECTED'
        ? { key: 'REJECTED', label: 'Rejected' }
        : { key: 'ACCEPTED', label: 'Accepted' };

    return [{ key: 'DRAFT', label: 'Draft' }, { key: 'SENT', label: 'Sent' }, last].map(
      (step, position) => ({
        ...step,
        state: (position < index
          ? 'done'
          : position === index
            ? status === 'REJECTED'
              ? 'rejected'
              : 'current'
            : 'todo') as TrackerState,
      }),
    );
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  protected async download(): Promise<void> {
    const quotation = this.quotation();
    if (!quotation) return;

    this.actionError.set('');

    try {
      const viewing = this.viewing();
      if (viewing) {
        await this.quotationsApi.downloadRevisionPdf(
          quotation.id,
          viewing.revision,
          revisionFilename(quotation.number, 'quotation', viewing.revision),
        );
      } else {
        await this.quotationsApi.downloadPdf(quotation.id, quotationPdfFilename(quotation));
      }
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async downloadRevision(revision: number): Promise<void> {
    const quotation = this.quotation();
    if (!quotation) return;
    this.actionError.set('');
    try {
      await this.quotationsApi.downloadRevisionPdf(
        quotation.id,
        revision,
        revisionFilename(quotation.number, 'quotation', revision),
      );
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected updateSelection(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value as QuotationTargetStatus);
    this.actionError.set('');
  }

  protected updateReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async applyStatus(): Promise<void> {
    const quotation = this.quotation();
    const status = this.selectedStatus();

    if (!quotation || !status) return;

    this.busy.set(true);
    this.actionError.set('');

    try {
      this.quotation.set(
        await this.quotationsApi.changeStatus(
          quotation.id,
          status,
          this.reason().trim() || undefined,
        ),
      );
      this.selectedStatus.set('');
      this.reason.set('');
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Asks how the accepted quotation is received: one goods receipt or payment termins. */
  protected openReceiptDialog(): void {
    if (!this.quotation()?.canCreateGoodsReceipt) return;
    this.receiptError.set('');
    this.receiptDialog.set(true);
  }

  /** Accepted quotation → goods receipt(s), then open the (first) new receipt. */
  protected async createGoodsReceipt(draft: TerminDraft): Promise<void> {
    const quotation = this.quotation();
    if (!quotation?.canCreateGoodsReceipt || this.creatingReceipt()) return;

    this.creatingReceipt.set(true);
    this.receiptError.set('');

    try {
      const receiptId = draft.split
        ? (await this.terminsApi.forQuotation(quotation.id, draft)).documents[0]?.id
        : (await this.goodsReceiptsApi.createFromQuotation(quotation.id)).id;
      this.receiptDialog.set(false);
      if (receiptId) {
        await this.router.navigate(['/goods-receipts', receiptId]);
      } else {
        await this.refresh();
      }
    } catch (error) {
      this.receiptError.set(apiErrorMessage(error));
    } finally {
      this.creatingReceipt.set(false);
    }
  }

  /** The termin plan changed (termin created, split changed, plan deleted). */
  protected async planChanged(): Promise<void> {
    await this.refresh();
  }

  protected async remove(): Promise<void> {
    const quotation = this.quotation();
    if (!quotation) return;

    if (!confirm(`Delete quotation ${quotation.number ?? ''}? This cannot be undone.`)) {
      return;
    }

    this.busy.set(true);
    this.actionError.set('');

    try {
      await this.quotationsApi.remove(quotation.id);
      await this.router.navigate(['/quotations']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected historyTitle(entry: QuotationHistoryEntry): string {
    if (entry.action === 'quotation.created') return 'Quotation created';
    if (entry.action === 'quotation.updated') return 'Quotation edited';
    if (entry.action === 'quotation.revised') return `Revised to version ${entry.revision}`;
    if (entry.action === 'quotation.goods_receipt_created') {
      return withTermin('Goods receipt created', entry);
    }
    const planTitle = terminPlanEventTitle(entry.action);
    if (planTitle) return planTitle;

    const from = entry.fromStatus ? (QUOTATION_STATUS_LABEL[entry.fromStatus] ?? '—') : '—';
    const to = entry.toStatus ? (QUOTATION_STATUS_LABEL[entry.toStatus] ?? '—') : '—';
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

  /** Reloads the quotation without the loading state (keeps cards and their messages). */
  private async refresh(): Promise<void> {
    const quotation = this.quotation();
    if (!quotation) return;
    try {
      this.quotation.set(await this.quotationsApi.get(quotation.id));
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async load(): Promise<void> {
    const id = this.route.snapshot.paramMap.get('id');
    this.loading.set(true);
    this.loadError.set('');
    this.selectedStatus.set('');
    this.reason.set('');

    if (!id) {
      this.loadError.set('Quotation not found.');
      this.loading.set(false);
      return;
    }

    try {
      const revision = Number(this.route.snapshot.paramMap.get('revision'));
      this.quotation.set(
        revision
          ? await this.quotationsApi.getRevision(id, revision)
          : await this.quotationsApi.get(id),
      );
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
