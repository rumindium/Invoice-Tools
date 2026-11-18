import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer, Decimal } from '../decimal.transformer';
import { Customer } from './customer.entity';
import {
  DiscountType,
  DocumentStatus,
  DocumentType,
  RelationType,
  SequenceReset,
  TaxMode,
} from './enums';

@Entity({ name: 'documents' })
export class Document {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Index()
  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ name: 'customer_id', type: 'text', nullable: true })
  customerId!: string | null;

  @Column({ name: 'template_id', type: 'text', nullable: true })
  templateId!: string | null;

  @Column({ name: 'document_type', type: 'enum', enum: DocumentType, enumName: 'DocumentType' })
  documentType!: DocumentType;

  @Column({
    type: 'enum',
    enum: DocumentStatus,
    enumName: 'DocumentStatus',
    default: DocumentStatus.DRAFT,
  })
  status!: DocumentStatus;

  @Column({ name: 'document_number', type: 'text', nullable: true })
  documentNumber!: string | null;

  @Column({ name: 'sequence_period', type: 'text', nullable: true })
  sequencePeriod!: string | null;

  @Column({ name: 'issue_date', type: 'date' })
  issueDate!: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil!: string | null;

  @Column({ name: 'reference_number', type: 'text', nullable: true })
  referenceNumber!: string | null;

  @Column({ name: 'currency_code', type: 'char', length: 3 })
  currencyCode!: string;

  @Column({
    name: 'tax_mode',
    type: 'enum',
    enum: TaxMode,
    enumName: 'TaxMode',
    default: TaxMode.EXCLUSIVE,
  })
  taxMode!: TaxMode;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
    enumName: 'DiscountType',
    default: DiscountType.NONE,
  })
  discountType!: DiscountType;

  @Column({
    name: 'discount_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  discountRate!: Decimal | null;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  discountAmount!: Decimal;

  @Column({ type: 'numeric', precision: 19, scale: 4, default: 0, transformer: decimalTransformer })
  subtotal!: Decimal;

  @Column({
    name: 'discount_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  discountTotal!: Decimal;

  @Column({
    name: 'tax_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  taxTotal!: Decimal;

  @Column({
    name: 'shipping_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  shippingAmount!: Decimal;

  @Column({
    name: 'additional_charges',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  additionalCharges!: Decimal;

  @Column({
    name: 'charges_tax_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  chargesTaxRate!: Decimal | null;

  @Column({
    name: 'charges_tax',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  chargesTax!: Decimal;

  @Column({
    name: 'grand_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  grandTotal!: Decimal;

  @Column({
    name: 'amount_paid',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  amountPaid!: Decimal;

  @Column({
    name: 'balance_due',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  balanceDue!: Decimal;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'text', nullable: true })
  terms!: string | null;

  @Column({ name: 'issuer_snapshot', type: 'jsonb', nullable: true })
  issuerSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'customer_snapshot', type: 'jsonb', nullable: true })
  customerSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'template_snapshot', type: 'jsonb', nullable: true })
  templateSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'calculation_snapshot', type: 'jsonb', nullable: true })
  calculationSnapshot!: Record<string, unknown> | null;

  @Column({ name: 'pdf_asset_id', type: 'text', nullable: true })
  pdfAssetId!: string | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @Column({ name: 'issued_at', type: 'timestamptz', precision: 6, nullable: true })
  issuedAt!: Date | null;

  @Column({ name: 'voided_at', type: 'timestamptz', precision: 6, nullable: true })
  voidedAt!: Date | null;

  @Column({ name: 'void_reason', type: 'text', nullable: true })
  voidReason!: string | null;

  @Column({ name: 'created_by', type: 'text' })
  createdById!: string;

  @Column({ name: 'deleted_at', type: 'timestamptz', precision: 6, nullable: true })
  deletedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => DocumentItem, (item) => item.document)
  items!: DocumentItem[];

  @ManyToOne(() => Customer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;
}

@Entity({ name: 'document_items' })
export class DocumentItem {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'document_id', type: 'text' })
  documentId!: string;

  @Column({ type: 'int' })
  position!: number;

  @Column({ name: 'catalog_item_id', type: 'text', nullable: true })
  catalogItemId!: string | null;

  @Column({ name: 'item_name', type: 'text' })
  itemName!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 4, transformer: decimalTransformer })
  quantity!: Decimal;

  @Column({ type: 'text', default: 'unit' })
  unit!: string;

  @Column({
    name: 'unit_price',
    type: 'numeric',
    precision: 19,
    scale: 4,
    transformer: decimalTransformer,
  })
  unitPrice!: Decimal;

  @Column({
    name: 'discount_type',
    type: 'enum',
    enum: DiscountType,
    enumName: 'DiscountType',
    default: DiscountType.NONE,
  })
  discountType!: DiscountType;

  @Column({
    name: 'discount_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  discountRate!: Decimal | null;

  @Column({
    name: 'discount_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  discountAmount!: Decimal;

  @Column({
    name: 'tax_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  taxRate!: Decimal;

  @Column({
    name: 'tax_amount',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  taxAmount!: Decimal;

  @Column({
    name: 'line_subtotal',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  lineSubtotal!: Decimal;

  @Column({
    name: 'line_total',
    type: 'numeric',
    precision: 19,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  lineTotal!: Decimal;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Document, (document) => document.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;
}

@Entity({ name: 'document_number_sequences' })
@Unique('document_number_sequences_company_id_document_type_key', ['companyId', 'documentType'])
export class DocumentNumberSequence {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ name: 'document_type', type: 'enum', enum: DocumentType, enumName: 'DocumentType' })
  documentType!: DocumentType;

  @Column({ type: 'text' })
  pattern!: string;

  @Column({
    name: 'reset_policy',
    type: 'enum',
    enum: SequenceReset,
    enumName: 'SequenceReset',
    default: SequenceReset.YEARLY,
  })
  resetPolicy!: SequenceReset;

  @Column({ type: 'smallint', default: 4 })
  padding!: number;

  @Column({ name: 'period_key', type: 'text' })
  periodKey!: string;

  @Column({ name: 'next_value', type: 'int', default: 1 })
  nextValue!: number;

  @Column({ name: 'last_issued_at', type: 'timestamptz', precision: 6, nullable: true })
  lastIssuedAt!: Date | null;

  @Column({ type: 'int', default: 1 })
  version!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}

@Entity({ name: 'document_relations' })
@Unique('document_relations_target_document_id_relation_type_key', [
  'targetDocumentId',
  'relationType',
])
export class DocumentRelation {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'source_document_id', type: 'text' })
  sourceDocumentId!: string;

  @Column({ name: 'target_document_id', type: 'text' })
  targetDocumentId!: string;

  @Column({ name: 'relation_type', type: 'enum', enum: RelationType, enumName: 'RelationType' })
  relationType!: RelationType;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}

@Entity({ name: 'document_revisions' })
export class DocumentRevision {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'document_id', type: 'text' })
  documentId!: string;

  @Column({ name: 'revision_number', type: 'int' })
  revisionNumber!: number;

  @Column({ type: 'jsonb' })
  snapshot!: Record<string, unknown>;

  @Column({ type: 'text' })
  checksum!: string;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}
