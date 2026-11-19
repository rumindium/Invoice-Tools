import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import type { ZodError } from 'zod';
import { AuditService } from '../audit/audit.service';
import { CompaniesService } from '../companies/companies.service';
import { Company, DocumentTemplate, TemplateAsset, TemplateDesign } from '../database/entities';
import { sampleGoodsReceipt } from '../templates/sample-goods-receipt';
import { sampleInvoice } from '../templates/sample-invoice';
import { sampleQuotation } from '../templates/sample-quotation';
import { CUSTOM_TEMPLATE_KEY } from '../templates/template-snapshot';
import { TemplatesService, type TemplateSettingsView } from '../templates/templates.service';
import { goodsReceiptDesignData, invoiceDesignData, quotationDesignData } from './design-data';
import { renderDesignPdf } from './design-pdf';
import {
  DESIGN_KINDS,
  type DesignKind,
  type DesignPayload,
  designPayloadSchema,
  KIND_DOCUMENT_TYPE,
  kindOf,
  MAX_IMAGE_DATA_URL,
} from './design-schema';

/** "an invoice", "a quotation", "a goods receipt". */
const KIND_ARTICLE: Record<DesignKind, string> = {
  invoice: 'an invoice',
  quotation: 'a quotation',
  'goods-receipt': 'a goods receipt',
};
import {
  type TemplateAssetView,
  type TemplateDesignView,
  toAssetView,
  toDesignSnapshot,
  toDesignView,
} from './design-views';

const MAX_ASSETS = 200;
const ASSET_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=\s]+$/;

function invalid(error: ZodError): BadRequestException {
  const messages = error.issues.slice(0, 5).map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
  return new BadRequestException({ message: messages.join(' '), errors: messages });
}

/**
 * Template-builder templates and their asset library, per workspace: one template per document
 * type (invoice, quotation, goods receipt). Saves are optimistic: each names the revision it
 * started from and is refused (409) when someone saved in between.
 */
@Injectable()
export class TemplateDesignsService {
  constructor(
    @InjectRepository(TemplateDesign) private readonly designs: Repository<TemplateDesign>,
    @InjectRepository(TemplateAsset) private readonly assets: Repository<TemplateAsset>,
    @InjectRepository(DocumentTemplate)
    private readonly documentTemplates: Repository<DocumentTemplate>,
    private readonly templates: TemplatesService,
    private readonly companies: CompaniesService,
    private readonly audit: AuditService,
  ) {}

  parse(body: unknown): DesignPayload {
    const parsed = designPayloadSchema.safeParse(body);
    if (!parsed.success) {
      throw invalid(parsed.error);
    }
    return parsed.data;
  }

  private async require(workspaceId: string, id: string): Promise<TemplateDesign> {
    const design = await this.designs.findOne({ where: { id, workspaceId, archivedAt: IsNull() } });
    if (!design) {
      throw new NotFoundException('Design not found.');
    }
    return design;
  }

  private async views(rows: TemplateDesign[]): Promise<TemplateDesignView[]> {
    const applied = await this.templates.appliedKinds(rows.map((row) => row.id));
    return rows.map((row) => toDesignView(row, applied.get(row.id) ?? []));
  }

  async list(workspaceId: string, kind?: string): Promise<TemplateDesignView[]> {
    if (kind && !DESIGN_KINDS.includes(kind as DesignKind)) {
      throw new BadRequestException('Unknown document type.');
    }
    const rows = await this.designs.find({
      where: {
        workspaceId,
        archivedAt: IsNull(),
        ...(kind ? { kind: KIND_DOCUMENT_TYPE[kind as DesignKind] } : {}),
      },
      order: { updatedAt: 'DESC' },
    });
    return this.views(rows);
  }

  async get(workspaceId: string, id: string): Promise<TemplateDesignView> {
    const [view] = await this.views([await this.require(workspaceId, id)]);
    return view;
  }

  /** The workspace's template for a document type, if it has one. */
  private templateOf(workspaceId: string, kind: DesignKind): Promise<TemplateDesign | null> {
    return this.designs.findOne({
      where: { workspaceId, kind: KIND_DOCUMENT_TYPE[kind], archivedAt: IsNull() },
    });
  }

  private quotaConflict(kind: DesignKind, existing: TemplateDesign | null): ConflictException {
    return new ConflictException({
      message: `You already have ${KIND_ARTICLE[kind]} template. Edit it, or delete it to start over.`,
      code: 'TEMPLATE_EXISTS',
      designId: existing?.id ?? null,
    });
  }

  /** Creates the workspace's template for a document type (one per type). */
  async create(workspaceId: string, userId: string, body: unknown): Promise<TemplateDesignView> {
    const payload = this.parse(body);
    const existing = await this.templateOf(workspaceId, payload.kind);
    if (existing) {
      throw this.quotaConflict(payload.kind, existing);
    }
    const row = await this.designs
      .save(
        this.designs.create({
          id: randomUUID(),
          workspaceId,
          name: payload.name,
          kind: KIND_DOCUMENT_TYPE[payload.kind],
          accentColor: payload.accentColor.toLowerCase(),
          page: payload.page,
          elements: payload.elements,
          revision: 1,
          createdBy: userId,
          updatedBy: userId,
        }),
      )
      .catch(async (error: unknown) => {
        // Two creates at once: the unique index keeps the limit.
        if ((error as { code?: string }).code === '23505') {
          throw this.quotaConflict(payload.kind, await this.templateOf(workspaceId, payload.kind));
        }
        throw error;
      });
    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'template_design.created',
      targetType: 'template_design',
      targetId: row.id,
      metadata: { name: row.name, kind: payload.kind, elements: payload.elements.length },
    });
    return toDesignView(row);
  }

  /** Replaces the design. `revision` must be the revision the editor loaded or last saved. */
  async update(
    workspaceId: string,
    userId: string,
    id: string,
    revision: unknown,
    body: unknown,
  ): Promise<TemplateDesignView> {
    if (!Number.isInteger(revision) || (revision as number) < 1) {
      throw new BadRequestException('revision: Send the revision this change is based on.');
    }
    const payload = this.parse(body);
    const current = await this.require(workspaceId, id);
    if (KIND_DOCUMENT_TYPE[payload.kind] !== current.kind) {
      throw new BadRequestException(
        `kind: This is ${KIND_ARTICLE[kindOf(current.kind) ?? 'invoice']} template; its document type can't change.`,
      );
    }

    const result = await this.designs
      .createQueryBuilder()
      .update(TemplateDesign)
      .set({
        name: payload.name,
        kind: KIND_DOCUMENT_TYPE[payload.kind],
        accentColor: payload.accentColor.toLowerCase(),
        page: payload.page,
        elements: payload.elements,
        revision: () => 'revision + 1',
        updatedBy: userId,
        updatedAt: () => 'CURRENT_TIMESTAMP',
      })
      .where('id = :id AND workspace_id = :workspaceId AND revision = :revision', {
        id,
        workspaceId,
        revision,
      })
      .execute();

    if (!result.affected) {
      throw new ConflictException({
        message: 'This design was changed somewhere else. Reload it to see the latest version.',
        code: 'DESIGN_CONFLICT',
        revision: current.revision,
      });
    }

    // Keep the name of an applied template in step with the design.
    await this.documentTemplates.update(
      { designId: id, layout: CUSTOM_TEMPLATE_KEY },
      { name: payload.name, accentColor: payload.accentColor.toLowerCase() },
    );
    return this.get(workspaceId, id);
  }

  /**
   * Deletes a design. Where it was the active template the company goes back to the default
   * layout; documents already generated keep their own copy of the design.
   */
  async remove(workspaceId: string, userId: string, id: string): Promise<void> {
    const design = await this.require(workspaceId, id);
    await this.designs.manager.transaction(async (manager) => {
      await manager
        .getRepository(DocumentTemplate)
        .update({ designId: id }, { isDefault: false, archivedAt: new Date() });
      await manager.getRepository(TemplateDesign).delete({ id, workspaceId });
    });
    this.audit.record({
      workspaceId,
      actorId: userId,
      action: 'template_design.deleted',
      targetType: 'template_design',
      targetId: id,
      metadata: { name: design.name },
    });
  }

  /** Makes the template the company's active one for its document type. */
  async apply(
    workspaceId: string,
    userId: string,
    id: string,
    documentType?: string,
    companyId?: string,
  ): Promise<TemplateSettingsView> {
    const design = await this.require(workspaceId, id);
    const kind = kindOf(design.kind) ?? 'invoice';
    if (documentType && documentType !== kind) {
      throw new BadRequestException(
        `documentType: This is ${KIND_ARTICLE[kind]} template; it can only be used for ${kind.replace('-', ' ')}s.`,
      );
    }
    return this.templates.applyDesign(workspaceId, userId, id, kind, companyId);
  }

  /** The design with sample data on the company's letterhead, as the real PDF will look. */
  async previewPdf(
    workspaceId: string,
    id: string,
    documentType?: string,
  ): Promise<{ buffer: Buffer; filename: string }> {
    const snapshot = toDesignSnapshot(await this.require(workspaceId, id));
    const kind = (documentType ?? snapshot.kind) as DesignKind;
    if (!DESIGN_KINDS.includes(kind)) {
      throw new BadRequestException('Unknown document type.');
    }
    const company = await this.companyForPreview(workspaceId);
    const template = {
      key: CUSTOM_TEMPLATE_KEY,
      name: snapshot.name,
      accentColor: snapshot.accentColor,
    };
    const data =
      kind === 'goods-receipt'
        ? goodsReceiptDesignData(sampleGoodsReceipt(company, template))
        : kind === 'quotation'
          ? quotationDesignData(sampleQuotation(company, template))
          : invoiceDesignData(sampleInvoice(company, template));
    data.stamp = 'SAMPLE';
    const buffer = await renderDesignPdf(
      snapshot,
      data,
      {
        title: `${snapshot.name} — preview`,
        subject: `Template preview (${kind})`,
        author: company.displayName?.trim() || company.legalName,
      },
      `template:${CUSTOM_TEMPLATE_KEY} design:${snapshot.id} revision:${snapshot.revision}`,
    );
    const slug =
      snapshot.name.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'design';
    return { buffer, filename: `${slug}-preview.pdf` };
  }

  /** The workspace's company, or a placeholder letterhead before the profile exists. */
  private async companyForPreview(workspaceId: string): Promise<Company> {
    try {
      return await this.companies.resolveCompany(workspaceId);
    } catch (error) {
      if (!(error instanceof NotFoundException)) throw error;
      return {
        id: 'preview',
        workspaceId,
        legalName: 'Your company',
        displayName: null,
        addressLine1: 'Your company address',
        email: 'hello@yourcompany.com',
        phone: '+62 21 555 0100',
        website: 'www.yourcompany.com',
        taxId: null,
        taxLabel: 'NPWP',
        logoDataUrl: null,
        defaultCurrency: 'IDR',
        defaultTaxRate: 11,
        defaultPaymentTermDays: 14,
        footerText: null,
        signatoryName: null,
        signatoryTitle: null,
      } as unknown as Company;
    }
  }

  /* ---------------------------------------------------------------------------------- assets */

  async listAssets(workspaceId: string, kind?: string): Promise<TemplateAssetView[]> {
    if (kind && kind !== 'upload' && kind !== 'signature') {
      throw new BadRequestException('kind must be upload or signature.');
    }
    const rows = await this.assets.find({
      where: { workspaceId, ...(kind ? { kind: kind as 'upload' | 'signature' } : {}) },
      order: { createdAt: 'DESC' },
    });
    return rows.map(toAssetView);
  }

  async addAsset(
    workspaceId: string,
    userId: string,
    input: { kind: 'upload' | 'signature'; name: string; dataUrl: string },
  ): Promise<TemplateAssetView> {
    if (input.dataUrl.length > MAX_IMAGE_DATA_URL || !ASSET_PATTERN.test(input.dataUrl)) {
      throw new BadRequestException(
        'dataUrl: Use a PNG, JPEG, WebP, GIF or SVG image smaller than about 3 MB.',
      );
    }
    if ((await this.assets.count({ where: { workspaceId } })) >= MAX_ASSETS) {
      throw new BadRequestException(
        `The library holds at most ${MAX_ASSETS} images. Remove some first.`,
      );
    }
    const base64 = input.dataUrl.slice(input.dataUrl.indexOf(',') + 1).replace(/\s/g, '');
    const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
    const row = await this.assets.save(
      this.assets.create({
        id: randomUUID(),
        workspaceId,
        kind: input.kind,
        name: input.name.trim().slice(0, 120) || 'Image',
        dataUrl: input.dataUrl,
        byteSize: Math.floor((base64.length * 3) / 4) - padding,
        createdBy: userId,
      }),
    );
    return toAssetView(row);
  }

  async removeAsset(workspaceId: string, id: string): Promise<void> {
    const result = await this.assets.delete({ id, workspaceId });
    if (!result.affected) {
      throw new NotFoundException('Image not found.');
    }
  }
}
