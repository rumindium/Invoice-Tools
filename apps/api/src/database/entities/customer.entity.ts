import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer, Decimal } from '../decimal.transformer';
import { CatalogKind, CustomerType } from './enums';

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({
    type: 'enum',
    enum: CustomerType,
    enumName: 'CustomerType',
    default: CustomerType.INDIVIDUAL,
  })
  type!: CustomerType;

  @Index()
  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'contact_person', type: 'text', nullable: true })
  contactPerson!: string | null;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ name: 'billing_address', type: 'jsonb', nullable: true })
  billingAddress!: Record<string, unknown> | null;

  @Column({ name: 'shipping_address', type: 'jsonb', nullable: true })
  shippingAddress!: Record<string, unknown> | null;

  @Column({ name: 'tax_id', type: 'text', nullable: true })
  taxId!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'default_payment_term_days', type: 'smallint', nullable: true })
  defaultPaymentTermDays!: number | null;

  @Column({ name: 'archived_at', type: 'timestamptz', precision: 6, nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}

@Entity({ name: 'catalog_items' })
export class CatalogItem {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({
    type: 'enum',
    enum: CatalogKind,
    enumName: 'CatalogKind',
    default: CatalogKind.SERVICE,
  })
  kind!: CatalogKind;

  @Index()
  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text', nullable: true })
  sku!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

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
    name: 'tax_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    nullable: true,
    transformer: decimalTransformer,
  })
  taxRate!: Decimal | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', precision: 6, nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}
