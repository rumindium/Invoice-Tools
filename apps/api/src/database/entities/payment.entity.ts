import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, Unique } from 'typeorm';
import { decimalTransformer, Decimal } from '../decimal.transformer';
import { PaymentMethod, PaymentStatus } from './enums';

@Entity({ name: 'payments' })
export class Payment {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Index()
  @Column({ name: 'invoice_id', type: 'text' })
  invoiceId!: string;

  @Column({ name: 'receipt_document_id', type: 'text', unique: true })
  receiptDocumentId!: string;

  @Index()
  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: string;

  @Column({ type: 'numeric', precision: 19, scale: 4, transformer: decimalTransformer })
  amount!: Decimal;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @Column({
    type: 'enum',
    enum: PaymentMethod,
    enumName: 'PaymentMethod',
    default: PaymentMethod.BANK_TRANSFER,
  })
  method!: PaymentMethod;

  @Column({ type: 'text', nullable: true })
  reference!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    type: 'enum',
    enum: PaymentStatus,
    enumName: 'PaymentStatus',
    default: PaymentStatus.RECORDED,
  })
  status!: PaymentStatus;

  @Column({ name: 'recorded_by', type: 'text' })
  recordedById!: string;

  @Column({ name: 'voided_at', type: 'timestamptz', precision: 6, nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'voided_by', type: 'text', nullable: true })
  voidedById!: string | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}

@Entity({ name: 'assets' })
@Unique('assets_workspace_id_sha256_key', ['workspaceId', 'sha256'])
export class Asset {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ type: 'bytea' })
  sha256!: Buffer;

  @Column({ type: 'text' })
  mime!: string;

  @Column({ type: 'int' })
  bytes!: number;

  @Column({ type: 'int', nullable: true })
  width!: number | null;

  @Column({ type: 'int', nullable: true })
  height!: number | null;

  @Column({ name: 'storage_key', type: 'text' })
  storageKey!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}

@Entity({ name: 'print_tokens' })
export class PrintToken {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'token_hash', type: 'bytea', unique: true })
  tokenHash!: Buffer;

  @Column({ name: 'document_id', type: 'text' })
  documentId!: string;

  @Column({ name: 'revision_number', type: 'int', default: 0 })
  revisionNumber!: number;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @Index()
  @Column({ name: 'expires_at', type: 'timestamptz', precision: 6 })
  expiresAt!: Date;

  @Column({ name: 'revoked_at', type: 'timestamptz', precision: 6, nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}
