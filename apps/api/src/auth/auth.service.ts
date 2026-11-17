import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma, WorkspaceRole } from '@prisma/client';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
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

function hashToken(token: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(createHash('sha256').update(token).digest());
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async register(dto: RegisterDto, meta: SessionMeta): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    const existing = await this.prisma.user.findUnique({ where: { email } });

    if (existing) {
      throw new ConflictException('Email sudah terdaftar.');
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();
    const workspaceId = randomUUID();

    try {
      const { user, workspace } = await this.prisma.$transaction(async (tx) => {
        const createdUser = await tx.user.create({
          data: {
            id: userId,
            subject: `local:${userId}`,
            email,
            displayName,
            passwordHash,
          },
        });

        const createdWorkspace = await tx.workspace.create({
          data: {
            id: workspaceId,
            name: `Workspace ${displayName}`,
            ownerId: userId,
          },
        });

        await tx.workspaceMember.create({
          data: {
            workspaceId,
            userId,
            role: WorkspaceRole.OWNER,
          },
        });

        return { user: createdUser, workspace: createdWorkspace };
      });

      const session = await this.createSession(user.id, meta);
      return {
        user: toUserView(user),
        workspace: toWorkspaceView(workspace),
        ...session,
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Email sudah terdaftar.');
      }
      throw error;
    }
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.prisma.user.findUnique({ where: { email } });

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
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(token) },
      include: { user: true },
    });

    if (!session || session.expiresAt.getTime() <= Date.now()) {
      if (session) {
        await this.prisma.session.delete({ where: { id: session.id } }).catch(() => undefined);
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
    await this.prisma.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  }

  private async createSession(
    userId: string,
    meta: SessionMeta,
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS);

    await this.prisma.session.create({
      data: {
        id: randomUUID(),
        userId,
        tokenHash: hashToken(token),
        csrfTokenHash: Uint8Array.from(randomBytes(32)),
        ip: meta.ip,
        userAgent: meta.userAgent?.slice(0, 500),
        expiresAt,
      },
    });

    return { token, expiresAt };
  }

  private async ensureWorkspace(userId: string, displayName: string): Promise<WorkspaceView> {
    const membership = await this.prisma.workspaceMember.findFirst({
      where: { userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });

    if (membership) {
      return toWorkspaceView(membership.workspace);
    }

    const workspace = await this.prisma.$transaction(async (tx) => {
      const created = await tx.workspace.create({
        data: {
          id: randomUUID(),
          name: `Workspace ${displayName}`,
          ownerId: userId,
        },
      });

      await tx.workspaceMember.create({
        data: {
          workspaceId: created.id,
          userId,
          role: WorkspaceRole.OWNER,
        },
      });

      return created;
    });

    return toWorkspaceView(workspace);
  }
}
