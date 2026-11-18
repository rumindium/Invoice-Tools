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
import { Document } from './document.entity';
import { User } from './user.entity';

/** One contact attempt logged against an invoice: what was done, how, when, and what came back. */
@Entity({ name: 'invoice_follow_ups' })
export class InvoiceFollowUp {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Index()
  @Column({ name: 'document_id', type: 'text' })
  documentId!: string;

  @Column({ type: 'text' })
  activity!: string;

  @Column({ type: 'text' })
  method!: string;

  @Column({ name: 'follow_up_date', type: 'date' })
  followUpDate!: string;

  @Column({ type: 'text' })
  feedback!: string;

  @Column({ type: 'text', default: 'OPEN' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  evidence!: string | null;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdById!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;

  @ManyToOne(() => Document, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'document_id' })
  document!: Document;

  @ManyToOne(() => User, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;
}
