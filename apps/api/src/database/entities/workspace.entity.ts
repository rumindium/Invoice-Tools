import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WorkspaceRole } from './enums';
import { User } from './user.entity';

@Entity({ name: 'workspaces' })
export class Workspace {
  @PrimaryColumn({ type: 'text' })
  id!: string;

  @Column({ type: 'text' })
  name!: string;

  @Column({ name: 'owner_id', type: 'text' })
  ownerId!: string;

  @Column({ name: 'auth_tenant_id', type: 'text', nullable: true, unique: true })
  authTenantId!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 6 })
  updatedAt!: Date;
}

@Entity({ name: 'workspace_members' })
export class WorkspaceMember {
  @PrimaryColumn({ name: 'workspace_id', type: 'text' })
  workspaceId!: string;

  @PrimaryColumn({ name: 'user_id', type: 'text' })
  userId!: string;

  @Column({
    type: 'enum',
    enum: WorkspaceRole,
    enumName: 'WorkspaceRole',
    default: WorkspaceRole.MEMBER,
  })
  role!: WorkspaceRole;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 6 })
  createdAt!: Date;

  @ManyToOne(() => Workspace, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'workspace_id' })
  workspace!: Workspace;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;
}
