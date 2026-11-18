import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { Customer, CustomerContact, Document } from '../database/entities';
import { CustomersController } from './customers.controller';
import { CustomersService } from './customers.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Customer, CustomerContact, Document]),
    AuthModule,
    AuditModule,
  ],
  controllers: [CustomersController],
  providers: [CustomersService],
  exports: [CustomersService],
})
export class CustomersModule {}
