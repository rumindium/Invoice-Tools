import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { terminShortLabel } from '../../core/termin.service';
import { formatDate } from '../../core/format';
import {
  GOODS_RECEIPT_STATUS_LABEL,
  GoodsReceiptListRow,
  GoodsReceiptService,
  GoodsReceiptStatusFilter,
  formatQuantity,
  goodsReceiptPdfFilename,
  goodsReceiptStatusClass,
} from '../../core/goods-receipt.service';
import { apiErrorMessage } from '../../core/http-error';

@Component({
  selector: 'app-goods-receipts',
  imports: [RouterLink],
  templateUrl: './goods-receipts.html',
  styleUrls: ['../documents/documents.scss'],
})
export class GoodsReceiptsPage {
  private readonly receiptsApi = inject(GoodsReceiptService);

  protected readonly rows = this.receiptsApi.receipts;
  protected readonly loading = this.receiptsApi.listLoading;
  protected readonly loadError = this.receiptsApi.listError;
  protected readonly summary = this.receiptsApi.summary;

  protected readonly search = signal('');
  protected readonly status = signal<GoodsReceiptStatusFilter>('ALL');
  protected readonly actionError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly terminShortLabel = terminShortLabel;
  protected readonly formatQuantity = formatQuantity;
  protected readonly statusLabel = GOODS_RECEIPT_STATUS_LABEL;
  protected readonly statusClass = goodsReceiptStatusClass;

  protected readonly filters: Array<{ value: GoodsReceiptStatusFilter; label: string }> = [
    { value: 'ALL', label: 'All receipts' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'RECEIVED', label: 'Received' },
    { value: 'CANCELLED', label: 'Cancelled' },
  ];

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reload();
    void this.receiptsApi.loadSummary();
  }

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
    clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => void this.reload(), 250);
  }

  protected clearSearch(): void {
    this.search.set('');
    void this.reload();
  }

  protected updateStatus(event: Event): void {
    this.status.set((event.target as HTMLSelectElement).value as GoodsReceiptStatusFilter);
    void this.reload();
  }

  protected canDelete(row: GoodsReceiptListRow): boolean {
    return row.status === 'DRAFT' || row.status === 'CANCELLED';
  }

  protected async download(row: GoodsReceiptListRow): Promise<void> {
    this.actionError.set('');
    try {
      await this.receiptsApi.downloadPdf(row.id, goodsReceiptPdfFilename(row));
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async remove(row: GoodsReceiptListRow): Promise<void> {
    this.actionError.set('');
    if (!confirm(`Delete goods receipt ${row.number ?? ''}? This cannot be undone.`)) {
      return;
    }
    try {
      await this.receiptsApi.remove(row.id);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async reload(): Promise<void> {
    await this.receiptsApi.loadReceipts({ search: this.search(), status: this.status() });
  }
}
