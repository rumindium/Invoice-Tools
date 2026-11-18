import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { JobStatus } from './enums';
import { User } from './user.entity';

@Entity({ name: 'background_jobs' })
export class BackgroundJob {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  kind!: string;

  @Column({ type: 'jsonb' })
  payload!: Record<string, unknown>;

  @Column({ type: 'enum', enum: JobStatus, enumName: 'JobStatus', default: JobStatus.QUEUED })
  status!: JobStatus;

  @Column({ type: 'int', default: 0 })
  attempts!: number;

  @Column({ name: 'max_attempts', type: 'int', default: 3 })
  maxAttempts!: number;

  @Column({ name: 'run_at', type: 'timestamptz', precision: 6, default: () => 'now()' })
  runAt!: Date;

  @Column({ name: 'locked_at', type: 'timestamptz', precision: 6, nullable: true })
  lockedAt!: Date | null;

  @Column({ name: 'locked_by', type: 'text', nullable: true })
  lockedBy!: string | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @Column({ name: 'finished_at', type: 'timestamptz', precision: 6, nullable: true })
  finishedAt!: Date | null;
}

@Entity({ name: 'audit_events' })
export class AuditEvent {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id!: string;

  @Column({ name: 'workspace_id', type: 'text', nullable: true })
  workspaceId!: string | null;

  @Column({ name: 'actor_id', type: 'text', nullable: true })
  actorId!: string | null;

  @Column({ type: 'text' })
  action!: string;

  @Column({ name: 'target_type', type: 'text' })
  targetType!: string;

  @Column({ name: 'target_id', type: 'text' })
  targetId!: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'actor_id' })
  actor!: User | null;
}

@Entity({ name: 'idempotency_keys' })
@Unique('idempotency_keys_user_id_route_key_key', ['userId', 'route', 'key'])
export class IdempotencyKey {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'user_id', type: 'text' })
  userId!: string;

  @Column({ type: 'text' })
  route!: string;

  @Column({ type: 'text' })
  key!: string;

  @Column({ name: 'request_hash', type: 'bytea' })
  requestHash!: Buffer;

  @Column({ name: 'status_code', type: 'int' })
  statusCode!: number;

  @Column({ name: 'response_body', type: 'jsonb' })
  responseBody!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @Column({ name: 'expires_at', type: 'timestamptz', precision: 6 })
  expiresAt!: Date;
}
