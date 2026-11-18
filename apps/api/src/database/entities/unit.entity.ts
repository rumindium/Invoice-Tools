import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

/** A unit a workspace bills in beyond the built-in list (pcs, box, month, …). */
@Entity({ name: 'units_of_measure' })
export class UnitOfMeasure {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Index()
  @Column({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @Column({ type: 'text' })
  name!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;
}
