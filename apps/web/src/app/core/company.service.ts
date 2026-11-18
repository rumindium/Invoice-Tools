import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export interface Company {
  id: string;
  legalName: string;
  displayName: string | null;
  address: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  taxId: string | null;
  taxLabel: string;
  logoDataUrl: string | null;
  defaultCurrency: string;
  defaultTaxRate: number;
  defaultPaymentTermDays: number;
  footerText: string | null;
  signatoryName: string | null;
  signatoryTitle: string | null;
  isDefault: boolean;
  updatedAt: string;
}

export interface CompanyPayload {
  legalName: string;
  address?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  taxLabel?: string;
  logoDataUrl?: string;
  defaultCurrency?: string;
  defaultTaxRate?: number;
  defaultPaymentTermDays?: number;
  footerText?: string;
  signatoryName?: string;
  signatoryTitle?: string;
}

export const DEFAULT_COMPANY_LOGO = '/images/company-logo.svg';

@Injectable({ providedIn: 'root' })
export class CompanyService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);

  readonly company = signal<Company | null>(null);
  readonly loading = signal(false);
  readonly loaded = signal(false);

  private pending?: Promise<Company | null>;

  async ensureLoaded(force = false): Promise<Company | null> {
    if (force) {
      this.pending = undefined;
      this.loaded.set(false);
    }

    if (this.loaded() && !force) {
      return this.company();
    }

    this.pending ??= this.fetch();
    return this.pending;
  }

  async save(payload: CompanyPayload): Promise<Company> {
    const origin = await this.api.apiOrigin;
    const current = this.company();
    const response = current
      ? await firstValueFrom(
          this.http.patch<{ company: Company }>(
            `${origin}/api/v1/companies/${current.id}`,
            payload,
            {
              withCredentials: true,
            },
          ),
        )
      : await firstValueFrom(
          this.http.post<{ company: Company }>(`${origin}/api/v1/companies`, payload, {
            withCredentials: true,
          }),
        );

    this.company.set(response.company);
    this.loaded.set(true);
    return response.company;
  }

  private async fetch(): Promise<Company | null> {
    this.loading.set(true);

    try {
      const origin = await this.api.apiOrigin;
      const response = await firstValueFrom(
        this.http.get<{ company: Company | null }>(`${origin}/api/v1/companies/current`, {
          withCredentials: true,
        }),
      );

      this.company.set(response.company);
      return response.company;
    } catch {
      this.company.set(null);
      return null;
    } finally {
      this.loading.set(false);
      this.loaded.set(true);
    }
  }
}
