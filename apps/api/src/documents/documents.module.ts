import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import {
  AuditEvent,
  Customer,
  CustomerContact,
  Document,
  DocumentItem,
  DocumentNumberSequence,
  DocumentRelation,
  InvoiceFollowUp,
} from '../database/entities';
import { TemplatesModule } from '../templates/templates.module';
import { DocumentsController } from './documents.controller';
import { DocumentFlowService } from './document-flow.service';
import { DocumentsService } from './documents.service';
import { InvoiceConversionService } from './invoice-conversion.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentItem,
      Customer,
      CustomerContact,
      DocumentNumberSequence,
      DocumentRelation,
      InvoiceFollowUp,
      AuditEvent,
    ]),
    AuthModule,
    AuditModule,
    CompaniesModule,
    TemplatesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService, DocumentFlowService, InvoiceConversionService],
  exports: [DocumentsService, InvoiceConversionService],
})
export class DocumentsModule {}
