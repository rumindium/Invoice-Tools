import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { loadEnv } from '../config/env';
import { AuthToken, Session, User, Workspace, WorkspaceMember } from '../database/entities';
import type { AuthTokenKind } from '../database/entities/user.entity';
import { WorkspaceRole } from '../database/entities/enums';
import { MailService } from '../mail/mail.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { hashPassword, verifyPassword } from './password';
import { SESSION_TTL_MS } from './session';

export const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
export const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000;

const TOKEN_RESEND_COOLDOWN_MS = 60 * 1000;
const INVALID_LINK_MESSAGE = 'Tautan tidak valid atau sudah kedaluwarsa.';
const VERIFICATION_REQUIRED_MESSAGE =
  'Email belum diverifikasi. Cek kotak masuk untuk tautan aktivasi.';

export interface AuthUserView {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  createdAt: string;
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

export interface PendingRegistration {
  email: string;
  verificationRequired: true;
}

function toUserView(user: {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: Date | null;
  createdAt: Date;
}): AuthUserView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    emailVerifiedAt: user.emailVerifiedAt ? user.emailVerifiedAt.toISOString() : null,
    createdAt: user.createdAt.toISOString(),
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
  private readonly logger = new Logger(AuthService.name);
  private readonly env = loadEnv();
  private readonly lastTokenSentAt = new Map<string, number>();

  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessions: Repository<Session>,
    @InjectRepository(AuthToken) private readonly tokens: Repository<AuthToken>,
    @InjectRepository(Workspace) private readonly workspaces: Repository<Workspace>,
    @InjectRepository(WorkspaceMember) private readonly members: Repository<WorkspaceMember>,
    private readonly mail: MailService,
  ) {}

  /**
   * Creates the account unverified and emails an activation link. No session is
   * issued: the user only gets one once the link is opened.
   */
  async register(dto: RegisterDto): Promise<PendingRegistration> {
    const email = dto.email.trim().toLowerCase();
    const displayName = dto.displayName.trim();
    const existing = await this.users.findOne({ where: { email } });

    if (existing) {
      throw new ConflictException('Email sudah terdaftar.');
    }

    const passwordHash = await hashPassword(dto.password);
    const userId = randomUUID();

    try {
      await this.members.manager.transaction(async (manager) => {
        await manager.getRepository(User).save(
          manager.getRepository(User).create({
            id: userId,
            subject: `local:${userId}`,
            email,
            displayName,
            passwordHash,
            emailVerifiedAt: null,
          }),
        );

        const workspace = await manager.getRepository(Workspace).save(
          manager.getRepository(Workspace).create({
            id: randomUUID(),
            name: `Workspace ${displayName}`,
            ownerId: userId,
          }),
        );

        await manager.getRepository(WorkspaceMember).save(
          manager.getRepository(WorkspaceMember).create({
            workspaceId: workspace.id,
            userId,
            role: WorkspaceRole.OWNER,
          }),
        );
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException('Email sudah terdaftar.');
      }
      throw error;
    }

    const user = await this.users.findOneOrFail({ where: { id: userId } });
    await this.sendVerification(user);

    return { email: user.email, verificationRequired: true };
  }

  async login(dto: LoginDto, meta: SessionMeta): Promise<IssuedSession> {
    const email = dto.email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email } });

    if (!user?.passwordHash || !(await verifyPassword(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Email atau password salah.');
    }

    if (!user.emailVerifiedAt) {
      throw new ForbiddenException({
        message: VERIFICATION_REQUIRED_MESSAGE,
        code: 'EMAIL_NOT_VERIFIED',
      });
    }

    const workspace = await this.ensureWorkspace(user.id, user.displayName);
    const session = await this.createSession(user.id, meta);

    return {
      user: toUserView(user),
      workspace,
      ...session,
    };
  }

  /** Consumes an activation link and signs the user in straight away. */
  async verifyEmail(token: string, meta: SessionMeta): Promise<IssuedSession> {
    const record = await this.findUsableToken(token, 'EMAIL_VERIFY');

    if (!record) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    const user = record.user;

    if (!user.emailVerifiedAt) {
      user.emailVerifiedAt = new Date();
      await this.users.save(user);
    }

    await this.tokens.delete({ userId: user.id, kind: 'EMAIL_VERIFY' });

    const workspace = await this.ensureWorkspace(user.id, user.displayName);
    const session = await this.createSession(user.id, meta);

    return {
      user: toUserView(user),
      workspace,
      ...session,
    };
  }

  /** Re-sends the activation link; the answer never reveals whether the email exists. */
  async resendVerification(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email: normalized } });

    if (user && !user.emailVerifiedAt) {
      await this.sendVerification(user);
    }

    return {
      message: 'Jika email terdaftar dan belum aktif, tautan aktivasi sudah dikirim.',
    };
  }

  async requestPasswordReset(email: string): Promise<{ message: string }> {
    const normalized = email.trim().toLowerCase();
    const user = await this.users.findOne({ where: { email: normalized } });

    if (user) {
      const token = await this.issueToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS);

      if (token) {
        await this.deliver(
          user.email,
          () =>
            this.mail.sendPasswordResetEmail({
              to: user.email,
              displayName: user.displayName,
              url: this.link('/reset-password', token),
            }),
          'password reset',
        );
      }
    }

    return { message: 'Jika email terdaftar, tautan reset password sudah dikirim.' };
  }

  async resetPassword(token: string, password: string): Promise<{ message: string }> {
    const record = await this.findUsableToken(token, 'PASSWORD_RESET');

    if (!record) {
      throw new BadRequestException(INVALID_LINK_MESSAGE);
    }

    const user = record.user;
    user.passwordHash = await hashPassword(password);
    user.emailVerifiedAt ??= new Date();
    await this.users.save(user);

    await this.tokens.delete({ userId: user.id, kind: 'PASSWORD_RESET' });
    // A reset signs out every existing device.
    await this.sessions.delete({ userId: user.id });

    return { message: 'Password berhasil diperbarui. Silakan masuk kembali.' };
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

    if (!session.user.emailVerifiedAt) {
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

  async updateProfile(userId: string, displayName: string): Promise<AuthResponse> {
    const user = await this.users.findOne({ where: { id: userId } });

    if (!user) {
      throw new UnauthorizedException('Sesi sudah berakhir.');
    }

    user.displayName = displayName.trim();
    await this.users.save(user);

    const workspace = await this.ensureWorkspace(user.id, user.displayName);
    return { user: toUserView(user), workspace };
  }

  /** Rotates the password and signs out every other device. */
  async changePassword(
    token: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const tokenHash = hashToken(token);
    const session = await this.sessions.findOne({
      where: { tokenHash },
      relations: { user: true },
    });

    if (!session) {
      throw new UnauthorizedException('Sesi sudah berakhir.');
    }

    const user = session.user;

    if (!user.passwordHash || !(await verifyPassword(currentPassword, user.passwordHash))) {
      throw new BadRequestException('Password saat ini salah.');
    }

    user.passwordHash = await hashPassword(newPassword);
    await this.users.save(user);

    const activeSessions = await this.sessions.find({ where: { userId: user.id } });
    const stale = activeSessions
      .filter((item) => !item.tokenHash.equals(tokenHash))
      .map((item) => item.id);

    if (stale.length > 0) {
      await this.sessions.delete(stale);
    }

    return { message: 'Password berhasil diperbarui.' };
  }

  private async sendVerification(user: User): Promise<void> {
    const token = await this.issueToken(user.id, 'EMAIL_VERIFY', EMAIL_VERIFICATION_TTL_MS);

    if (!token) {
      return;
    }

    await this.deliver(
      user.email,
      () =>
        this.mail.sendVerificationEmail({
          to: user.email,
          displayName: user.displayName,
          url: this.link('/verify-email', token),
        }),
      'email verification',
    );
  }

  /** Returns null when the same address asked for a new token less than a minute ago. */
  private async issueToken(
    userId: string,
    kind: AuthTokenKind,
    ttlMs: number,
  ): Promise<string | null> {
    const throttleKey = `${kind}:${userId}`;
    const lastSentAt = this.lastTokenSentAt.get(throttleKey) ?? 0;

    if (Date.now() - lastSentAt < TOKEN_RESEND_COOLDOWN_MS) {
      return null;
    }

    this.lastTokenSentAt.set(throttleKey, Date.now());
    await this.tokens.delete({ userId, kind });

    const token = randomBytes(32).toString('base64url');

    await this.tokens.save(
      this.tokens.create({
        id: randomUUID(),
        userId,
        kind,
        tokenHash: hashToken(token),
        expiresAt: new Date(Date.now() + ttlMs),
        usedAt: null,
      }),
    );

    return token;
  }

  private async findUsableToken(token: string, kind: AuthTokenKind): Promise<AuthToken | null> {
    const record = await this.tokens.findOne({
      where: { tokenHash: hashToken(token), kind },
      relations: { user: true },
    });

    if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now()) {
      return null;
    }

    return record;
  }

  private link(path: string, token: string): string {
    const origin = this.env.PUBLIC_ORIGIN.replace(/\/+$/, '');
    return `${origin}${path}?token=${encodeURIComponent(token)}`;
  }

  /**
   * A mail outage must not lose the account or the token, so failures are logged
   * and the endpoint still answers with the "check your inbox" message.
   */
  private async deliver(email: string, send: () => Promise<void>, kind: string): Promise<void> {
    try {
      await send();
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Could not send the ${kind} email to ${email}: ${reason}`);
    }
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
