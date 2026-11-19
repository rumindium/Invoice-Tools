import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { Company, Document, DocumentTemplate, TemplateDesign } from '../database/entities';
import { DocumentStatus, DocumentType } from '../database/entities/enums';
import { renderInvoicePdf } from '../documents/pdf/invoice-pdf';
import { renderGoodsReceiptPdf } from '../goods-receipts/goods-receipt-pdf';
import { renderQuotationPdf } from '../quotations/quotation-pdf';
import { ApplyTemplateDto, TemplatePreviewQueryDto } from './dto/template.dto';
import { sampleGoodsReceipt } from './sample-goods-receipt';
import { sampleInvoice } from './sample-invoice';
import { sampleQuotation } from './sample-quotation';
import {
  DEFAULT_TEMPLATE,
  findTemplate,
  isTemplateKey,
  TEMPLATE_DOCUMENT_LABELS,
  TEMPLATE_DOCUMENT_TYPES,
  TEMPLATE_PALETTE,
  templateCatalog,
  type TemplateDefinition,
} from './template-catalog';
import { kindOf } from '../template-designs/design-schema';
import { toDesignSnapshot } from '../template-designs/design-views';
import {
  CUSTOM_TEMPLATE_KEY,
  type DocumentTemplateView,
  LEGACY_TEMPLATE,
  readTemplateSnapshot,
  templateColumns,
  type TemplateSnapshot,
  toTemplateView,
} from './template-snapshot';
import { normaliseColor } from './template-theme';

export interface TemplateOptionView extends TemplateDefinition {
  /** The company's colour for this layout (its last choice, or the layout's default). */
  accentColor: string;
  active: boolean;
}

export interface TemplateSettingsView {
  documentType: string;
  company: { id: string; name: string };
  active: Omit<TemplateSnapshot, 'design'> & {
    appliedAt: string | null;
    /** Set when a template-builder design is applied (key `custom`). */
    design: { id: string; name: string; revision: number } | null;
  };
  templates: TemplateOptionView[];
  palette: Array<{ name: string; color: string }>;
}

const AUDIT_TARGET = 'template';

@Injectable()
export class TemplatesService {
  constructor(
    @InjectRepository(DocumentTemplate) private readonly templates: Repository<DocumentTemplate>,
    @InjectRepository(TemplateDesign) private readonly designs: Repository<TemplateDesign>,
    private readonly companies: CompaniesService,
    private readonly audit: AuditService,
  ) {}

  /** Maps the URL segment ("quotation") to a document type with a catalog. */
  documentTypeOf(segment: string): DocumentType {
    const documentType = TEMPLATE_DOCUMENT_TYPES[segment];
    if (!documentType) {
      throw new NotFoundException(`Templates for "${segment}" are not available yet.`);
    }
    return documentType;
  }

  /** The company's active template for a document type, or the default layout. */
  async activeFor(companyId: string, documentType: DocumentType): Promise<TemplateSnapshot> {
    const row = await this.templates.findOne({
      where: { companyId, documentType, isDefault: true, archivedAt: IsNull() },
    });

    if (row?.layout === CUSTOM_TEMPLATE_KEY && row.designId) {
      const design = await this.designs.findOne({ where: { id: row.designId } });
      if (design) {
        const snapshot = toDesignSnapshot(design);
        return {
          templateId: row.id,
          key: CUSTOM_TEMPLATE_KEY,
          name: snapshot.name,
          accentColor: snapshot.accentColor,
          design: snapshot,
        };
      }
    }

    if (row && isTemplateKey(row.layout)) {
      const definition = findTemplate(row.layout, documentType);
      return {
        templateId: row.id,
        key: definition.key,
        name: definition.name,
        accentColor: normaliseColor(row.accentColor, definition.defaultColor),
      };
    }

    const fallback = findTemplate(DEFAULT_TEMPLATE, documentType);
    return {
      templateId: null,
      key: fallback.key,
      name: fallback.name,
      accentColor: fallback.defaultColor,
    };
  }

  /** Columns that record the company's active template on a newly generated document. */
  async documentColumns(
    companyId: string,
    documentType: DocumentType,
  ): Promise<ReturnType<typeof templateColumns>> {
    return templateColumns(await this.activeFor(companyId, documentType));
  }

  /**
   * The template a document is drawn with. Drafts follow the company's active template;
   * a document that left draft keeps the template frozen at that moment (Classic blue when
   * it predates templates).
   */
  async templateOf(
    document: Pick<Document, 'status' | 'companyId' | 'documentType' | 'templateSnapshot'>,
  ): Promise<DocumentTemplateView> {
    if (document.status === DocumentStatus.DRAFT) {
      return toTemplateView(
        await this.activeFor(document.companyId, document.documentType),
        false,
        document.documentType,
      );
    }
    const stored = readTemplateSnapshot(document.templateSnapshot, document.documentType);
    return stored ? toTemplateView(stored, true, document.documentType) : LEGACY_TEMPLATE;
  }

  async settings(
    workspaceId: string,
    segment: string,
    companyId?: string,
  ): Promise<TemplateSettingsView> {
    const documentType = this.documentTypeOf(segment);
    const company = await this.companies.resolveCompany(workspaceId, companyId);
    return this.view(company, segment, documentType);
  }

  async apply(
    workspaceId: string,
    userId: string,
    segment: string,
    dto: ApplyTemplateDto,
  ): Promise<TemplateSettingsView> {
    const documentType = this.documentTypeOf(segment);
    const company = await this.companies.resolveCompany(workspaceId, dto.companyId);
    const definition = findTemplate(dto.key, documentType);
    const label = TEMPLATE_DOCUMENT_LABELS[documentType] ?? segment;
    const accentColor = normaliseColor(dto.accentColor, definition.defaultColor);
    const previous = await this.activeFor(company.id, documentType);

    const saved = await this.templates.manager.transaction(async (manager) => {
      const repository = manager.getRepository(DocumentTemplate);
      const slug = `${segment}-${definition.key}`;

      // Clear the old active row first: at most one active template per document type.
      await repository.update(
        { companyId: company.id, documentType, isDefault: true },
        { isDefault: false },
      );

      const row =
        (await repository.findOne({ where: { companyId: company.id, slug } })) ??
        repository.create({
          id: randomUUID(),
          companyId: company.id,
          slug,
          paperSize: 'A4',
          orientation: 'portrait',
        });

      Object.assign(row, {
        name: `${definition.name} ${label}`,
        documentType,
        layout: definition.key,
        accentColor,
        isDefault: true,
        archivedAt: null,
      });
      return repository.save(row);
    });

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'template.applied',
      targetType: AUDIT_TARGET,
      targetId: saved.id,
      metadata: {
        name: `${definition.name} ${label} template`,
        documentType,
        layout: definition.key,
        accentColor,
        previousLayout: previous.key,
        previousAccentColor: previous.accentColor,
      },
    });

    return this.view(company, segment, documentType);
  }

  /**
   * Makes a template-builder design the company's active template for a document type (the
   * design's own kind by default). New documents, and drafts on their next save, use it.
   */
  async applyDesign(
    workspaceId: string,
    userId: string,
    designId: string,
    segment?: string,
    companyId?: string,
  ): Promise<TemplateSettingsView> {
    const design = await this.designs.findOne({ where: { id: designId, workspaceId } });
    if (!design) {
      throw new NotFoundException('Design not found.');
    }
    const kind = segment ?? kindOf(design.kind) ?? 'invoice';
    const documentType = this.documentTypeOf(kind);
    const company = await this.companies.resolveCompany(workspaceId, companyId);
    const previous = await this.activeFor(company.id, documentType);

    const saved = await this.templates.manager.transaction(async (manager) => {
      const repository = manager.getRepository(DocumentTemplate);
      const slug = `${kind}-${CUSTOM_TEMPLATE_KEY}`;
      await repository.update(
        { companyId: company.id, documentType, isDefault: true },
        { isDefault: false },
      );
      const row =
        (await repository.findOne({ where: { companyId: company.id, slug } })) ??
        repository.create({
          id: randomUUID(),
          companyId: company.id,
          slug,
          paperSize: 'A4',
          orientation: 'portrait',
        });
      Object.assign(row, {
        name: design.name,
        documentType,
        layout: CUSTOM_TEMPLATE_KEY,
        designId: design.id,
        accentColor: design.accentColor,
        isDefault: true,
        archivedAt: null,
      });
      return repository.save(row);
    });

    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'template.applied',
      targetType: AUDIT_TARGET,
      targetId: saved.id,
      metadata: {
        name: `${design.name} (template builder)`,
        documentType,
        layout: CUSTOM_TEMPLATE_KEY,
        designId: design.id,
        accentColor: design.accentColor,
        previousLayout: previous.key,
        previousAccentColor: previous.accentColor,
      },
    });

    return this.view(company, kind, documentType);
  }

  /** Document types (URL segments) a design is the active template of, per design id. */
  async appliedKinds(designIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();
    if (designIds.length === 0) {
      return result;
    }
    const rows = await this.templates
      .createQueryBuilder('template')
      .where('template.design_id IN (:...designIds)', { designIds })
      .andWhere('template.is_default = true')
      .andWhere('template.archived_at IS NULL')
      .getMany();
    for (const row of rows) {
      const kind = row.documentType ? kindOf(row.documentType) : null;
      if (row.designId && kind) {
        result.set(row.designId, [...(result.get(row.designId) ?? []), kind]);
      }
    }
    return result;
  }

  /** A sample document with the company's letterhead, drawn in any layout and colour. */
  async previewPdf(
    workspaceId: string,
    segment: string,
    query: TemplatePreviewQueryDto,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const documentType = this.documentTypeOf(segment);
    const company = await this.companies.resolveCompany(workspaceId, query.companyId);
    const active = await this.activeFor(company.id, documentType);
    const key = query.key ?? active.key;
    const saved = await this.templates.findOne({
      where: { companyId: company.id, slug: `${segment}-${key}` },
    });
    const definition = findTemplate(key, documentType);
    const accentColor = normaliseColor(
      query.accentColor ?? saved?.accentColor ?? definition.defaultColor,
      definition.defaultColor,
    );
    const template = { key: definition.key, name: definition.name, accentColor };

    const buffer =
      documentType === DocumentType.GOODS_RECEIPT
        ? await renderGoodsReceiptPdf(sampleGoodsReceipt(company, template))
        : documentType === DocumentType.INVOICE
          ? await renderInvoicePdf(sampleInvoice(company, template))
          : await renderQuotationPdf(sampleQuotation(company, template));
    return { buffer, filename: `${segment}-template-${definition.key}.pdf` };
  }

  private async view(
    company: Company,
    segment: string,
    documentType: DocumentType,
  ): Promise<TemplateSettingsView> {
    const rows = await this.templates.find({
      where: { companyId: company.id, documentType, archivedAt: IsNull() },
    });
    const active = await this.activeFor(company.id, documentType);
    const activeRow = rows.find((row) => row.id === active.templateId);

    const { design, ...activeTemplate } = active;
    return {
      documentType: segment,
      company: { id: company.id, name: company.displayName?.trim() || company.legalName },
      active: {
        ...activeTemplate,
        appliedAt: activeRow?.updatedAt.toISOString() ?? null,
        design: design ? { id: design.id, name: design.name, revision: design.revision } : null,
      },
      templates: templateCatalog(documentType).map((definition) => {
        const row = rows.find((candidate) => candidate.layout === definition.key);
        return {
          ...definition,
          highlights: [...definition.highlights],
          accentColor: row
            ? normaliseColor(row.accentColor, definition.defaultColor)
            : definition.defaultColor,
          active: definition.key === active.key,
        };
      }),
      palette: TEMPLATE_PALETTE,
    };
  }
}
