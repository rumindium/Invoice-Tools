import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CatalogItem, Document } from '../database/entities';
import { ItemsController } from './items.controller';
import { ItemsService } from './items.service';

@Module({
  imports: [TypeOrmModule.forFeature([CatalogItem, Document]), AuthModule, AuditModule],
  controllers: [ItemsController],
  providers: [ItemsService],
  exports: [ItemsService],
})
export class ItemsModule {}
