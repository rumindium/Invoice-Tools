import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDate, formatMoney } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  QUOTATION_STATUS_LABEL,
  QuotationListRow,
  QuotationService,
  QuotationStatusFilter,
  quotationDisplayStatus,
  quotationPdfFilename,
  quotationStatusClass,
} from '../../core/quotation.service';

@Component({
  selector: 'app-quotations',
  imports: [RouterLink],
  templateUrl: './quotations.html',
  styleUrls: ['../documents/documents.scss'],
})
export class QuotationsPage {
  private readonly quotationsApi = inject(QuotationService);

  protected readonly rows = this.quotationsApi.quotations;
  protected readonly loading = this.quotationsApi.listLoading;
  protected readonly loadError = this.quotationsApi.listError;

  protected readonly search = signal('');
  protected readonly status = signal<QuotationStatusFilter>('ALL');
  protected readonly actionError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly statusLabel = QUOTATION_STATUS_LABEL;
  protected readonly statusClass = quotationStatusClass;
  protected readonly displayStatus = quotationDisplayStatus;

  protected readonly filters: Array<{ value: QuotationStatusFilter; label: string }> = [
    { value: 'ALL', label: 'All quotations' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'SENT', label: 'Sent' },
    { value: 'ACCEPTED', label: 'Accepted' },
    { value: 'REJECTED', label: 'Rejected' },
    { value: 'EXPIRED', label: 'Expired' },
  ];

  private searchTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    void this.reload();
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
    this.status.set((event.target as HTMLSelectElement).value as QuotationStatusFilter);
    void this.reload();
  }

  protected canDelete(row: QuotationListRow): boolean {
    return row.status === 'DRAFT' || row.status === 'REJECTED';
  }

  protected async download(row: QuotationListRow): Promise<void> {
    this.actionError.set('');

    try {
      await this.quotationsApi.downloadPdf(row.id, quotationPdfFilename(row));
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async remove(row: QuotationListRow): Promise<void> {
    this.actionError.set('');

    if (!confirm(`Delete quotation ${row.number ?? ''}? This cannot be undone.`)) {
      return;
    }

    try {
      await this.quotationsApi.remove(row.id);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async reload(): Promise<void> {
    await this.quotationsApi.loadQuotations({ search: this.search(), status: this.status() });
  }
}
