import { describe, expect, it } from 'vitest';
import type { Company } from '../database/entities';
import { missingProfileFields, toCompanyView } from './companies.service';

function company(overrides: Partial<Company> = {}): Company {
  return {
    id: 'c-1',
    workspaceId: 'w-1',
    legalName: 'PT Rumindium Studio',
    displayName: null,
    logoAssetId: null,
    logoDataUrl: null,
    addressLine1: 'Jl. Sudirman 1, Jakarta',
    addressLine2: null,
    city: null,
    province: null,
    postalCode: null,
    countryCode: 'ID',
    email: null,
    phone: '+62 21 555 0123',
    website: null,
    taxId: null,
    taxLabel: 'Tax ID',
    bankDetails: [],
    defaultCurrency: 'IDR',
    defaultLocale: 'id-ID',
    timeZone: 'Asia/Jakarta',
    defaultTaxMode: 'EXCLUSIVE',
    defaultPaymentTermDays: 14,
    footerText: null,
    signatoryName: null,
    signatoryTitle: null,
    isDefault: true,
    archivedAt: null,
    createdAt: new Date('2026-11-18T00:00:00Z'),
    updatedAt: new Date('2026-11-18T00:00:00Z'),
    ...overrides,
  } as Company;
}

describe('company profile completeness', () => {
  it('is complete with a name, address and phone', () => {
    const view = toCompanyView(company());
    expect(view.profileComplete).toBe(true);
    expect(view.missingProfileFields).toEqual([]);
  });

  it('lists what is missing, treating blank text as missing', () => {
    const view = toCompanyView(company({ addressLine1: '   ', phone: null }));
    expect(view.profileComplete).toBe(false);
    expect(view.missingProfileFields).toEqual(['address', 'phone']);
  });

  it('treats no company at all as missing everything', () => {
    expect(missingProfileFields(null)).toEqual(['legalName', 'address', 'phone']);
  });
});
