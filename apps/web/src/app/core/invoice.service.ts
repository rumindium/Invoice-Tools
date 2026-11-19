import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { Versioned } from './revisions';
import type { TerminPlan, TerminRef } from './termin.service';
import { DocumentTemplate } from './template.service';

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
  revision: number;
  /** Termin invoices: "termin 2 of 3". */
  termin: TerminRef | null;
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

export interface Invoice extends Versioned {
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
      /** Null when the attention person was typed on the source quotation. */
      id: string | null;
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
  /** Layout and colour the invoice is drawn with (drafts follow the active template). */
  template: DocumentTemplate;
  history: InvoiceHistoryEntry[];
  followUps: InvoiceFollowUp[];
  nextStatuses: InvoiceStatus[];
  /** Quotation → goods receipt → invoice, for invoices generated from a goods receipt. */
  flow: InvoiceFlow | null;
  /** The payment termin this invoice bills (its own, or its termin goods receipt's). */
  termin: TerminRef | null;
  /** The invoice termin plan this invoice belongs to. */
  terminPlan: TerminPlan | null;
  notes: string | null;
  terms: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FlowDocument {
  id: string;
  number: string | null;
  date: string;
  status: string;
}

export interface InvoiceFlowEvent {
  id: string;
  at: string;
  documentType: 'QUOTATION' | 'GOODS_RECEIPT' | 'INVOICE';
  documentId: string;
  documentNumber: string | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  revision: number | null;
  /** Creation events of termin documents: which termin. */
  termin?: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
}

export interface InvoiceFlow {
  quotation: (FlowDocument & { expired: boolean; total: number; currency: string }) | null;
  goodsReceipt: FlowDocument & { acceptedQuantity: number; lineCount: number };
  invoice: FlowDocument & { total: number; currency: string };
  events: InvoiceFlowEvent[];
}

export interface InvoiceHistoryEntry {
  id: string;
  action: string;
  fromStatus: InvoiceStatus | null;
  toStatus: InvoiceStatus | null;
  reason: string | null;
  revision: number | null;
  /** Termin documents: which termin was created (creation events only). */
  termin?: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
  at: string;
}

export type FollowUpMethod = 'EMAIL' | 'WHATSAPP' | 'PHONE' | 'MEETING' | 'VISIT' | 'OTHER';

export type FollowUpStatus = 'OPEN' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface InvoiceFollowUp {
  id: string;
  activity: string;
  method: FollowUpMethod;
  followUpDate: string;
  feedback: string;
  status: FollowUpStatus;
  evidence: string | null;
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FollowUpPayload {
  activity: string;
  method: FollowUpMethod;
  followUpDate: string;
  feedback: string;
  status: FollowUpStatus;
  evidence?: string;
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

  /** Generates the invoice of a received goods receipt (accepted quantities, quotation prices). */
  async createFromGoodsReceipt(goodsReceiptId: string): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ invoice: Invoice }>(
        `${origin}/api/v1/documents/from-goods-receipt`,
        { goodsReceiptId },
        { withCredentials: true },
      ),
    );

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

  /** Corrects an issued invoice as a new version. */
  async revise(id: string, payload: InvoicePayload & { reason: string }): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ invoice: Invoice }>(`${origin}/api/v1/documents/${id}/revisions`, payload, {
        withCredentials: true,
      }),
    );
    await this.loadSummary();
    return response.invoice;
  }

  async getRevision(id: string, revision: number): Promise<Invoice> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ invoice: Invoice }>(
        `${origin}/api/v1/documents/${id}/revisions/${revision}`,
        {
          withCredentials: true,
        },
      ),
    );
    return response.invoice;
  }

  async downloadRevisionPdf(id: string, revision: number, filename: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/documents/${id}/revisions/${revision}/pdf`, {
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

  async addFollowUp(invoiceId: string, payload: FollowUpPayload): Promise<InvoiceFollowUp> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ followUp: InvoiceFollowUp }>(
        `${origin}/api/v1/documents/${invoiceId}/follow-ups`,
        payload,
        { withCredentials: true },
      ),
    );

    return response.followUp;
  }

  async changeFollowUpStatus(
    invoiceId: string,
    followUpId: string,
    status: FollowUpStatus,
  ): Promise<InvoiceFollowUp> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.patch<{ followUp: InvoiceFollowUp }>(
        `${origin}/api/v1/documents/${invoiceId}/follow-ups/${followUpId}`,
        { status },
        { withCredentials: true },
      ),
    );

    return response.followUp;
  }

  async removeFollowUp(invoiceId: string, followUpId: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/documents/${invoiceId}/follow-ups/${followUpId}`, {
        withCredentials: true,
      }),
    );
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

export const FOLLOW_UP_METHOD_LABEL: Record<FollowUpMethod, string> = {
  EMAIL: 'Email',
  WHATSAPP: 'WhatsApp',
  PHONE: 'Phone call',
  MEETING: 'Meeting',
  VISIT: 'Visit',
  OTHER: 'Other',
};

export const FOLLOW_UP_STATUS_LABEL: Record<FollowUpStatus, string> = {
  OPEN: 'Open',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
  CANCELLED: 'Cancelled',
};

export function followUpStatusClass(status: FollowUpStatus): string {
  switch (status) {
    case 'DONE':
      return 'ui-badge ui-badge-green';
    case 'IN_PROGRESS':
      return 'ui-badge ui-badge-amber';
    case 'OPEN':
      return 'ui-badge ui-badge-blue';
    default:
      return 'ui-badge ui-badge-neutral';
  }
}

export function pdfFilename(invoice: { number: string | null }): string {
  return `${(invoice.number ?? 'invoice').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}
