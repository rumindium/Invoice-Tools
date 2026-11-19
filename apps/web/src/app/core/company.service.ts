import { HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
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
  /** Name, address and phone are filled in (decided by the API). */
  profileComplete: boolean;
  missingProfileFields: Array<'legalName' | 'address' | 'phone'>;
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
  /** True once the workspace has a company with a complete letterhead. */
  readonly profileComplete = computed(() => this.company()?.profileComplete ?? false);

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

  /**
   * Creates or updates the company. Updates start from the current profile, so a form that
   * shows only some fields (the dashboard card, the welcome form) never erases the others;
   * keys present in `payload` win, even when undefined (e.g. removing the logo).
   */
  async save(payload: CompanyPayload): Promise<Company> {
    const origin = await this.api.apiOrigin;
    const current = this.company();
    if (current) {
      payload = { ...toPayload(current), ...payload };
    }
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

/** The editable fields of a saved company, as a payload. */
function toPayload(company: Company): CompanyPayload {
  const optional = (value: string | null) => value ?? undefined;
  return {
    legalName: company.legalName,
    address: optional(company.address),
    email: optional(company.email),
    phone: optional(company.phone),
    website: optional(company.website),
    taxId: optional(company.taxId),
    taxLabel: company.taxLabel,
    logoDataUrl: optional(company.logoDataUrl),
    defaultCurrency: company.defaultCurrency,
    defaultTaxRate: company.defaultTaxRate,
    defaultPaymentTermDays: company.defaultPaymentTermDays,
    footerText: optional(company.footerText),
    signatoryName: optional(company.signatoryName),
    signatoryTitle: optional(company.signatoryTitle),
  };
}
