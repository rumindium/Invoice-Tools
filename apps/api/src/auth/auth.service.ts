import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { Session, User, Workspace, WorkspaceMember } from '../database/entities';
import { WorkspaceRole } from '../database/entities/enums';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';
import { SESSION_TTL_MS } from './session';

export interface AuthUserView {
  id: string;
  email: string;
  displayName: string;
}

export interface WorkspaceView {
  id: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUserView;
  workspace: WorkspaceView;
}

export interface SessionMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedSession extends AuthResponse {
  token: string;
  expiresAt: Date;
}

function toUserView(user: { id: string; email: string; displayName: string }): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
  };
}

function toWorkspaceView(workspace: { id: string; name: string }): WorkspaceView {
  return { id: workspace.id, name: workspace.name };
}

function hashToken(token: string): Buffer {
  return createHash('sha256').update(token).digest();
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === '23505'
  );
}

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly members: Repository<WorkspaceMember>,
  ) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    const existing = await this.users.findOne({ where: { email } });

    if (existing) {
      throw new ConflictException('Email sudah terdaftar.');
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    try {
      const { user, workspace } = await this.members.manager.transaction(async (manager) => {
        const createdUser = await manager.getRepository(User).save(
          manager.getRepository(User).create({
            id: userId,
            subject: `local:${userId}`,
            email,
            displayName,
            passwordHash,
          }),
        );

        const createdWorkspace = await manager.getRepository(Workspace).save(
          manager.getRepository(Workspace).create({
            id: randomUUID(),
            name: `Workspace ${displayName}`,
            ownerId: userId,
          }),
        );

        await manager.getRepository(WorkspaceMember).save(
          manager.getRepository(WorkspaceMember).create({
            workspaceId: createdWorkspace.id,
            userId,
            role: WorkspaceRole.OWNER,
          }),
        );

        return { user: createdUser, workspace: createdWorkspace };
      });

      const session = await this.createSession(user.id, meta);
      return {
        user: toUserView(user),
        workspace: toWorkspaceView(workspace),
        ...session,
      };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email sudah terdaftar.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });

    if (!user?.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    const workspace = await this.ensureWorkspace(user.id, user.displayName);
    const session = await this.createSession(user.id, meta);

    return {
      user: toUserView(user),
      workspace,
      ...session,
    };
  }

  async getSession(token: string): Promise<AuthResponse | null> {
    const session = await this.sessions.findOne({
      where: { tokenHash: hashToken(token) },
      relations: { user: true },
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        await this.sessions.delete({ id: session.id }).catch(() => undefined);
      }
      return null;
    }

    const workspace = await this.ensureWorkspace(session.user.id, session.user.displayName);
    return {
      user: toUserView(session.user),
      workspace,
    };
  }

  async logout(token: string): Promise<void> {
    await this.sessions.delete({ tokenHash: hashToken(token) });
  }

  private async createSession(
    userId: string,
    meta: SessionMeta,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.sessions.save(
      this.sessions.create({
        id: randomUUID(),
        userId,
        tokenHash: hashToken(token),
        csrfTokenHash: randomBytes(32),
        ip: meta.ip ?? null,
        userAgent: meta.userAgent?.slice(0, 500) ?? null,
        expiresAt,
      }),
    );

    return { token, expiresAt };
  }

  private async ensureWorkspace(userId: string, displayName: string): Promise<WorkspaceView> {
    const membership = await this.members.findOne({
      where: { userId },
      relations: { workspace: true },
      order: { createdAt: 'ASC' },
    });

    if (membership) {
      return toWorkspaceView(membership.workspace);
    }

    const workspace = await this.workspaces.manager.transaction(async (manager) => {
      const created = await manager.getRepository(Workspace).save(
        manager.getRepository(Workspace).create({
          id: randomUUID(),
          name: `Workspace ${displayName}`,
          ownerId: userId,
        }),
      );

      await manager.getRepository(WorkspaceMember).save(
        manager.getRepository(WorkspaceMember).create({
          workspaceId: created.id,
          userId,
          role: WorkspaceRole.OWNER,
        }),
      );

      return created;
    });

    return toWorkspaceView(workspace);
  }
}
