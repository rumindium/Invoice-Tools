import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { AuditEvent, Document, DocumentItem } from '../database/entities';
import { TemplatesModule } from '../templates/templates.module';
import { QuotationsController } from './quotations.controller';
import { QuotationsService } from './quotations.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentItem, AuditEvent]),
    AuthModule,
    AuditModule,
    CompaniesModule,
    TemplatesModule,
  ],
  controllers: [QuotationsController],
  providers: [QuotationsService],
})
export class QuotationsModule {}
