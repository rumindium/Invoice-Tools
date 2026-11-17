import { Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  DocumentStatus,
  MOCK_DOCUMENTS,
  STATUS_LABEL,
  formatDate,
  formatIdr,
} from '../../core/mock-documents';

@Component({
  selector: 'app-documents',
  imports: [RouterLink],
  templateUrl: './documents.html',
  styleUrl: './documents.scss',
})
export class DocumentsPage {
  protected readonly search = signal('');
  protected readonly statusLabel = STATUS_LABEL;
  protected readonly formatDate = formatDate;
  protected readonly formatIdr = formatIdr;

  protected readonly filtered = computed(() => {
    const query = this.search().trim().toLowerCase();

    return MOCK_DOCUMENTS.filter(
      (doc) =>
        !query ||
        doc.number.toLowerCase().includes(query) ||
        doc.customer.toLowerCase().includes(query),
    );
  });

  protected updateSearch(event: Event): void {
    this.search.set((event.target as HTMLInputElement).value);
  }

  protected clearSearch(): void {
    this.search.set('');
  }

  protected statusClass(status: DocumentStatus): string {
    switch (status) {
      case 'PAID':
        return 'ui-badge ui-badge-green';
      case 'SENT':
        return 'ui-badge ui-badge-blue';
      case 'OVERDUE':
        return 'ui-badge ui-badge-red';
      default:
        return 'ui-badge ui-badge-neutral';
    }
  }
}
