import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { AuditEvent, Document, DocumentItem, DocumentRelation } from '../database/entities';
import { TemplatesModule } from '../templates/templates.module';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { GoodsReceiptsService } from './goods-receipts.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Document, DocumentItem, DocumentRelation, AuditEvent]),
    AuthModule,
    AuditModule,
    CompaniesModule,
    TemplatesModule,
  ],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
