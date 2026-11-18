import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { UnitOfMeasure } from '../database/entities';
import { UnitsController } from './units.controller';
import { UnitsService } from './units.service';

@Module({
  imports: [TypeOrmModule.forFeature([UnitOfMeasure]), AuthModule, AuditModule],
  controllers: [UnitsController],
  providers: [UnitsService],
  exports: [UnitsService],
})
export class UnitsModule {}
