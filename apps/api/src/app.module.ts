import { Module } from '@nestjs/common';
import { AuditEventsModule } from './audit/audit-events.module';
import { AuthModule } from './auth/auth.module';
import { CompaniesModule } from './companies/companies.module';
import { CustomersModule } from './customers/customers.module';
import { DatabaseModule } from './database/database.module';
import { DocumentsModule } from './documents/documents.module';
import { HealthModule } from './health/health.module';
import { ItemsModule } from './items/items.module';
import { UnitsModule } from './units/units.module';

@Module({
  imports: [
    DatabaseModule,
    AuditEventsModule,
    AuthModule,
    CompaniesModule,
    CustomersModule,
    DocumentsModule,
    ItemsModule,
    UnitsModule,
    HealthModule,
  ],
})
export class AppModule {}
