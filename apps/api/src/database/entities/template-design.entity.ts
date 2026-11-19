import { Column, CreateDateColumn, Entity, Index, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { DocumentType } from './enums';

/** A design made in the template builder (one page of positioned elements). */
@Entity({ name: 'template_designs' })
export class TemplateDesign {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ type: 'text' })
  name!: string;

  /** The kind of document the design is made for. */
  @Column({ type: 'enum', enum: DocumentType, enumName: 'DocumentType' })
  kind!: DocumentType;

  @Column({ name: 'accent_color', type: 'text' })
  accentColor!: string;

  @Column({ type: 'jsonb' })
  page!: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  elements!: unknown[];

  /** Bumped on every save; saves must name the revision they started from. */
  @Column({ type: 'integer', default: 1 })
  revision!: number;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy!: string | null;

  /** Set for designs beyond the one-per-document-type limit (hidden, kept for documents). */
  @Column({ name: 'archived_at', type: 'timestamptz', precision: 6, nullable: true })
  archivedAt!: Date | null;

  @Column({ name: 'updated_by', type: 'text', nullable: true })
  updatedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}

/** An uploaded image or a saved signature in the builder's library. */
@Entity({ name: 'template_assets' })
export class TemplateAsset {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ type: 'text' })
  kind!: 'upload' | 'signature';

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'data_url', type: 'text' })
  dataUrl!: string;

  @Column({ name: 'byte_size', type: 'integer' })
  byteSize!: number;

  @Column({ name: 'created_by', type: 'text', nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}
