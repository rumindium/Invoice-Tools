import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { decimalTransformer, Decimal } from '../decimal.transformer';
import { DocumentType } from './enums';

/**
 * A payment termin plan: one source split into several documents of `documentType`, each
 * carrying a percentage of it. Sources: an accepted quotation (goods receipts), a received
 * goods receipt (invoices), or none for invoices typed in the generator (`basePayload`).
 */
@Entity({ name: 'termin_plans' })
export class TerminPlan {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ name: 'company_id', type: 'text' })
  companyId!: string;

  @Column({ name: 'document_type', type: 'enum', enum: DocumentType, enumName: 'DocumentType' })
  documentType!: DocumentType;

  @Column({ name: 'source_document_id', type: 'text', nullable: true })
  sourceDocumentId!: string | null;

  /** Invoices from the generator: the full invoice as typed, split per termin. */
  @Column({ name: 'base_payload', type: 'jsonb', nullable: true })
  basePayload!: Record<string, unknown> | null;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;

  @OneToMany(() => TerminPlanItem, (item) => item.plan)
  items!: TerminPlanItem[];
}

@Entity({ name: 'termin_plan_items' })
export class TerminPlanItem {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ name: 'plan_id', type: 'text' })
  planId!: string;

  /** 1-based termin number. */
  @Column({ type: 'int' })
  sequence!: number;

  @Column({ type: 'numeric', precision: 7, scale: 4, transformer: decimalTransformer })
  percentage!: Decimal;

  @ManyToOne(() => TerminPlan, (plan) => plan.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'plan_id' })
  plan!: TerminPlan;
}
