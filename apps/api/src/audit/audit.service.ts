import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AuditEvent } from '../database/entities';
import { ListAuditQueryDto } from './dto/audit-query.dto';

export interface AuditEntryInput {
  workspaceId?: string | null;
  actorId?: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown> | null;
  ip?: string | null;
}

export interface AuditEventView {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  actorName: string | null;
  actorEmail: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  at: string;
}

export interface AuditPage {
  events: AuditEventView[];
  total: number;
  page: number;
  pageSize: number;
}

function toView(event: AuditEvent): AuditEventView {
  return {
    id: String(event.id),
    action: event.action,
    targetType: event.targetType,
    targetId: event.targetId,
    actorName: event.actor?.displayName ?? null,
    actorEmail: event.actor?.email ?? null,
    metadata: event.metadata,
    ip: event.ip,
    at: event.createdAt.toISOString(),
  };
}

/**
 * Every change a user makes — sign-in, create, update, delete — is written here. Recording never
 * fails a request: a broken audit insert is logged and the operation still answers normally.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(@InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>) {}

  record(entry: AuditEntryInput): void {
    void this.events
      .save(
        this.events.create({
          workspaceId: entry.workspaceId ?? null,
          actorId: entry.actorId ?? null,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          metadata: entry.metadata ?? null,
          ip: entry.ip ?? null,
        }),
      )
      .catch((error: unknown) => {
        const reason = error instanceof Error ? error.message : String(error);
        this.logger.error(`Could not record ${entry.action}: ${reason}`);
      });
  }

  async list(workspaceId: string, query: ListAuditQueryDto): Promise<AuditPage> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const search = query.search?.trim();

    const builder = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.actor', 'actor')
      .where('event.workspaceId = :workspaceId', { workspaceId });

    if (query.targetType && query.targetType !== 'ALL') {
      builder.andWhere('event.targetType = :targetType', { targetType: query.targetType });
    }

    if (search) {
      builder.andWhere(
        new Brackets((sub) => {
          sub
            .where('event.action ILIKE :search', { search: `%${search}%` })
            .orWhere('event.metadata ->> :nameKey ILIKE :search', { nameKey: 'name' })
            .orWhere('event.metadata ->> :numberKey ILIKE :search', { numberKey: 'number' });
        }),
      );
    }

    builder
      .orderBy('event.createdAt', 'DESC')
      .addOrderBy('event.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [events, total] = await builder.getManyAndCount();

    return { events: events.map(toView), total, page, pageSize };
  }
}
