import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';
import { ChartPoint } from './chart';
import { InvoiceListRow } from './invoice.service';

export type CustomerType = 'BUSINESS' | 'INDIVIDUAL';

export interface CustomerListRow {
  id: string;
  type: CustomerType;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxId: string | null;
  notes: string | null;
  invoiceCount: number;
  billedTotal: number;
  outstandingTotal: number;
  lastInvoiceDate: string | null;
  createdAt: string;
}

export interface CustomerContact {
  id: string;
  name: string;
  jobTitle: string | null;
  phone: string | null;
  createdAt: string;
}

export interface CustomerSummary {
  totalCustomers: number;
  newThisMonth: number;
  withOutstanding: number;
  billedTotal: number;
  chart: ChartPoint[];
}

export interface CustomerDetail {
  customer: CustomerListRow & { contacts: CustomerContact[] };
  stats: {
    invoiceCount: number;
    billedTotal: number;
    outstandingTotal: number;
    paidTotal: number;
    lastInvoiceDate: string | null;
  };
  invoices: InvoiceListRow[];
}

export interface CustomerPayload {
  type: CustomerType;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  taxId?: string;
  notes?: string;
}

export interface ContactPayload {
  name: string;
  jobTitle?: string;
  phone?: string;
}

@Injectable({ providedIn: 'root' })
export class CustomerService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  async list(search = ''): Promise<{
    items: CustomerListRow[];
    total: number;
    summary: CustomerSummary;
  }> {
    const origin = await this.api.apiOrigin;
    const params = search.trim() ? { search: search.trim() } : undefined;

    return firstValueFrom(
      this.http.get<{ items: CustomerListRow[]; total: number; summary: CustomerSummary }>(
        `${origin}/api/v1/customers`,
        { params, withCredentials: true },
      ),
    );
  }

  async detail(id: string): Promise<CustomerDetail> {
    const origin = await this.api.apiOrigin;

    return firstValueFrom(
      this.http.get<CustomerDetail>(`${origin}/api/v1/customers/${id}`, {
        withCredentials: true,
      }),
    );
  }

  async create(payload: CustomerPayload): Promise<CustomerListRow> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ customer: CustomerListRow }>(`${origin}/api/v1/customers`, payload, {
        withCredentials: true,
      }),
    );

    return response.customer;
  }

  async update(id: string, payload: CustomerPayload): Promise<CustomerListRow> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.patch<{ customer: CustomerListRow }>(`${origin}/api/v1/customers/${id}`, payload, {
        withCredentials: true,
      }),
    );

    return response.customer;
  }

  async archive(id: string): Promise<void> {
    const origin = await this.api.apiOrigin;

    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/customers/${id}`, { withCredentials: true }),
    );
  }

  async contacts(customerId: string): Promise<CustomerContact[]> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.get<{ contacts: CustomerContact[] }>(
        `${origin}/api/v1/customers/${customerId}/contacts`,
        { withCredentials: true },
      ),
    );

    return response.contacts;
  }

  async addContact(customerId: string, payload: ContactPayload): Promise<CustomerContact> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<{ contact: CustomerContact }>(
        `${origin}/api/v1/customers/${customerId}/contacts`,
        payload,
        { withCredentials: true },
      ),
    );

    return response.contact;
  }

  async updateContact(
    customerId: string,
    contactId: string,
    payload: ContactPayload,
  ): Promise<CustomerContact> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.patch<{ contact: CustomerContact }>(
        `${origin}/api/v1/customers/${customerId}/contacts/${contactId}`,
        payload,
        { withCredentials: true },
      ),
    );

    return response.contact;
  }

  async removeContact(customerId: string, contactId: string): Promise<void> {
    const origin = await this.api.apiOrigin;

    await firstValueFrom(
      this.http.delete<void>(`${origin}/api/v1/customers/${customerId}/contacts/${contactId}`, {
        withCredentials: true,
      }),
    );
  }
}
