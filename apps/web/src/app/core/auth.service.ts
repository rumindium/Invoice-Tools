import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export interface AuthWorkspace {
  id: string;
  name: string;
}

export interface AuthResponse {
  user: AuthUser;
  workspace: AuthWorkspace;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  displayName: string;
  email: string;
  password: string;
}

export interface RegisterResponse {
  email: string;
  verificationRequired: true;
}

export interface MessageResponse {
  message: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly api = inject(ApiConfigService);
  private readonly router = inject(Router);

  readonly user = signal<AuthUser | null>(null);
  readonly workspace = signal<AuthWorkspace | null>(null);
  readonly loaded = signal(false);

  private loading?: Promise<void>;

  async ensureLoaded(force = false): Promise<void> {
    if (force) {
      this.loaded.set(false);
      this.loading = undefined;
    }

    if (this.loaded()) {
      return;
    }

    this.loading ??= this.loadSession();
    await this.loading;
  }

  async login(payload: LoginPayload): Promise<AuthResponse> {
    const response = await this.post<AuthResponse>('login', payload);

    this.apply(response);
    this.loaded.set(true);
    return response;
  }

  /** Registration only queues the account; access starts once the email is verified. */
  register(payload: RegisterPayload): Promise<RegisterResponse> {
    return this.post<RegisterResponse>('register', payload);
  }

  async verifyEmail(token: string): Promise<AuthResponse> {
    const response = await this.post<AuthResponse>('verify-email', { token });

    this.apply(response);
    this.loaded.set(true);
    return response;
  }

  resendVerification(email: string): Promise<MessageResponse> {
    return this.post<MessageResponse>('verify-email/resend', { email });
  }

  requestPasswordReset(email: string): Promise<MessageResponse> {
    return this.post<MessageResponse>('forgot-password', { email });
  }

  resetPassword(token: string, password: string): Promise<MessageResponse> {
    return this.post<MessageResponse>('reset-password', { token, password });
  }

  async updateProfile(displayName: string): Promise<AuthResponse> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.patch<AuthResponse>(
        `${origin}/api/v1/auth/me`,
        { displayName },
        { withCredentials: true },
      ),
    );

    this.apply(response);
    return response;
  }

  changePassword(currentPassword: string, newPassword: string): Promise<MessageResponse> {
    return this.post<MessageResponse>('change-password', { currentPassword, newPassword });
  }

  async logout(): Promise<void> {
    try {
      const origin = await this.api.apiOrigin;
      await firstValueFrom(
        this.http.post<void>(`${origin}/api/v1/auth/logout`, null, {
          withCredentials: true,
        }),
      );
    } finally {
      this.clear();
      this.loaded.set(true);
      await this.router.navigateByUrl('/login');
    }
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    const origin = await this.api.apiOrigin;

    return firstValueFrom(
      this.http.post<T>(`${origin}/api/v1/auth/${path}`, body, { withCredentials: true }),
    );
  }

  private async loadSession(): Promise<void> {
    try {
      const origin = await this.api.apiOrigin;
      const response = await firstValueFrom(
        this.http.get<AuthResponse>(`${origin}/api/v1/auth/me`, {
          withCredentials: true,
        }),
      );
      this.apply(response);
    } catch {
      this.clear();
    } finally {
      this.loaded.set(true);
    }
  }

  private apply(response: AuthResponse): void {
    this.user.set(response.user);
    this.workspace.set(response.workspace);
  }

  private clear(): void {
    this.user.set(null);
    this.workspace.set(null);
  }
}
