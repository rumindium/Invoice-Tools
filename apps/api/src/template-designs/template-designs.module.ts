import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { CompaniesModule } from '../companies/companies.module';
import { DocumentTemplate, TemplateAsset, TemplateDesign } from '../database/entities';
import { TemplatesModule } from '../templates/templates.module';
import { TemplateAssetsController, TemplateDesignsController } from './template-designs.controller';
import { TemplateDesignsService } from './template-designs.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([TemplateDesign, TemplateAsset, DocumentTemplate]),
    AuthModule,
    AuditModule,
    CompaniesModule,
    TemplatesModule,
  ],
  controllers: [TemplateDesignsController, TemplateAssetsController],
  providers: [TemplateDesignsService],
})
export class TemplateDesignsModule {}
