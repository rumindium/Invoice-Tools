import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { ILike, IsNull, Repository } from 'typeorm';
import { ChartPoint, monthBuckets, monthlySeries } from '../common/series';
import { CatalogItem, Customer, Document, DocumentItem } from '../database/entities';
import { CatalogKind, DocumentType } from '../database/entities/enums';
import { toInvoiceListRow, type InvoiceListRow } from '../documents/views';
import { ItemInputDto, ListItemsQueryDto } from './dto/item.dto';

type DocumentWithUsage = Document & { items: DocumentItem[]; customer: Customer | null };

interface UsageLine {
  catalogItemId: string | null;
  nameKey: string;
  documentId: string;
  issueDate: string;
  quantity: number;
  revenue: number;
}

interface ItemUsage {
  invoiceCount: number;
  quantitySold: number;
  revenue: number;
  lastUsedAt: string | null;
}

export interface ItemListRow {
  id: string;
  kind: string;
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

const EMPTY_USAGE: ItemUsage = {
  invoiceCount: 0,
  quantitySold: 0,
  revenue: 0,
  lastUsedAt: null,
};

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function toItemRow(item: CatalogItem, usage: ItemUsage): ItemListRow {
  return {
    id: item.id,
    kind: item.kind,
    name: item.name,
    description: item.description,
    unit: item.unit,
    unitPrice: Number(item.unitPrice),
    isActive: item.isActive,
    invoiceCount: usage.invoiceCount,
    quantitySold: usage.quantitySold,
    revenue: usage.revenue,
    lastUsedAt: usage.lastUsedAt,
    createdAt: item.createdAt.toISOString(),
  };
}

/**
 * Invoices created before catalog items existed carry no link, so a line counts for an item
 * when it points at it by id or when its name matches. Archiving an item keeps the lines.
 */
function matches(line: UsageLine, item: CatalogItem): boolean {
  return line.catalogItemId === item.id || line.nameKey === normalize(item.name);
}

@Injectable()
export class ItemsService {
  constructor(
    @InjectRepository(CatalogItem) private readonly items: Repository<CatalogItem>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
  ) {}

  async list(
    workspaceId: string,
    query: ListItemsQueryDto,
  ): Promise<{ items: ItemListRow[]; total: number; summary: ItemSummary }> {
    const search = query.search?.trim();
    const items = await this.items.find({
      where: {
        workspaceId,
        archivedAt: IsNull(),
        ...(search ? { name: ILike(`%${search}%`) } : {}),
      },
      order: { name: 'ASC' },
    });

    const all = await this.items.find({ where: { workspaceId, archivedAt: IsNull() } });
    const documents = await this.loadInvoices(workspaceId);
    const lines = this.lines(documents);

    return {
      items: items.map((item) => toItemRow(item, this.usage(lines, documents, item))),
      total: items.length,
      summary: this.buildSummary(all, lines),
    };
  }

  async summary(workspaceId: string): Promise<ItemSummary> {
    const items = await this.items.find({ where: { workspaceId, archivedAt: IsNull() } });
    const documents = await this.loadInvoices(workspaceId);

    return this.buildSummary(items, this.lines(documents));
  }

  async detail(workspaceId: string, itemId: string): Promise<ItemDetail> {
    const item = await this.requireOwned(workspaceId, itemId);
    const documents = await this.loadInvoices(workspaceId);
    const lines = this.lines(documents);

    const invoices = documents
      .filter((document) => document.items.some((line) => this.lineMatches(line, item)))
      .slice(0, 50)
      .map((document) => toInvoiceListRow(document));

    return { item: toItemRow(item, this.usage(lines, documents, item)), invoices };
  }

  async create(workspaceId: string, dto: ItemInputDto): Promise<ItemListRow> {
    const item = await this.items.save(
      this.items.create({
        id: randomUUID(),
        workspaceId,
        kind: (dto.kind ?? CatalogKind.SERVICE) as CatalogKind,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        unit: dto.unit?.trim() || 'unit',
        unitPrice: dto.unitPrice,
        taxRate: null,
        isActive: dto.isActive ?? true,
      }),
    );

    return toItemRow(item, EMPTY_USAGE);
  }

  async update(workspaceId: string, itemId: string, dto: ItemInputDto): Promise<ItemListRow> {
    const item = await this.requireOwned(workspaceId, itemId);

    Object.assign(item, {
      kind: (dto.kind ?? item.kind) as CatalogKind,
      name: dto.name.trim(),
      description: dto.description?.trim() || null,
      unit: dto.unit?.trim() || 'unit',
      unitPrice: dto.unitPrice,
      isActive: dto.isActive ?? item.isActive,
    });

    const saved = await this.items.save(item);
    const documents = await this.loadInvoices(workspaceId);

    return toItemRow(saved, this.usage(this.lines(documents), documents, saved));
  }

  async archive(workspaceId: string, itemId: string): Promise<void> {
    await this.requireOwned(workspaceId, itemId);

    await this.items.update({ id: itemId }, { archivedAt: new Date(), isActive: false });
  }

  private async requireOwned(workspaceId: string, itemId: string): Promise<CatalogItem> {
    const item = await this.items.findOne({
      where: { id: itemId, workspaceId, archivedAt: IsNull() },
    });

    if (!item) {
      throw new NotFoundException('Item not found.');
    }

    return item;
  }

  private async loadInvoices(workspaceId: string): Promise<DocumentWithUsage[]> {
    const documents = await this.documents.find({
      where: { workspaceId, documentType: DocumentType.INVOICE, deletedAt: IsNull() },
      relations: { items: true, customer: true },
      order: { issueDate: 'DESC', createdAt: 'DESC' },
    });

    return documents as DocumentWithUsage[];
  }

  private lines(documents: DocumentWithUsage[]): UsageLine[] {
    return documents.flatMap((document) =>
      document.items.map((line) => ({
        catalogItemId: line.catalogItemId,
        nameKey: normalize(line.itemName),
        documentId: document.id,
        issueDate: document.issueDate,
        quantity: Number(line.quantity),
        revenue: Number(line.lineTotal),
      })),
    );
  }

  private lineMatches(line: DocumentItem, item: CatalogItem): boolean {
    return line.catalogItemId === item.id || normalize(line.itemName) === normalize(item.name);
  }

  private usage(lines: UsageLine[], documents: DocumentWithUsage[], item: CatalogItem): ItemUsage {
    const matched = lines.filter((line) => matches(line, item));

    if (matched.length === 0) {
      return { ...EMPTY_USAGE };
    }

    const documentIds = new Set(matched.map((line) => line.documentId));

    return {
      invoiceCount: documentIds.size,
      quantitySold: matched.reduce((total, line) => total + line.quantity, 0),
      revenue: matched.reduce((total, line) => total + line.revenue, 0),
      lastUsedAt: documents.find((document) => documentIds.has(document.id))?.issueDate ?? null,
    };
  }

  private buildSummary(items: CatalogItem[], lines: UsageLine[]): ItemSummary {
    const keys = new Set<string>();
    for (const item of items) {
      keys.add(item.id);
      keys.add(`name:${normalize(item.name)}`);
    }

    const matched = lines.filter(
      (line) =>
        (line.catalogItemId !== null && keys.has(line.catalogItemId)) ||
        keys.has(`name:${line.nameKey}`),
    );

    const usedItems = items.filter((item) => this.usage(lines, [], item).invoiceCount > 0).length;

    return {
      totalItems: items.length,
      activeItems: items.filter((item) => item.isActive).length,
      usedItems,
      itemRevenue: matched.reduce((total, line) => total + line.revenue, 0),
      chart: monthlySeries(
        monthBuckets(),
        matched.map((line) => ({ issueDate: line.issueDate, amount: line.revenue })),
      ),
    };
  }
}
