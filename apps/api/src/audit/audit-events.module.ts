import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { AuditEvent, User } from '../database/entities';
import { AuditController } from './audit.controller';
import { AuditModule } from './audit.module';

/** The read side of the audit trail, kept apart so AuthModule never imports it back. */
@Module({
  imports: [TypeOrmModule.forFeature([AuditEvent, User]), AuthModule, AuditModule],
  controllers: [AuditController],
})
export class AuditEventsModule {}
