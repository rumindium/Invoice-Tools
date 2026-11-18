import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { AuthResponse, PendingRegistration } from './auth.service';
import { AuthService } from './auth.service';
import { ChangePasswordDto } from './dto/change-password.dto';
import { EmailOnlyDto } from './dto/email-only.dto';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import type { AuthenticatedRequest } from './session.guard';
import { SessionGuard } from './session.guard';
import { readSessionToken, SESSION_COOKIE_NAME, sessionCookieOptions } from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  register(@Body() dto: RegisterDto): Promise<PendingRegistration> {
    return this.auth.register(dto);
  }

  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(
    @Body() dto: VerifyEmailDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AuthResponse> {
    const result = await this.auth.verifyEmail(dto.token, {
      ip: request.ip,
      userAgent: request.get('user-agent'),
    });

    this.setSessionCookie(response, result.token, result.expiresAt);
    return { user: result.user, workspace: result.workspace };
  }

  @Post('verify-email/resend')
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(@Body() dto: EmailOnlyDto): Promise<{ message: string }> {
    return this.auth.resendVerification(dto.email);
  }

  @Post('forgot-password')
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() dto: EmailOnlyDto): Promise<{ message: string }> {
    return this.auth.requestPasswordReset(dto.email);
  }

  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<{ message: string }> {
    return this.auth.resetPassword(dto.token, dto.password);
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

  @Patch('me')
  @UseGuards(SessionGuard)
  updateProfile(
    @Body() dto: UpdateProfileDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<AuthResponse> {
    return this.auth.updateProfile(request.auth!.user.id, dto.displayName);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @UseGuards(SessionGuard)
  changePassword(
    @Body() dto: ChangePasswordDto,
    @Req() request: AuthenticatedRequest,
  ): Promise<{ message: string }> {
    return this.auth.changePassword(
      readSessionToken(request)!,
      dto.currentPassword,
      dto.newPassword,
    );
  }

  private setSessionCookie(response: Response, token: string, expiresAt: Date): void {
    response.cookie(SESSION_COOKIE_NAME, token, {
      ...sessionCookieOptions(),
      maxAge: Math.max(0, expiresAt.getTime() - Date.now()),
    });
  }
}
