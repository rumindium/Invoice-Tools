import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Session, User, Workspace, WorkspaceMember } from '../database/entities';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionGuard } from './session.guard';

@Module({
  imports: [TypeOrmModule.forFeature([User, Session, Workspace, WorkspaceMember])],
  controllers: [AuthController],
  providers: [AuthService, SessionGuard],
  exports: [AuthService],
})
export class AuthModule {}
