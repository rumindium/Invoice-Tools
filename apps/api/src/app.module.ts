import { Module } from '@nestjs/common';
import { AuditEventsModule } from './audit/audit-events.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { FeedbackModule } from './feedback/feedback.module';
import { GoodsReceiptsModule } from './goods-receipts/goods-receipts.module';
import { HealthModule } from './health/health.module';
import { ItemsModule } from './items/items.module';
import { QuotationsModule } from './quotations/quotations.module';
import { TemplateDesignsModule } from './template-designs/template-designs.module';
import { TemplatesModule } from './templates/templates.module';
import { TerminsModule } from './termins/termins.module';
import { UnitsModule } from './units/units.module';

@Module({
  imports: [
    DatabaseModule,
    AuditEventsModule,
    AuthModule,
    CompaniesModule,
    CustomersModule,
    TemplatesModule,
    TemplateDesignsModule,
    QuotationsModule,
    GoodsReceiptsModule,
    DocumentsModule,
    TerminsModule,
    ItemsModule,
    FeedbackModule,
    UnitsModule,
    HealthModule,
  ],
})
export class AppModule {}
