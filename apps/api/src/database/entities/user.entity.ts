import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text', unique: true })
  subject!: string;

  @Column({ type: 'citext', unique: true })
  email!: string;

  @Column({ name: 'display_name', type: 'text' })
  displayName!: string;

  @Column({ name: 'password_hash', type: 'text', nullable: true })
  passwordHash!: string | null;

  @Column({ name: 'email_verified_at', type: 'timestamptz', precision: 6, nullable: true })
  emailVerifiedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', precision: 6, nullable: true })
  lastSeenAt!: Date | null;
}

@Entity({ name: 'sessions' })
export class Session {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'text' })
  userId!: string;

  @Column({ name: 'token_hash', type: 'bytea', unique: true })
  tokenHash!: Buffer;

  @Column({ name: 'csrf_token_hash', type: 'bytea' })
  csrfTokenHash!: Buffer;

  @Column({ type: 'inet', nullable: true })
  ip!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @Column({ name: 'last_seen_at', type: 'timestamptz', precision: 6, default: () => 'now()' })
  lastSeenAt!: Date;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz', precision: 6 })
  expiresAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}

export type AuthTokenKind = 'EMAIL_VERIFY' | 'PASSWORD_RESET';

@Entity({ name: 'auth_tokens' })
export class AuthToken {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'user_id', type: 'text' })
  userId!: string;

  @Column({ type: 'text' })
  kind!: AuthTokenKind;

  @Column({ name: 'token_hash', type: 'bytea', unique: true })
  tokenHash!: Buffer;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', precision: 6, nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
