import { HttpClient } from '@angular/common/http';
import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ApiConfigService } from './api-config.service';

export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
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
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${origin}/api/v1/auth/login`, payload, {
        withCredentials: true,
      }),
    );

    this.apply(response);
    this.loaded.set(true);
    return response;
  }

  async register(payload: RegisterPayload): Promise<AuthResponse> {
    const origin = await this.api.apiOrigin;
    const response = await firstValueFrom(
      this.http.post<AuthResponse>(`${origin}/api/v1/auth/register`, payload, {
        withCredentials: true,
      }),
    );

    this.apply(response);
    this.loaded.set(true);
    return response;
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
