import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthResponse } from './auth.service';
import { AuthService } from './auth.service';
import { readSessionToken } from './session';

export interface AuthenticatedRequest extends Request {
  auth?: AuthResponse;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionToken(request);

    if (!token) {
      throw new UnauthorizedException('Sesi tidak ditemukan.');
    }

    const session = await this.auth.getSession(token);
    if (!session) {
      throw new UnauthorizedException('Sesi sudah berakhir.');
    }

    request.auth = session;
    return true;
  }
}
