import { Injectable } from '@angular/core';

export interface CompanyProfile {
  companyName: string;
  address: string;
  phone: string;
  logoUrl: string | null;
}

export const DEFAULT_COMPANY_LOGO = '/images/company-logo.svg';

const EMPTY_PROFILE: CompanyProfile = {
  companyName: '',
  address: '',
  phone: '',
  logoUrl: null,
};

@Injectable({ providedIn: 'root' })
export class CompanyProfileService {
  load(workspaceId: string | null): CompanyProfile {
    if (typeof localStorage === 'undefined') {
      return { ...EMPTY_PROFILE };
    }

    try {
      const raw = localStorage.getItem(this.storageKey(workspaceId));
      if (!raw) return { ...EMPTY_PROFILE };

      const parsed = JSON.parse(raw) as Partial<CompanyProfile>;
      return {
        companyName: typeof parsed.companyName === 'string' ? parsed.companyName : '',
        address: typeof parsed.address === 'string' ? parsed.address : '',
        phone: typeof parsed.phone === 'string' ? parsed.phone : '',
        logoUrl: typeof parsed.logoUrl === 'string' ? parsed.logoUrl : null,
      };
    } catch {
      return { ...EMPTY_PROFILE };
    }
  }

  save(workspaceId: string | null, profile: CompanyProfile): boolean {
    if (typeof localStorage === 'undefined') return false;

    try {
      localStorage.setItem(this.storageKey(workspaceId), JSON.stringify(profile));
      return true;
    } catch {
      return false;
    }
  }

  private storageKey(workspaceId: string | null): string {
    return `rinv.company-profile.${workspaceId ?? 'default'}`;
  }
}
