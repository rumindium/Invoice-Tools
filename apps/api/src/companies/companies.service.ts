import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Decimal } from '../database/decimal.transformer';
import { Company } from '../database/entities';
import { CompanyInputDto } from './dto/company-input.dto';

export interface CompanyView {
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

export function toCompanyView(company: Company): CompanyView {
  return {
    id: company.id,
    legalName: company.legalName,
    displayName: company.displayName,
    address: company.addressLine1,
    email: company.email,
    phone: company.phone,
    website: company.website,
    taxId: company.taxId,
    taxLabel: company.taxLabel,
    logoDataUrl: company.logoDataUrl,
    defaultCurrency: company.defaultCurrency,
    defaultTaxRate: Number(company.defaultTaxRate),
    defaultPaymentTermDays: company.defaultPaymentTermDays,
    footerText: company.footerText,
    signatoryName: company.signatoryName,
    signatoryTitle: company.signatoryTitle,
    isDefault: company.isDefault,
    updatedAt: company.updatedAt.toISOString(),
  };
}

@Injectable()
export class CompaniesService {
  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly audit: AuditService,
  ) {}

  async list(workspaceId: string): Promise<CompanyView[]> {
    const companies = await this.companies.find({
      where: { workspaceId, archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    return companies.map(toCompanyView);
  }

  async current(workspaceId: string): Promise<CompanyView | null> {
    const company = await this.companies.findOne({
      where: { workspaceId, archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    return company ? toCompanyView(company) : null;
  }

  async create(workspaceId: string, userId: string, dto: CompanyInputDto): Promise<CompanyView> {
    const existing = await this.companies.count({
      where: { workspaceId, archivedAt: IsNull() },
    });

    const company = this.companies.create({
      id: randomUUID(),
      workspaceId,
      legalName: dto.legalName.trim(),
      displayName: dto.displayName?.trim() || null,
      addressLine1: dto.address?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      website: dto.website?.trim() || null,
      taxId: dto.taxId?.trim() || null,
      ...(dto.taxLabel ? { taxLabel: dto.taxLabel.trim() } : {}),
      logoDataUrl: dto.logoDataUrl ?? null,
      ...(dto.defaultCurrency ? { defaultCurrency: dto.defaultCurrency } : {}),
      defaultTaxRate: new Decimal(dto.defaultTaxRate ?? 0),
      ...(dto.defaultPaymentTermDays !== undefined
        ? { defaultPaymentTermDays: dto.defaultPaymentTermDays }
        : {}),
      footerText: dto.footerText?.trim() || null,
      signatoryName: dto.signatoryName?.trim() || null,
      signatoryTitle: dto.signatoryTitle?.trim() || null,
      isDefault: existing === 0,
    });

    const saved = await this.companies.save(company);

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'company.created',
      targetType: 'company',
      targetId: saved.id,
      metadata: { name: saved.legalName },
    });

    return toCompanyView(saved);
  }

  async update(
    workspaceId: string,
    userId: string,
    companyId: string,
    dto: CompanyInputDto,
  ): Promise<CompanyView> {
    const company = await this.requireOwned(workspaceId, companyId);

    Object.assign(company, {
      legalName: dto.legalName.trim(),
      displayName: dto.displayName?.trim() || null,
      addressLine1: dto.address?.trim() || null,
      email: dto.email?.trim().toLowerCase() || null,
      phone: dto.phone?.trim() || null,
      website: dto.website?.trim() || null,
      taxId: dto.taxId?.trim() || null,
      logoDataUrl: dto.logoDataUrl ?? null,
      footerText: dto.footerText?.trim() || null,
      signatoryName: dto.signatoryName?.trim() || null,
      signatoryTitle: dto.signatoryTitle?.trim() || null,
      ...(dto.taxLabel ? { taxLabel: dto.taxLabel.trim() } : {}),
      ...(dto.defaultCurrency ? { defaultCurrency: dto.defaultCurrency } : {}),
      ...(dto.defaultTaxRate !== undefined
        ? { defaultTaxRate: new Decimal(dto.defaultTaxRate) }
        : {}),
      ...(dto.defaultPaymentTermDays !== undefined
        ? { defaultPaymentTermDays: dto.defaultPaymentTermDays }
        : {}),
    });

    const saved = await this.companies.save(company);

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'company.updated',
      targetType: 'company',
      targetId: saved.id,
      metadata: { name: saved.legalName },
    });

    return toCompanyView(saved);
  }

  async archive(workspaceId: string, userId: string, companyId: string): Promise<void> {
    const company = await this.requireOwned(workspaceId, companyId);

    await this.companies.update({ id: companyId }, { archivedAt: new Date(), isDefault: false });

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'company.archived',
      targetType: 'company',
      targetId: companyId,
      metadata: { name: company.legalName },
    });
  }

  async requireOwned(workspaceId: string, companyId: string): Promise<Company> {
    const company = await this.companies.findOne({
      where: { id: companyId, workspaceId, archivedAt: IsNull() },
    });

    if (!company) {
      throw new NotFoundException('Company not found.');
    }

    return company;
  }

  async findById(companyId: string): Promise<Company | null> {
    return this.companies.findOne({ where: { id: companyId } });
  }

  async resolveCompany(workspaceId: string, companyId?: string): Promise<Company> {
    if (companyId) {
      return this.requireOwned(workspaceId, companyId);
    }

    const company = await this.companies.findOne({
      where: { workspaceId, archivedAt: IsNull() },
      order: { isDefault: 'DESC', createdAt: 'ASC' },
    });

    if (!company) {
      throw new NotFoundException(
        'Company profile is missing. Complete your company profile before creating an invoice.',
      );
    }

    return company;
  }
}
