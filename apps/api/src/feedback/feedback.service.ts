import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Brackets, In, IsNull, Repository } from 'typeorm';
import { AuditEvent, Customer, CustomerFeedback, Document } from '../database/entities';
import { DocumentType } from '../database/entities/enums';
import { documentHistory, toDateOnly } from '../documents/document-support';
import {
  FeedbackInputDto,
  FeedbackStatusDto,
  ListFeedbackQueryDto,
  RelatedDocumentsQueryDto,
} from './dto/feedback.dto';
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_SOURCES,
  FEEDBACK_STATUSES,
  canChangeFeedbackStatus,
} from './feedback-rules';
import {
  FeedbackListRow,
  FeedbackSummary,
  FeedbackView,
  FeedbackWithRelations,
  RelatedDocumentView,
  toFeedbackListRow,
  toFeedbackView,
  toRelatedDocumentView,
} from './views';

const AUDIT_TARGET = 'feedback';
const LINKABLE_TYPES = [DocumentType.QUOTATION, DocumentType.GOODS_RECEIPT, DocumentType.INVOICE];

const clean = (value: string | undefined | null): string | null => value?.trim() || null;

function isoDay(offset = 0): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

/** Feedback customers give by email, phone, WhatsApp or any other channel, and its handling. */
@Injectable()
export class FeedbackService {
  constructor(
    @InjectRepository(CustomerFeedback) private readonly feedback: Repository<CustomerFeedback>,
    @InjectRepository(Customer) private readonly customers: Repository<Customer>,
    @InjectRepository(Document) private readonly documents: Repository<Document>,
    @InjectRepository(AuditEvent) private readonly audit: Repository<AuditEvent>,
  ) {}

  async list(
    workspaceId: string,
    query: ListFeedbackQueryDto,
  ): Promise<{ items: FeedbackListRow[]; total: number; page: number; pageSize: number }> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const search = query.search?.trim();

    const builder = this.feedback
      .createQueryBuilder('feedback')
      .leftJoinAndSelect('feedback.relatedDocument', 'document')
      .where('feedback.workspaceId = :workspaceId', { workspaceId });

    if (query.status === 'OPEN') {
      builder.andWhere('feedback.status IN (:...open)', { open: ['NEW', 'IN_PROGRESS'] });
    } else if (query.status && query.status !== 'ALL') {
      builder.andWhere('feedback.status = :status', { status: query.status });
    }
    if (query.source && query.source !== 'ALL') {
      builder.andWhere('feedback.source = :source', { source: query.source });
    }
    if (query.category && query.category !== 'ALL') {
      builder.andWhere('feedback.category = :category', { category: query.category });
    }
    if (query.customerId) {
      builder.andWhere('feedback.customerId = :customerId', { customerId: query.customerId });
    }
    if (search) {
      builder.andWhere(
        new Brackets((sub) => {
          for (const column of [
            'subject',
            'message',
            'customerName',
            'contactName',
            'sourceDetail',
          ]) {
            sub.orWhere(`feedback.${column} ILIKE :search`, { search: `%${search}%` });
          }
        }),
      );
    }

    builder
      .orderBy('feedback.receivedOn', 'DESC')
      .addOrderBy('feedback.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [rows, total] = await builder.getManyAndCount();
    return {
      items: (rows as FeedbackWithRelations[]).map(toFeedbackListRow),
      total,
      page,
      pageSize,
    };
  }

  async summary(workspaceId: string): Promise<FeedbackSummary> {
    const rows = await this.feedback.find({
      where: { workspaceId },
      select: {
        id: true,
        status: true,
        source: true,
        category: true,
        rating: true,
        receivedOn: true,
      },
    });
    const count = (keys: readonly string[], pick: (row: CustomerFeedback) => string) =>
      Object.fromEntries(keys.map((key) => [key, rows.filter((row) => pick(row) === key).length]));
    const rated = rows.filter((row) => row.rating !== null);
    const month = isoDay().slice(0, 7);

    return {
      total: rows.length,
      open: rows.filter((row) => row.status !== 'RESOLVED').length,
      byStatus: count(FEEDBACK_STATUSES, (row) => row.status),
      bySource: count(FEEDBACK_SOURCES, (row) => row.source),
      byCategory: count(FEEDBACK_CATEGORIES, (row) => row.category),
      ratedCount: rated.length,
      averageRating:
        rated.length > 0
          ? Math.round((rated.reduce((total, row) => total + row.rating!, 0) / rated.length) * 10) /
            10
          : null,
      thisMonth: rows.filter((row) => row.receivedOn.slice(0, 7) === month).length,
    };
  }

  /** Quotations, goods receipts and invoices a feedback can refer to, newest first. */
  async relatedDocuments(
    workspaceId: string,
    query: RelatedDocumentsQueryDto,
  ): Promise<RelatedDocumentView[]> {
    const documents = await this.documents.find({
      where: {
        workspaceId,
        deletedAt: IsNull(),
        documentType: In(LINKABLE_TYPES),
        ...(query.customerId ? { customerId: query.customerId } : {}),
      },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return documents.map((document) => toRelatedDocumentView(document)!);
  }

  async get(workspaceId: string, feedbackId: string): Promise<FeedbackView> {
    const feedback = await this.load(workspaceId, feedbackId);
    const history = await documentHistory(this.audit, AUDIT_TARGET, feedbackId);
    return toFeedbackView(feedback, history);
  }

  async create(workspaceId: string, userId: string, dto: FeedbackInputDto): Promise<FeedbackView> {
    const values = await this.validate(workspaceId, dto);
    const saved = await this.feedback.save(
      this.feedback.create({
        id: randomUUID(),
        workspaceId,
        ...values,
        status: 'NEW',
        resolution: null,
        resolvedAt: null,
        createdById: userId,
      }),
    );

    await this.record(workspaceId, userId, saved, 'feedback.created', {
      from: null,
      to: 'NEW',
      reason: null,
    });
    return this.get(workspaceId, saved.id);
  }

  async update(
    workspaceId: string,
    userId: string,
    feedbackId: string,
    dto: FeedbackInputDto,
  ): Promise<FeedbackView> {
    const feedback = await this.load(workspaceId, feedbackId);
    const values = await this.validate(workspaceId, dto);

    await this.feedback.update({ id: feedbackId }, values);
    await this.record(workspaceId, userId, { ...feedback, ...values }, 'feedback.updated', {});
    return this.get(workspaceId, feedbackId);
  }

  async changeStatus(
    workspaceId: string,
    userId: string,
    feedbackId: string,
    dto: FeedbackStatusDto,
  ): Promise<FeedbackView> {
    const feedback = await this.load(workspaceId, feedbackId);

    if (!canChangeFeedbackStatus(feedback.status, dto.status)) {
      throw new ConflictException(
        `Feedback that is ${feedback.status.toLowerCase().replace('_', ' ')} cannot move to ${dto.status.toLowerCase().replace('_', ' ')}.`,
      );
    }

    const resolution = clean(dto.resolution);
    if (dto.status === 'RESOLVED' && (!resolution || resolution.length < 3)) {
      throw new BadRequestException('Describe how the feedback was resolved.');
    }

    await this.feedback.update(
      { id: feedbackId },
      dto.status === 'RESOLVED'
        ? { status: 'RESOLVED', resolution, resolvedAt: new Date() }
        : { status: dto.status, resolution: null, resolvedAt: null },
    );
    await this.record(workspaceId, userId, feedback, 'feedback.status_changed', {
      from: feedback.status,
      to: dto.status,
      reason: resolution,
    });
    return this.get(workspaceId, feedbackId);
  }

  async remove(workspaceId: string, userId: string, feedbackId: string): Promise<void> {
    const feedback = await this.load(workspaceId, feedbackId);
    await this.feedback.delete({ id: feedbackId });
    await this.record(workspaceId, userId, feedback, 'feedback.deleted', {
      status: feedback.status,
    });
  }

  private async validate(workspaceId: string, dto: FeedbackInputDto) {
    const sourceDetail = clean(dto.sourceDetail);
    if (dto.source === 'OTHER' && !sourceDetail) {
      throw new BadRequestException('Describe the channel when the source is "Other".');
    }

    const receivedOn = toDateOnly(dto.receivedOn);
    // One day of slack: the browser's "today" can be ahead of the server's UTC date.
    if (receivedOn > isoDay(1)) {
      throw new BadRequestException('The received date cannot be in the future.');
    }

    let customerId: string | null = null;
    const requestedCustomer = dto.customerId?.trim();
    if (requestedCustomer) {
      const customer = await this.customers.findOne({
        where: { id: requestedCustomer, workspaceId },
      });
      if (!customer) {
        throw new NotFoundException('Customer not found.');
      }
      customerId = customer.id;
    }

    let relatedDocumentId: string | null = null;
    const requestedDocument = dto.relatedDocumentId?.trim();
    if (requestedDocument) {
      const document = await this.documents.findOne({
        where: {
          id: requestedDocument,
          workspaceId,
          deletedAt: IsNull(),
          documentType: In(LINKABLE_TYPES),
        },
      });
      if (!document) {
        throw new NotFoundException('Related document not found.');
      }
      relatedDocumentId = document.id;
    }

    return {
      customerId,
      customerName: dto.customerName.trim(),
      contactName: clean(dto.contactName),
      source: dto.source,
      sourceDetail,
      category: dto.category,
      rating: dto.rating ?? null,
      subject: dto.subject.trim(),
      message: dto.message.trim(),
      receivedOn,
      relatedDocumentId,
      evidence: clean(dto.evidence),
    };
  }

  private async record(
    workspaceId: string,
    userId: string,
    feedback: Pick<CustomerFeedback, 'id' | 'subject' | 'customerName' | 'source'>,
    action: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.audit.save(
      this.audit.create({
        workspaceId,
        actorId: userId,
        action,
        targetType: AUDIT_TARGET,
        targetId: feedback.id,
        metadata: {
          name: feedback.subject,
          customer: feedback.customerName,
          source: feedback.source,
          ...metadata,
        },
        ip: null,
      }),
    );
  }

  private async load(workspaceId: string, feedbackId: string): Promise<FeedbackWithRelations> {
    const feedback = await this.feedback.findOne({
      where: { id: feedbackId, workspaceId },
      relations: { relatedDocument: true, createdBy: true, customer: true },
    });

    if (!feedback) {
      throw new NotFoundException('Feedback not found.');
    }
    return feedback as FeedbackWithRelations;
  }
}
