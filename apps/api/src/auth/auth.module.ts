import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthToken, Session, User, Workspace, WorkspaceMember } from '../database/entities';
import { MailModule } from '../mail/mail.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [
    TypeOrmModule.forFeature([User, Session, AuthToken, Workspace, WorkspaceMember]),
    MailModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService],
})
export class AuthModule {}
