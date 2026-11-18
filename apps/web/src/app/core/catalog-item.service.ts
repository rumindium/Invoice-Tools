import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { ChartPoint } from './chart';
import { InvoiceListRow } from './invoice.service';

export type ItemKind = 'PRODUCT' | 'SERVICE';

export interface ItemListRow {
  id: string;
  kind: ItemKind;
  name: string;
  description: string | null;
  unit: string;
  unitPrice: number;
  isActive: boolean;
  invoiceCount: number;
  quantitySold: number;
  revenue: number;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface ItemSummary {
  totalItems: number;
  activeItems: number;
  usedItems: number;
  itemRevenue: number;
  chart: ChartPoint[];
}

export interface ItemDetail {
  item: ItemListRow;
  invoices: InvoiceListRow[];
}

export interface ItemPayload {
  kind: ItemKind;
  name: string;
  description?: string;
  unit?: string;
  unitPrice: number;
  isActive?: boolean;
}

@Injectable({ providedIn: 'root' })
export class CatalogItemService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  async list(search = ''): Promise<{ items: ItemListRow[]; total: number; summary: ItemSummary }> {
    const origin = await this.api.apiOrigin;
    const params = search.trim() ? { search: search.trim() } : undefined;

    return firstValueFrom(
      this.http.get<{ items: ItemListRow[]; total: number; summary: ItemSummary }>(
        `${origin}/api/v1/items`,
        { params, withCredentials: true },
      ),
    );
  }

  async detail(id: string): Promise<ItemDetail> {
    const origin = await this.api.apiOrigin;

    return firstValueFrom(
      this.http.get<ItemDetail>(`${origin}/api/v1/items/${id}`, { withCredentials: true }),
    );
  }

  async create(payload: ItemPayload): Promise<ItemListRow> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ item: ItemListRow }>(`${origin}/api/v1/items`, payload, {
        withCredentials: true,
      }),
    );

    return response.item;
  }

  async update(id: string, payload: ItemPayload): Promise<ItemListRow> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.patch<{ item: ItemListRow }>(`${origin}/api/v1/items/${id}`, payload, {
        withCredentials: true,
      }),
    );

    return response.item;
  }

  async archive(id: string): Promise<void> {
    const origin = await this.api.apiOrigin;

    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/items/${id}`, { withCredentials: true }),
    );
  }
}
