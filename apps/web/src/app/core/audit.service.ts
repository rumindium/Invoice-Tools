import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export type AuditTargetType =
  | 'user'
  | 'quotation'
  | 'goods_receipt'
  | 'invoice'
  | 'customer'
  | 'item'
  | 'unit'
  | 'company'
  | 'feedback'
  | 'template';

export interface AuditEvent {
  id: string;
  action: string;
  targetType: AuditTargetType;
  targetId: string;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

export interface AuditPage {
  events: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AuditListOptions {
  page?: number;
  pageSize?: number;
  targetType?: AuditTargetType | 'ALL';
  search?: string;
}

@Injectable({ providedIn: 'root' })
export class AuditService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  async list(options: AuditListOptions = {}): Promise<AuditPage> {
    const origin = await this.api.apiOrigin;
    let params = new HttpParams()
      .set('page', String(options.page ?? 1))
      .set('pageSize', String(options.pageSize ?? 50));

    if (options.targetType && options.targetType !== 'ALL') {
      params = params.set('targetType', options.targetType);
    }

    if (options.search?.trim()) {
      params = params.set('search', options.search.trim());
    }

    return firstValueFrom(
      this.http.get<AuditPage>(`${origin}/api/v1/audit-events`, {
        params,
        withCredentials: true,
      }),
    );
  }
}
