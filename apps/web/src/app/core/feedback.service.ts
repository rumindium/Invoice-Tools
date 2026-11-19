import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export type FeedbackSource =
  'EMAIL' | 'PHONE' | 'WHATSAPP' | 'MEETING' | 'SOCIAL_MEDIA' | 'WEBSITE' | 'SURVEY' | 'OTHER';
export type FeedbackCategory = 'COMPLIMENT' | 'COMPLAINT' | 'SUGGESTION' | 'QUESTION' | 'OTHER';
export type FeedbackStatus = 'NEW' | 'IN_PROGRESS' | 'RESOLVED';

export interface RelatedDocument {
  id: string;
  type: 'QUOTATION' | 'GOODS_RECEIPT' | 'INVOICE';
  number: string | null;
  date: string;
  status: string;
}

export interface FeedbackListRow {
  id: string;
  customerId: string | null;
  customerName: string;
  contactName: string | null;
  source: FeedbackSource;
  sourceDetail: string | null;
  category: FeedbackCategory;
  rating: number | null;
  subject: string;
  receivedOn: string;
  status: FeedbackStatus;
  relatedDocument: RelatedDocument | null;
  createdAt: string;
}

export interface Feedback {
  id: string;
  customer: { id: string | null; name: string; archived: boolean };
  contactName: string | null;
  source: FeedbackSource;
  sourceDetail: string | null;
  category: FeedbackCategory;
  rating: number | null;
  subject: string;
  message: string;
  receivedOn: string;
  status: FeedbackStatus;
  nextStatuses: FeedbackStatus[];
  resolution: string | null;
  resolvedAt: string | null;
  relatedDocument: RelatedDocument | null;
  evidence: string | null;
  createdByName: string | null;
  history: Array<{
    id: string;
    action: string;
    fromStatus: FeedbackStatus | null;
    toStatus: FeedbackStatus | null;
    reason: string | null;
    actorName: string | null;
    at: string;
  }>;
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackSummary {
  total: number;
  open: number;
  byStatus: Record<FeedbackStatus, number>;
  bySource: Record<FeedbackSource, number>;
  byCategory: Record<FeedbackCategory, number>;
  ratedCount: number;
  averageRating: number | null;
  thisMonth: number;
}

export interface FeedbackPayload {
  customerId?: string;
  customerName: string;
  contactName?: string;
  source: FeedbackSource;
  sourceDetail?: string;
  category: FeedbackCategory;
  rating?: number;
  subject: string;
  message: string;
  receivedOn: string;
  relatedDocumentId?: string;
  evidence?: string;
}

export interface FeedbackFilters {
  search?: string;
  status?: FeedbackStatus | 'OPEN' | 'ALL';
  source?: FeedbackSource | 'ALL';
  category?: FeedbackCategory | 'ALL';
}

@Injectable({ providedIn: 'root' })
export class FeedbackService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  readonly rows = signal<FeedbackListRow[]>([]);
  readonly listLoading = signal(false);
  readonly listError = signal('');
  readonly summary = signal<FeedbackSummary | null>(null);

  private async url(path = ''): Promise<string> {
    return `${await this.api.apiOrigin}/api/v1/feedback${path}`;
  }

  async load(filters: FeedbackFilters = {}): Promise<void> {
    this.listLoading.set(true);
    this.listError.set('');

    try {
      let params = new HttpParams().set('pageSize', '100');
      if (filters.search?.trim()) params = params.set('search', filters.search.trim());
      for (const key of ['status', 'source', 'category'] as const) {
        const value = filters[key];
        if (value && value !== 'ALL') params = params.set(key, value);
      }

      const response = await firstValueFrom(
        this.http.get<{ items: FeedbackListRow[] }>(await this.url(), {
          params,
          withCredentials: true,
        }),
      );
      this.rows.set(response.items);
    } catch {
      this.listError.set('Feedback could not be loaded.');
      this.rows.set([]);
    } finally {
      this.listLoading.set(false);
    }
  }

  async loadSummary(): Promise<void> {
    try {
      this.summary.set(
        await firstValueFrom(
          this.http.get<FeedbackSummary>(await this.url('/summary'), { withCredentials: true }),
        ),
      );
    } catch {
      this.summary.set(null);
    }
  }

  async relatedDocuments(customerId?: string): Promise<RelatedDocument[]> {
    const params = customerId ? new HttpParams().set('customerId', customerId) : undefined;
    const response = await firstValueFrom(
      this.http.get<{ documents: RelatedDocument[] }>(await this.url('/related-documents'), {
        params,
        withCredentials: true,
      }),
    );
    return response.documents;
  }

  async get(id: string): Promise<Feedback> {
    const response = await firstValueFrom(
      this.http.get<{ feedback: Feedback }>(await this.url(`/${id}`), { withCredentials: true }),
    );
    return response.feedback;
  }

  async create(payload: FeedbackPayload): Promise<Feedback> {
    const response = await firstValueFrom(
      this.http.post<{ feedback: Feedback }>(await this.url(), payload, { withCredentials: true }),
    );
    await this.loadSummary();
    return response.feedback;
  }

  async update(id: string, payload: FeedbackPayload): Promise<Feedback> {
    const response = await firstValueFrom(
      this.http.put<{ feedback: Feedback }>(await this.url(`/${id}`), payload, {
        withCredentials: true,
      }),
    );
    return response.feedback;
  }

  async changeStatus(id: string, status: FeedbackStatus, resolution?: string): Promise<Feedback> {
    const response = await firstValueFrom(
      this.http.post<{ feedback: Feedback }>(
        await this.url(`/${id}/status`),
        { status, resolution },
        { withCredentials: true },
      ),
    );
    await this.loadSummary();
    return response.feedback;
  }

  async remove(id: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(await this.url(`/${id}`), { withCredentials: true }),
    );
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
    await this.loadSummary();
  }
}

export const FEEDBACK_SOURCES: FeedbackSource[] = [
  'EMAIL',
  'PHONE',
  'WHATSAPP',
  'MEETING',
  'SOCIAL_MEDIA',
  'WEBSITE',
  'SURVEY',
  'OTHER',
];

export const FEEDBACK_SOURCE_LABEL: Record<FeedbackSource, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone call',
  WHATSAPP: 'WhatsApp',
  MEETING: 'Meeting / visit',
  SOCIAL_MEDIA: 'Social media',
  WEBSITE: 'Website / form',
  SURVEY: 'Survey',
  OTHER: 'Other',
};

/** SVG path data for each channel's icon (24×24, stroked). */
export const FEEDBACK_SOURCE_ICON: Record<FeedbackSource, string> = {
  EMAIL: 'M4 6h16v12H4z M4 7l8 6 8-6',
  PHONE:
    'M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z',
  WHATSAPP:
    'M4 20l1.3-3.9A8 8 0 1 1 8 19.1L4 20z M9 9.5c0 3 2.5 5.5 5.5 5.5l1-1.5-2-1-1 .8a4 4 0 0 1-2-2l.8-1-1-2-1.3 1.2z',
  MEETING:
    'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M16 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M3 20c0-3 2.2-5 5-5s5 2 5 5 M11 20c0-3 2.2-5 5-5s5 2 5 5',
  SOCIAL_MEDIA:
    'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.6 13.5l6.8 4 M15.4 6.5l-6.8 4',
  WEBSITE:
    'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z M3 12h18 M12 3a14 14 0 0 1 0 18 M12 3a14 14 0 0 0 0 18',
  SURVEY: 'M9 4h6v3H9z M7 5H5v16h14V5h-2 M8 12l2 2 4-4 M8 17h8',
  OTHER: 'M5 12h.01 M12 12h.01 M19 12h.01',
};

export const FEEDBACK_CATEGORIES: FeedbackCategory[] = [
  'COMPLIMENT',
  'COMPLAINT',
  'SUGGESTION',
  'QUESTION',
  'OTHER',
];

export const FEEDBACK_CATEGORY_LABEL: Record<FeedbackCategory, string> = {
  COMPLIMENT: 'Compliment',
  COMPLAINT: 'Complaint',
  SUGGESTION: 'Suggestion',
  QUESTION: 'Question',
  OTHER: 'Other',
};

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  RESOLVED: 'Resolved',
};

export const FEEDBACK_ACTION_LABEL: Record<FeedbackStatus, string> = {
  NEW: 'Mark as new',
  IN_PROGRESS: 'Start handling',
  RESOLVED: 'Mark as resolved',
};

export function feedbackStatusClass(status: FeedbackStatus): string {
  switch (status) {
    case 'RESOLVED':
      return 'ui-badge ui-badge-green';
    case 'IN_PROGRESS':
      return 'ui-badge ui-badge-amber';
    default:
      return 'ui-badge ui-badge-blue';
  }
}

export function feedbackCategoryClass(category: FeedbackCategory): string {
  switch (category) {
    case 'COMPLIMENT':
      return 'ui-badge ui-badge-green';
    case 'COMPLAINT':
      return 'ui-badge ui-badge-red';
    case 'SUGGESTION':
      return 'ui-badge ui-badge-blue';
    default:
      return 'ui-badge ui-badge-neutral';
  }
}

export function sourceText(row: { source: FeedbackSource; sourceDetail: string | null }): string {
  return row.source === 'OTHER' && row.sourceDetail
    ? row.sourceDetail
    : FEEDBACK_SOURCE_LABEL[row.source];
}

export const RELATED_TYPE_LABEL: Record<RelatedDocument['type'], string> = {
  QUOTATION: 'Quotation',
  GOODS_RECEIPT: 'Goods receipt',
  INVOICE: 'Invoice',
};

export function relatedLink(document: RelatedDocument): string[] {
  switch (document.type) {
    case 'QUOTATION':
      return ['/quotations', document.id];
    case 'GOODS_RECEIPT':
      return ['/goods-receipts', document.id];
    default:
      return ['/documents', document.id];
  }
}
