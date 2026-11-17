import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthResponse } from './auth.service';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import type { AuthenticatedRequest } from './session.guard';
import { SessionGuard } from './session.guard';
import { readSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.register(dto, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });

    this.setSessionCookie(response, result.token, result.expiresAt);
    return { user: result.user, workspace: result.workspace };
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.login(dto, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });

    this.setSessionCookie(response, result.token, result.expiresAt);
    return { user: result.user, workspace: result.workspace };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const token = readSessionToken(request);
    if (token) {
      await this.auth.logout(token);
    }
    response.clearCookie(SESSION_COOKIE_NAME, sessionCookieOptions());
  }

  @Get('me')
  @UseGuards(SessionGuard)
  me(@Req() request: AuthenticatedRequest): AuthResponse {
    return request.auth!;
  }

  private setSessionCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions(),
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }
}
