import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import {
  AuditEvent,
  Customer,
  CustomerContact,
  Document,
  DocumentItem,
  DocumentNumberSequence,
} from '../database/entities';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Document,
      DocumentItem,
      Customer,
      CustomerContact,
      DocumentNumberSequence,
      AuditEvent,
    ]),
    AuthModule,
    CompaniesModule,
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
