import { Component, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { revisionFilename } from '../../core/revisions';
import { GoodsReceiptSheet } from '../../ui/goods-receipt-sheet/goods-receipt-sheet';
import { VersionsCard } from '../../ui/versions-card';
import { TerminDialog } from '../../ui/termins/termin-dialog';
import { TerminPlanCard } from '../../ui/termins/termin-plan-card';
import {
  TerminDraft,
  TerminService,
  formatPercentage,
  terminLabel,
  terminPlanEventTitle,
  withTermin,
} from '../../core/termin.service';
import { formatDate } from '../../core/format';
import {
  GOODS_RECEIPT_ACTION_LABEL,
  GOODS_RECEIPT_STATUS_LABEL,
  GoodsReceipt,
  GoodsReceiptService,
  GoodsReceiptStatus,
  GoodsReceiptTargetStatus,
  formatQuantity,
  goodsReceiptPdfFilename,
  goodsReceiptStatusClass,
} from '../../core/goods-receipt.service';
import { DOCUMENT_STATUS_LABEL } from '../../core/document-flow';
import { apiErrorMessage } from '../../core/http-error';
import { InvoiceService } from '../../core/invoice.service';

type TrackerState = 'done' | 'current' | 'todo' | 'rejected';

@Component({
  selector: 'app-goods-receipt-detail',
  imports: [RouterLink, VersionsCard, GoodsReceiptSheet, TerminDialog, TerminPlanCard],
  templateUrl: './goods-receipt-detail.html',
  styleUrls: [
    '../invoices/invoice-detail.scss',
    '../quotations/quotation-detail.scss',
    './goods-receipt-detail.scss',
  ],
})
export class GoodsReceiptDetailPage {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly receiptsApi = inject(GoodsReceiptService);
  private readonly invoicesApi = inject(InvoiceService);
  private readonly terminsApi = inject(TerminService);

  protected readonly receipt = signal<GoodsReceipt | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly actionError = signal('');
  protected readonly busy = signal(false);
  protected readonly selectedStatus = signal<GoodsReceiptTargetStatus | ''>('');
  protected readonly reason = signal('');
  protected readonly creatingInvoice = signal(false);
  /** "Create invoice": one invoice or payment termins. */
  protected readonly invoiceDialog = signal(false);
  protected readonly invoiceError = signal('');
  protected readonly terminLabel = terminLabel;
  /** Termin receipts are billed in one invoice; the dialog says why there is no split. */
  protected readonly splitBlockedReason = computed(() => {
    const receipt = this.receipt();
    if (!receipt || receipt.canSplitInvoice || !receipt.termin) return null;
    const { sequence, count, percentage } = receipt.termin;
    return `This goods receipt is termin ${sequence}${count ? ` of ${count}` : ''} (${formatPercentage(
      percentage,
    )}) of quotation ${receipt.source.quotationNumber ?? ''}, so it is billed in one invoice for its accepted quantities.`;
  });
  protected readonly documentStatusLabel = DOCUMENT_STATUS_LABEL;

  protected readonly formatDate = formatDate;
  protected readonly formatQuantity = formatQuantity;
  protected readonly statusLabel = GOODS_RECEIPT_STATUS_LABEL;
  protected readonly statusActionLabel = GOODS_RECEIPT_ACTION_LABEL;
  protected readonly statusClass = goodsReceiptStatusClass;

  /** Set when an archived older version is shown (read-only). */
  protected readonly viewing = computed(() => this.receipt()?.supersededRevision ?? null);
  protected readonly canEdit = computed(
    () => !this.viewing() && this.receipt()?.status === 'DRAFT',
  );
  protected readonly canDelete = computed(
    () =>
      !this.viewing() &&
      (this.receipt()?.status === 'DRAFT' || this.receipt()?.status === 'CANCELLED'),
  );
  protected readonly canRevise = computed(
    () => !this.viewing() && Boolean(this.receipt()?.canRevise),
  );
  protected readonly history = computed(() => (this.receipt()?.history ?? []).slice().reverse());

  protected readonly tracker = computed(() => {
    const status = this.receipt()?.status ?? 'DRAFT';
    const last =
      status === 'CANCELLED'
        ? { key: 'CANCELLED', label: 'Cancelled' }
        : { key: 'RECEIVED', label: 'Received' };
    return [{ key: 'DRAFT', label: 'Draft' }, last].map((step, position) => ({
      ...step,
      state: (status === 'DRAFT'
        ? position === 0
          ? 'current'
          : 'todo'
        : position === 0
          ? 'done'
          : status === 'CANCELLED'
            ? 'rejected'
            : 'current') as TrackerState,
    }));
  });

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(() => void this.load());
  }

  protected async download(): Promise<void> {
    const receipt = this.receipt();
    if (!receipt) return;
    this.actionError.set('');
    try {
      const viewing = this.viewing();
      if (viewing) {
        await this.receiptsApi.downloadRevisionPdf(
          receipt.id,
          viewing.revision,
          revisionFilename(receipt.number, 'goods-receipt', viewing.revision),
        );
      } else {
        await this.receiptsApi.downloadPdf(receipt.id, goodsReceiptPdfFilename(receipt));
      }
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async downloadRevision(revision: number): Promise<void> {
    const receipt = this.receipt();
    if (!receipt) return;
    this.actionError.set('');
    try {
      await this.receiptsApi.downloadRevisionPdf(
        receipt.id,
        revision,
        revisionFilename(receipt.number, 'goods-receipt', revision),
      );
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected updateSelection(event: Event): void {
    this.selectedStatus.set((event.target as HTMLSelectElement).value as GoodsReceiptTargetStatus);
    this.actionError.set('');
  }

  protected updateReason(event: Event): void {
    this.reason.set((event.target as HTMLTextAreaElement).value);
  }

  protected async applyStatus(): Promise<void> {
    const receipt = this.receipt();
    const status = this.selectedStatus();
    if (!receipt || !status) return;

    if (status === 'CANCELLED' && !this.reason().trim()) {
      this.actionError.set('Add a reason before cancelling this goods receipt.');
      return;
    }

    this.busy.set(true);
    this.actionError.set('');
    try {
      this.receipt.set(
        await this.receiptsApi.changeStatus(receipt.id, status, this.reason().trim() || undefined),
      );
      this.selectedStatus.set('');
      this.reason.set('');
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  /** Asks how the receipt is billed: one invoice or payment termins. */
  protected openInvoiceDialog(): void {
    if (!this.receipt()?.canCreateInvoice) return;
    this.invoiceError.set('');
    this.invoiceDialog.set(true);
  }

  /** Received goods receipt → draft invoice(s) for the accepted quantities, then open one. */
  protected async createInvoice(draft: TerminDraft): Promise<void> {
    const receipt = this.receipt();
    if (!receipt?.canCreateInvoice || this.creatingInvoice()) return;

    this.creatingInvoice.set(true);
    this.invoiceError.set('');

    try {
      const invoiceId = draft.split
        ? (await this.terminsApi.forGoodsReceipt(receipt.id, draft)).documents[0]?.id
        : (await this.invoicesApi.createFromGoodsReceipt(receipt.id)).id;
      this.invoiceDialog.set(false);
      if (invoiceId) {
        await this.router.navigate(['/documents', invoiceId]);
      } else {
        await this.refresh();
      }
    } catch (error) {
      this.invoiceError.set(apiErrorMessage(error));
    } finally {
      this.creatingInvoice.set(false);
    }
  }

  /** A termin plan changed (termin created, split changed, plan deleted). */
  protected async planChanged(): Promise<void> {
    await this.refresh();
  }

  protected async remove(): Promise<void> {
    const receipt = this.receipt();
    if (!receipt) return;
    if (!confirm(`Delete goods receipt ${receipt.number ?? ''}? This cannot be undone.`)) {
      return;
    }

    this.busy.set(true);
    try {
      await this.receiptsApi.remove(receipt.id);
      await this.router.navigate(['/goods-receipts']);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    } finally {
      this.busy.set(false);
    }
  }

  protected historyTitle(entry: GoodsReceipt['history'][number]): string {
    if (entry.action === 'goods_receipt.created') return withTermin('Goods receipt created', entry);
    if (entry.action === 'goods_receipt.updated') return 'Goods receipt edited';
    if (entry.action === 'goods_receipt.revised') return `Revised to version ${entry.revision}`;
    if (entry.action === 'goods_receipt.invoice_created')
      return withTermin('Invoice created', entry);
    const planTitle = terminPlanEventTitle(entry.action);
    if (planTitle) return planTitle;
    const label = (status: string | null) =>
      status ? (GOODS_RECEIPT_STATUS_LABEL[status as GoodsReceiptStatus] ?? status) : '—';
    return `${label(entry.fromStatus)} → ${label(entry.toStatus)}`;
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

  /** Reloads the receipt without the loading state (keeps cards and their messages). */
  private async refresh(): Promise<void> {
    const receipt = this.receipt();
    if (!receipt) return;
    try {
      this.receipt.set(await this.receiptsApi.get(receipt.id));
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
      this.loadError.set('Goods receipt not found.');
      this.loading.set(false);
      return;
    }

    try {
      const revision = Number(this.route.snapshot.paramMap.get('revision'));
      this.receipt.set(
        revision
          ? await this.receiptsApi.getRevision(id, revision)
          : await this.receiptsApi.get(id),
      );
    } catch (error) {
      this.loadError.set(apiErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }
}
