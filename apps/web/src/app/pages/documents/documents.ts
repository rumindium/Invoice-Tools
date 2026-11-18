import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDate, formatMoney } from '../../core/format';
import { apiErrorMessage } from '../../core/http-error';
import {
  InvoiceListRow,
  InvoiceService,
  InvoiceStatusFilter,
  STATUS_LABEL,
  displayStatus,
  pdfFilename,
  statusClass,
} from '../../core/invoice.service';

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  templateUrl: './documents.html',
  styleUrl: './documents.scss',
})
export class DocumentsPage {
  private readonly invoicesApi = inject(InvoiceService);

  protected readonly rows = this.invoicesApi.invoices;
  protected readonly loading = this.invoicesApi.listLoading;
  protected readonly loadError = this.invoicesApi.listError;

  protected readonly search = signal('');
  protected readonly status = signal<InvoiceStatusFilter>('ALL');
  protected readonly actionError = signal('');

  protected readonly formatDate = formatDate;
  protected readonly formatMoney = formatMoney;
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly statusClass = statusClass;
  protected readonly displayStatus = displayStatus;

  protected readonly filters: Array<{ value: InvoiceStatusFilter; label: string }> = [
    { value: 'ALL', label: 'All invoices' },
    { value: 'DRAFT', label: 'Draft' },
    { value: 'ISSUED', label: 'Issued' },
    { value: 'PAID', label: 'Paid' },
    { value: 'OVERDUE', label: 'Overdue' },
    { value: 'VOID', label: 'Void' },
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
    this.status.set((event.target as HTMLSelectElement).value as InvoiceStatusFilter);
    void this.reload();
  }

  protected canDelete(row: InvoiceListRow): boolean {
    return row.status === 'DRAFT' || row.status === 'VOID';
  }

  protected async download(row: InvoiceListRow): Promise<void> {
    this.actionError.set('');

    try {
      await this.invoicesApi.downloadPdf(row.id, pdfFilename(row));
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  protected async remove(row: InvoiceListRow): Promise<void> {
    this.actionError.set('');

    if (!confirm(`Delete invoice ${row.number ?? ''}? This cannot be undone.`)) {
      return;
    }

    try {
      await this.invoicesApi.remove(row.id);
    } catch (error) {
      this.actionError.set(apiErrorMessage(error));
    }
  }

  private async reload(): Promise<void> {
    await this.invoicesApi.loadInvoices({ search: this.search(), status: this.status() });
  }
}
