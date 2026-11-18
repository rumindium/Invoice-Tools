import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { decimalTransformer, Decimal } from '../decimal.transformer';
import { QuotationLabel, TaxMode } from './enums';

@Entity({ name: 'companies' })
export class Company {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ name: 'legal_name', type: 'text' })
  legalName!: string;

  @Column({ name: 'display_name', type: 'text', nullable: true })
  displayName!: string | null;

  @Column({ name: 'logo_asset_id', type: 'text', nullable: true })
  logoAssetId!: string | null;

  @Column({ name: 'logo_data_url', type: 'text', nullable: true })
  logoDataUrl!: string | null;

  @Column({ name: 'address_line1', type: 'text', nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line2', type: 'text', nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'text', nullable: true })
  city!: string | null;

  @Column({ type: 'text', nullable: true })
  province!: string | null;

  @Column({ name: 'postal_code', type: 'text', nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, default: 'ID' })
  countryCode!: string;

  @Column({ type: 'text', nullable: true })
  email!: string | null;

  @Column({ type: 'text', nullable: true })
  phone!: string | null;

  @Column({ type: 'text', nullable: true })
  website!: string | null;

  @Column({ name: 'tax_id', type: 'text', nullable: true })
  taxId!: string | null;

  @Column({ name: 'tax_label', type: 'text', default: 'Tax ID' })
  taxLabel!: string;

  @Column({ name: 'bank_details', type: 'jsonb', default: () => "'[]'" })
  bankDetails!: unknown;

  @Column({ name: 'default_currency', type: 'char', length: 3, default: 'IDR' })
  defaultCurrency!: string;

  @Column({ name: 'default_locale', type: 'text', default: 'id-ID' })
  defaultLocale!: string;

  @Column({ name: 'time_zone', type: 'text', default: 'Asia/Jakarta' })
  timeZone!: string;

  @Column({
    name: 'quotation_label',
    type: 'enum',
    enum: QuotationLabel,
    enumName: 'QuotationLabel',
    default: QuotationLabel.BOTH,
  })
  quotationLabel!: QuotationLabel;

  @Column({
    name: 'default_tax_rate',
    type: 'numeric',
    precision: 7,
    scale: 4,
    default: 0,
    transformer: decimalTransformer,
  })
  defaultTaxRate!: Decimal;

  @Column({
    name: 'default_tax_mode',
    type: 'enum',
    enum: TaxMode,
    enumName: 'TaxMode',
    default: TaxMode.EXCLUSIVE,
  })
  defaultTaxMode!: TaxMode;

  @Column({ name: 'default_payment_term_days', type: 'smallint', default: 14 })
  defaultPaymentTermDays!: number;

  @Column({ name: 'footer_text', type: 'text', nullable: true })
  footerText!: string | null;

  @Column({ name: 'signatory_name', type: 'text', nullable: true })
  signatoryName!: string | null;

  @Column({ name: 'signatory_title', type: 'text', nullable: true })
  signatoryTitle!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', precision: 6, nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}

@Entity({ name: 'document_templates' })
export class DocumentTemplate {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'company_id', type: 'text', nullable: true })
  companyId!: string | null;

  @Column({ type: 'text' })
  name!: string;

  @Column({ type: 'text' })
  slug!: string;

  @Column({ type: 'text', default: 'classic' })
  layout!: string;

  @Column({ name: 'paper_size', type: 'text', default: 'A4' })
  paperSize!: string;

  @Column({ type: 'text', default: 'portrait' })
  orientation!: string;

  @Column({ name: 'accent_color', type: 'text', default: '#1F5F5B' })
  accentColor!: string;

  @Column({ name: 'logo_position', type: 'text', default: 'left' })
  logoPosition!: string;

  @Column({ name: 'show_bank_details', type: 'boolean', default: true })
  showBankDetails!: boolean;

  @Column({ name: 'show_signature', type: 'boolean', default: true })
  showSignature!: boolean;

  @Column({ name: 'show_prices_on_delivery', type: 'boolean', default: false })
  showPricesOnDelivery!: boolean;

  @Column({ name: 'footer_text', type: 'text', nullable: true })
  footerText!: string | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'archived_at', type: 'timestamptz', precision: 6, nullable: true })
  archivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}
