import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { TerminPlan, TerminPlanItem } from '../database/entities';
import { DocumentsModule } from '../documents/documents.module';
import { GoodsReceiptsModule } from '../goods-receipts/goods-receipts.module';
import { TerminsController } from './termins.controller';
import { TerminsService } from './termins.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TerminPlan, TerminPlanItem]),
    AuthModule,
    CompaniesModule,
    DocumentsModule,
    GoodsReceiptsModule,
  ],
  controllers: [TerminsController],
  providers: [TerminsService],
})
export class TerminsModule {}
