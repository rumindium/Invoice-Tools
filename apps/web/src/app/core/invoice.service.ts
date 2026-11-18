import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export type InvoiceStatus = 'DRAFT' | 'ISSUED' | 'PARTIALLY_PAID' | 'PAID' | 'OVERDUE' | 'VOID';

export type InvoiceStatusFilter = InvoiceStatus | 'ALL';

export interface InvoiceListRow {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  overdue: boolean;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  customerName: string;
  total: number;
  balanceDue: number;
  createdAt: string;
}

export interface InvoiceItem {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  description: string | null;
  unit: string;
  quantity: number;
  unitPrice: number;
  discountType: string;
  discountRate: number | null;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface Invoice {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  overdue: boolean;
  issueDate: string;
  dueDate: string | null;
  currency: string;
  referenceNumber: string | null;
  taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate: number | null;
  discountAmount: number;
  customer: {
    id: string | null;
    name: string;
    email: string | null;
    address: string | null;
    phone: string | null;
    contact: {
      id: string;
      name: string;
      jobTitle: string | null;
      phone: string | null;
    } | null;
  };
  company: {
    id: string;
    name: string;
    address: string | null;
    email: string | null;
    phone: string | null;
    taxId: string | null;
    logoDataUrl: string | null;
    footerText: string | null;
    signatoryName: string | null;
    signatoryTitle: string | null;
  };
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    shippingAmount: number;
    additionalCharges: number;
    chargesTax: number;
    grandTotal: number;
    amountPaid: number;
    balanceDue: number;
  };
  history: InvoiceHistoryEntry[];
  nextStatuses: InvoiceStatus[];
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface InvoiceHistoryEntry {
  id: string;
  action: string;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus | null;
  reason: string | null;
  actorName: string | null;
  at: string;
}

export interface InvoiceSummary {
  totalInvoices: number;
  totalThisMonth: number;
  outstandingCount: number;
  outstandingTotal: number;
  paidCount: number;
  paidTotal: number;
  draftCount: number;
  overdueCount: number;
}

export interface InvoiceItemPayload {
  catalogItemId?: string;
  name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface InvoicePayload {
  companyId?: string;
  customer: {
    id?: string;
    contactId?: string;
    name: string;
    email?: string;
    address?: string;
    phone?: string;
  };
  issueDate: string;
  dueDate?: string;
  referenceNumber?: string;
  taxMode?: 'EXCLUSIVE' | 'INCLUSIVE';
  discountType?: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate?: number;
  discountAmount?: number;
  shippingAmount?: number;
  additionalCharges?: number;
  chargesTaxRate?: number;
  notes?: string;
  terms?: string;
  items: InvoiceItemPayload[];
}

export interface InvoiceListResult {
  items: InvoiceListRow[];
  total: number;
}

@Injectable({ providedIn: 'root' })
export class InvoiceService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  readonly invoices = signal<InvoiceListRow[]>([]);
  readonly invoicesTotal = signal(0);
  readonly listLoading = signal(false);
  readonly listError = signal('');

  readonly summary = signal<InvoiceSummary | null>(null);

  async loadInvoices(options: { search?: string; status?: InvoiceStatusFilter } = {}) {
    this.listLoading.set(true);
    this.listError.set('');

    try {
      const origin = await this.api.apiOrigin;
      let params = new HttpParams().set('pageSize', '100');

      if (options.search?.trim()) {
        params = params.set('search', options.search.trim());
      }

      if (options.status && options.status !== 'ALL') {
        params = params.set('status', options.status);
      }

      const response = await firstValueFrom(
        this.http.get<InvoiceListResult>(`${origin}/api/v1/documents`, {
          params,
          withCredentials: true,
        }),
      );

      this.invoices.set(response.items);
      this.invoicesTotal.set(response.total);
    } catch {
      this.listError.set('Invoices could not be loaded.');
      this.invoices.set([]);
      this.invoicesTotal.set(0);
    } finally {
      this.listLoading.set(false);
    }
  }

  async loadSummary(): Promise<void> {
    try {
      const origin = await this.api.apiOrigin;
      const summary = await firstValueFrom(
        this.http.get<InvoiceSummary>(`${origin}/api/v1/documents/summary`, {
          withCredentials: true,
        }),
      );
      this.summary.set(summary);
    } catch {
      this.summary.set(null);
    }
  }

  async get(id: string): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ invoice: Invoice }>(`${origin}/api/v1/documents/${id}`, {
        withCredentials: true,
      }),
    );

    return response.invoice;
  }

  async create(payload: InvoicePayload): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ invoice: Invoice }>(`${origin}/api/v1/documents`, payload, {
        withCredentials: true,
      }),
    );

    await this.loadInvoices();
    await this.loadSummary();
    return response.invoice;
  }

  async update(id: string, payload: InvoicePayload): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.put<{ invoice: Invoice }>(`${origin}/api/v1/documents/${id}`, payload, {
        withCredentials: true,
      }),
    );

    await this.loadInvoices();
    await this.loadSummary();
    return response.invoice;
  }

  async changeStatus(
    id: string,
    status: 'ISSUED' | 'PAID' | 'VOID',
    reason?: string,
  ): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ invoice: Invoice }>(
        `${origin}/api/v1/documents/${id}/status`,
        { status, reason },
        { withCredentials: true },
      ),
    );

    await this.loadInvoices();
    await this.loadSummary();
    return response.invoice;
  }

  async remove(id: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/documents/${id}`, { withCredentials: true }),
    );

    await this.loadInvoices();
    await this.loadSummary();
  }

  async downloadPdf(id: string, filename: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/documents/${id}/pdf`, {
        responseType: 'blob',
        withCredentials: true,
      }),
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

export const STATUS_ACTION_LABEL: Partial<Record<InvoiceStatus, string>> = {
  DRAFT: 'Return to draft',
  ISSUED: 'Issue invoice',
  PAID: 'Mark as paid',
  VOID: 'Void invoice',
};

export const STATUS_LABEL: Record<InvoiceStatus, string> = {
  DRAFT: 'Draft',
  ISSUED: 'Issued',
  PARTIALLY_PAID: 'Partially paid',
  PAID: 'Paid',
  OVERDUE: 'Overdue',
  VOID: 'Void',
};

export function displayStatus(invoice: { status: InvoiceStatus; overdue: boolean }): InvoiceStatus {
  return invoice.overdue ? 'OVERDUE' : invoice.status;
}

export function statusClass(status: InvoiceStatus): string {
  switch (status) {
    case 'PAID':
      return 'ui-badge ui-badge-green';
    case 'ISSUED':
      return 'ui-badge ui-badge-blue';
    case 'OVERDUE':
      return 'ui-badge ui-badge-red';
    case 'PARTIALLY_PAID':
      return 'ui-badge ui-badge-amber';
    default:
      return 'ui-badge ui-badge-neutral';
  }
}

export function pdfFilename(invoice: { number: string | null }): string {
  return `${(invoice.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}
