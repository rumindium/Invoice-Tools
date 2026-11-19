import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { InvoiceItem } from './invoice.service';
import { DocumentTemplate } from './template.service';
import { Versioned } from './revisions';
import type { TerminPlan } from './termin.service';

export type QuotationStatus = 'DRAFT' | 'SENT' | 'ACCEPTED' | 'REJECTED';

/** EXPIRED is derived: a sent quotation whose valid-until date has passed. */
export type QuotationDisplayStatus = QuotationStatus | 'EXPIRED';

export type QuotationStatusFilter = QuotationDisplayStatus | 'ALL';

export type QuotationTargetStatus = 'SENT' | 'ACCEPTED' | 'REJECTED';

export interface QuotationListRow {
  id: string;
  number: string | null;
  status: QuotationStatus;
  expired: boolean;
  issueDate: string;
  validUntil: string | null;
  currency: string;
  recipientName: string;
  total: number;
  revision: number;
  createdAt: string;
}

export interface QuotationAttention {
  id: string | null;
  name: string;
  jobTitle: string | null;
  phone: string | null;
}

export interface QuotationSignature {
  name: string | null;
  title: string | null;
  imageDataUrl: string | null;
}

export interface QuotationHistoryEntry {
  id: string;
  action: string;
  fromStatus: QuotationStatus | null;
  toStatus: QuotationStatus | null;
  reason: string | null;
  revision: number | null;
  /** Termin documents: which termin was created (creation events only). */
  termin?: { sequence: number; count: number; percentage: number } | null;
  actorName: string | null;
  at: string;
}

export interface Quotation extends Versioned {
  id: string;
  number: string | null;
  status: QuotationStatus;
  expired: boolean;
  issueDate: string;
  validUntil: string | null;
  currency: string;
  referenceNumber: string | null;
  taxMode: 'EXCLUSIVE' | 'INCLUSIVE';
  discountType: 'NONE' | 'PERCENT' | 'AMOUNT';
  discountRate: number | null;
  discountAmount: number;
  recipient: {
    id: string | null;
    name: string;
    email: string | null;
    address: string | null;
    phone: string | null;
    attention: QuotationAttention | null;
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
  };
  items: InvoiceItem[];
  totals: {
    subtotal: number;
    discountTotal: number;
    taxTotal: number;
    grandTotal: number;
  };
  signature: QuotationSignature;
  /** Layout and colour the quotation is drawn with (drafts follow the active template). */
  template: DocumentTemplate;
  history: QuotationHistoryEntry[];
  nextStatuses: QuotationTargetStatus[];
  /** The active goods receipt generated from this quotation, if any. */
  goodsReceipt: { id: string; number: string | null; status: string; issueDate: string } | null;
  /** Accepted and not received yet: the "Create goods receipt" action is available. */
  canCreateGoodsReceipt: boolean;
  /** The live invoice generated from that goods receipt, if any. */
  invoice: { id: string; number: string | null; status: string; issueDate: string } | null;
  /** Goods receipts in payment termins: the plan splitting this quotation. */
  terminPlan: TerminPlan | null;
  notes: string | null;
  terms: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface QuotationSummary {
  totalQuotations: number;
  totalThisMonth: number;
  draftCount: number;
  sentCount: number;
  openTotal: number;
  acceptedCount: number;
  acceptedTotal: number;
  rejectedCount: number;
  expiredCount: number;
}

export interface QuotationItemPayload {
  catalogItemId?: string;
  name: string;
  description?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  taxRate?: number;
}

export interface QuotationPayload {
  companyId?: string;
  recipient: {
    id?: string;
    contactId?: string;
    name: string;
    email?: string;
    address?: string;
    phone?: string;
    attentionName?: string;
    attentionTitle?: string;
  };
  issueDate: string;
  validUntil?: string;
  referenceNumber?: string;
  notes?: string;
  terms?: string;
  items: QuotationItemPayload[];
  signature?: {
    name?: string;
    title?: string;
    imageDataUrl?: string;
  };
}

@Injectable({ providedIn: 'root' })
export class QuotationService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  readonly quotations = signal<QuotationListRow[]>([]);
  readonly listLoading = signal(false);
  readonly listError = signal('');
  readonly summary = signal<QuotationSummary | null>(null);

  async loadQuotations(options: { search?: string; status?: QuotationStatusFilter } = {}) {
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
        this.http.get<{ items: QuotationListRow[]; total: number }>(`${origin}/api/v1/quotations`, {
          params,
          withCredentials: true,
        }),
      );

      this.quotations.set(response.items);
    } catch {
      this.listError.set('Quotations could not be loaded.');
      this.quotations.set([]);
    } finally {
      this.listLoading.set(false);
    }
  }

  async loadSummary(): Promise<void> {
    try {
      const origin = await this.api.apiOrigin;
      this.summary.set(
        await firstValueFrom(
          this.http.get<QuotationSummary>(`${origin}/api/v1/quotations/summary`, {
            withCredentials: true,
          }),
        ),
      );
    } catch {
      this.summary.set(null);
    }
  }

  async get(id: string): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ quotation: Quotation }>(`${origin}/api/v1/quotations/${id}`, {
        withCredentials: true,
      }),
    );

    return response.quotation;
  }

  async create(payload: QuotationPayload): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ quotation: Quotation }>(`${origin}/api/v1/quotations`, payload, {
        withCredentials: true,
      }),
    );

    await this.loadSummary();
    return response.quotation;
  }

  async update(id: string, payload: QuotationPayload): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.put<{ quotation: Quotation }>(`${origin}/api/v1/quotations/${id}`, payload, {
        withCredentials: true,
      }),
    );

    await this.loadSummary();
    return response.quotation;
  }

  /** Corrects a sent or accepted quotation as a new version. */
  async revise(id: string, payload: QuotationPayload & { reason: string }): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ quotation: Quotation }>(
        `${origin}/api/v1/quotations/${id}/revisions`,
        payload,
        {
          withCredentials: true,
        },
      ),
    );
    return response.quotation;
  }

  async getRevision(id: string, revision: number): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ quotation: Quotation }>(
        `${origin}/api/v1/quotations/${id}/revisions/${revision}`,
        { withCredentials: true },
      ),
    );
    return response.quotation;
  }

  async downloadRevisionPdf(id: string, revision: number, filename: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/quotations/${id}/revisions/${revision}/pdf`, {
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
    status: QuotationTargetStatus,
    reason?: string,
  ): Promise<Quotation> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ quotation: Quotation }>(
        `${origin}/api/v1/quotations/${id}/status`,
        { status, reason },
        { withCredentials: true },
      ),
    );

    await this.loadSummary();
    return response.quotation;
  }

  async remove(id: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/quotations/${id}`, { withCredentials: true }),
    );

    this.quotations.update((rows) => rows.filter((row) => row.id !== id));
    await this.loadSummary();
  }

  async downloadPdf(id: string, filename: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/quotations/${id}/pdf`, {
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

export const QUOTATION_STATUS_LABEL: Record<QuotationDisplayStatus, string> = {
  DRAFT: 'Draft',
  SENT: 'Sent',
  ACCEPTED: 'Accepted',
  REJECTED: 'Rejected',
  EXPIRED: 'Expired',
};

export const QUOTATION_ACTION_LABEL: Record<QuotationTargetStatus, string> = {
  SENT: 'Mark as sent',
  ACCEPTED: 'Mark as accepted',
  REJECTED: 'Mark as rejected',
};

export function quotationDisplayStatus(quotation: {
  status: QuotationStatus;
  expired: boolean;
}): QuotationDisplayStatus {
  return quotation.expired ? 'EXPIRED' : quotation.status;
}

export function quotationStatusClass(status: QuotationDisplayStatus): string {
  switch (status) {
    case 'ACCEPTED':
      return 'ui-badge ui-badge-green';
    case 'SENT':
      return 'ui-badge ui-badge-blue';
    case 'REJECTED':
      return 'ui-badge ui-badge-red';
    case 'EXPIRED':
      return 'ui-badge ui-badge-amber';
    default:
      return 'ui-badge ui-badge-neutral';
  }
}

export function quotationPdfFilename(quotation: { number: string | null }): string {
  return `${(quotation.number ?? 'quotation').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}
