import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Customer } from './customer.entity';
import { Document } from './document.entity';
import { User } from './user.entity';

/** Feedback a customer gave through any channel, and how it was handled. */
@Entity({ name: 'customer_feedback' })
export class CustomerFeedback {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ name: 'customer_id', type: 'text', nullable: true })
  customerId!: string | null;

  /** Name at the time of logging (also used when the customer is not in master data). */
  @Column({ name: 'customer_name', type: 'text' })
  customerName!: string;

  @Column({ name: 'contact_name', type: 'text', nullable: true })
  contactName!: string | null;

  @Column({ type: 'text' })
  source!: string;

  /** Free text for the channel, e.g. "Tokopedia review" when the source is OTHER. */
  @Column({ name: 'source_detail', type: 'text', nullable: true })
  sourceDetail!: string | null;

  @Column({ type: 'text' })
  category!: string;

  @Column({ type: 'smallint', nullable: true })
  rating!: number | null;

  @Column({ type: 'text' })
  subject!: string;

  @Column({ type: 'text' })
  message!: string;

  @Column({ name: 'received_on', type: 'date' })
  receivedOn!: string;

  @Column({ type: 'text', default: 'NEW' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  resolution!: string | null;

  @Column({ name: 'resolved_at', type: 'timestamptz', precision: 6, nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'related_document_id', type: 'text', nullable: true })
  relatedDocumentId!: string | null;

  @Column({ type: 'text', nullable: true })
  evidence!: string | null;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => Customer, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @ManyToOne(() => Document, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'related_document_id' })
  relatedDocument!: Document | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
}
