import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { DocumentTemplate } from './template.service';
import { ApiConfigService } from './api-config.service';
import { QuotationHistoryEntry } from './quotation.service';
import { Versioned } from './revisions';
import type { TerminPlan, TerminRef } from './termin.service';

export type GoodsReceiptStatus = 'DRAFT' | 'RECEIVED' | 'CANCELLED';
export type GoodsReceiptStatusFilter = GoodsReceiptStatus | 'ALL';
export type GoodsReceiptTargetStatus = 'RECEIVED' | 'CANCELLED';

export interface GoodsReceiptListRow {
  id: string;
  number: string | null;
  status: GoodsReceiptStatus;
  receiptDate: string;
  quotationId: string;
  quotationNumber: string | null;
  recipientName: string;
  lineCount: number;
  acceptedQuantity: number;
  revision: number;
  /** Termin receipts: "termin 2 of 3". */
  termin: TerminRef | null;
  createdAt: string;
}

export interface GoodsReceiptLine {
  id: string;
  position: number;
  catalogItemId: string | null;
  name: string;
  description: string | null;
  unit: string;
  orderedQuantity: number;
  receivedQuantity: number;
  rejectedQuantity: number;
  acceptedQuantity: number;
  remarks: string | null;
}

export interface GoodsReceiptDetails {
  deliveryNoteNumber: string | null;
  carrier: string | null;
  vehicleNumber: string | null;
  receivingLocation: string | null;
  deliveredByName: string | null;
  receivedByName: string | null;
  receivedByTitle: string | null;
  checkedByName: string | null;
}

export interface GoodsReceipt extends Versioned {
  id: string;
  number: string | null;
  status: GoodsReceiptStatus;
  receiptDate: string;
  currency: string;
  source: {
    quotationId: string;
    quotationNumber: string | null;
    quotationDate: string;
    customerReference: string | null;
  };
  details: GoodsReceiptDetails;
  recipient: {
    id: string | null;
    name: string;
    email: string | null;
    address: string | null;
    phone: string | null;
    attention: { id: string | null; name: string; jobTitle: string | null } | null;
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
  lines: GoodsReceiptLine[];
  totals: {
    ordered: number;
    received: number;
    rejected: number;
    accepted: number;
    acceptedValue: number;
  };
  notes: string | null;
  /** Layout and colour the receipt is drawn with (drafts follow the active template). */
  template: DocumentTemplate;
  history: Array<
    Omit<QuotationHistoryEntry, 'fromStatus' | 'toStatus'> & {
      fromStatus: string | null;
      toStatus: string | null;
    }
  >;
  nextStatuses: GoodsReceiptTargetStatus[];
  /** The live invoice generated from this receipt, if any. */
  invoice: { id: string; number: string | null; status: string; issueDate: string } | null;
  /** Received, something accepted, not invoiced yet and no invoice termins. */
  canCreateInvoice: boolean;
  /** "Create invoice" may split the bill into payment termins (not for termin receipts). */
  canSplitInvoice: boolean;
  /** The termin of its quotation this receipt is. */
  termin: TerminRef | null;
  /** That plan: every termin receipt of the quotation. */
  terminPlan: TerminPlan | null;
  /** The plan billing this receipt in invoice termins. */
  invoiceTerminPlan: TerminPlan | null;
  receivedAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoodsReceiptSummary {
  totalReceipts: number;
  totalThisMonth: number;
  draftCount: number;
  receivedCount: number;
  cancelledCount: number;
  awaitingReceipt: number;
}

export interface GoodsReceiptSource {
  id: string;
  number: string | null;
  issueDate: string;
  recipientName: string;
  itemCount: number;
  total: number;
  currency: string;
}

export interface GoodsReceiptUpdatePayload extends Partial<GoodsReceiptDetails> {
  receiptDate: string;
  notes?: string;
  lines: Array<{
    id: string;
    receivedQuantity: number;
    rejectedQuantity: number;
    remarks?: string;
  }>;
}

@Injectable({ providedIn: 'root' })
export class GoodsReceiptService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  readonly receipts = signal<GoodsReceiptListRow[]>([]);
  readonly listLoading = signal(false);
  readonly listError = signal('');
  readonly summary = signal<GoodsReceiptSummary | null>(null);

  private async url(path = ''): Promise<string> {
    return `${await this.api.apiOrigin}/api/v1/goods-receipts${path}`;
  }

  async loadReceipts(options: { search?: string; status?: GoodsReceiptStatusFilter } = {}) {
    this.listLoading.set(true);
    this.listError.set('');

    try {
      let params = new HttpParams().set('pageSize', '100');
      if (options.search?.trim()) params = params.set('search', options.search.trim());
      if (options.status && options.status !== 'ALL') params = params.set('status', options.status);

      const response = await firstValueFrom(
        this.http.get<{ items: GoodsReceiptListRow[] }>(await this.url(), {
          params,
          withCredentials: true,
        }),
      );
      this.receipts.set(response.items);
    } catch {
      this.listError.set('Goods receipts could not be loaded.');
      this.receipts.set([]);
    } finally {
      this.listLoading.set(false);
    }
  }

  async loadSummary(): Promise<void> {
    try {
      this.summary.set(
        await firstValueFrom(
          this.http.get<GoodsReceiptSummary>(await this.url('/summary'), { withCredentials: true }),
        ),
      );
    } catch {
      this.summary.set(null);
    }
  }

  async sources(): Promise<GoodsReceiptSource[]> {
    const response = await firstValueFrom(
      this.http.get<{ quotations: GoodsReceiptSource[] }>(await this.url('/sources'), {
        withCredentials: true,
      }),
    );
    return response.quotations;
  }

  /** Generates the goods receipt of an accepted quotation. */
  async createFromQuotation(quotationId: string): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.post<{ goodsReceipt: GoodsReceipt }>(
        await this.url(),
        { quotationId },
        { withCredentials: true },
      ),
    );
    await this.loadSummary();
    return response.goodsReceipt;
  }

  async get(id: string): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.get<{ goodsReceipt: GoodsReceipt }>(await this.url(`/${id}`), {
        withCredentials: true,
      }),
    );
    return response.goodsReceipt;
  }

  async update(id: string, payload: GoodsReceiptUpdatePayload): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.put<{ goodsReceipt: GoodsReceipt }>(await this.url(`/${id}`), payload, {
        withCredentials: true,
      }),
    );
    return response.goodsReceipt;
  }

  /** Corrects a received goods receipt as a new version. */
  async revise(
    id: string,
    payload: GoodsReceiptUpdatePayload & { reason: string },
  ): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.post<{ goodsReceipt: GoodsReceipt }>(await this.url(`/${id}/revisions`), payload, {
        withCredentials: true,
      }),
    );
    return response.goodsReceipt;
  }

  async getRevision(id: string, revision: number): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.get<{ goodsReceipt: GoodsReceipt }>(
        await this.url(`/${id}/revisions/${revision}`),
        {
          withCredentials: true,
        },
      ),
    );
    return response.goodsReceipt;
  }

  async downloadRevisionPdf(id: string, revision: number, filename: string): Promise<void> {
    const origin = await this.api.apiOrigin;
    const blob = await firstValueFrom(
      this.http.get(`${origin}/api/v1/goods-receipts/${id}/revisions/${revision}/pdf`, {
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
    status: GoodsReceiptTargetStatus,
    reason?: string,
  ): Promise<GoodsReceipt> {
    const response = await firstValueFrom(
      this.http.post<{ goodsReceipt: GoodsReceipt }>(
        await this.url(`/${id}/status`),
        { status, reason },
        { withCredentials: true },
      ),
    );
    await this.loadSummary();
    return response.goodsReceipt;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(await this.url(`/${id}`), { withCredentials: true }),
    );
    this.receipts.update((rows) => rows.filter((row) => row.id !== id));
    await this.loadSummary();
  }

  async downloadPdf(id: string, filename: string): Promise<void> {
    const blob = await firstValueFrom(
      this.http.get(await this.url(`/${id}/pdf`), { responseType: 'blob', withCredentials: true }),
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

export const GOODS_RECEIPT_STATUS_LABEL: Record<GoodsReceiptStatus, string> = {
  DRAFT: 'Draft',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

export const GOODS_RECEIPT_ACTION_LABEL: Record<GoodsReceiptTargetStatus, string> = {
  RECEIVED: 'Post as received',
  CANCELLED: 'Cancel receipt',
};

export function goodsReceiptStatusClass(status: GoodsReceiptStatus | string): string {
  switch (status) {
    case 'RECEIVED':
      return 'ui-badge ui-badge-green';
    case 'CANCELLED':
      return 'ui-badge ui-badge-red';
    default:
      return 'ui-badge ui-badge-neutral';
  }
}

export function goodsReceiptPdfFilename(receipt: { number: string | null }): string {
  return `${(receipt.number ?? 'goods-receipt').replace(/[^A-Za-z0-9._-]+/g, '-')}.pdf`;
}

export function formatQuantity(value: number): string {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
}
