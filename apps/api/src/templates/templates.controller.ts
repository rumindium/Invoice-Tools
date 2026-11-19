import { Body, Controller, Get, Param, Put, Query, Req, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { sendPdf } from '../documents/pdf/send-pdf';
import {
  ApplyTemplateDto,
  TemplateCompanyQueryDto,
  TemplatePreviewQueryDto,
} from './dto/template.dto';
import { TemplatesService, type TemplateSettingsView } from './templates.service';

/**
 * Document templates per company: `/templates/quotation` lists the layouts with the
 * company's colours and the active choice; PUT applies a layout and colour to every
 * quotation generated from then on.
 */
@Controller('templates')
@UseGuards(SessionGuard)
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get(':documentType')
  async settings(
    @Req() request: AuthenticatedRequest,
    @Param('documentType') documentType: string,
    @Query() query: TemplateCompanyQueryDto,
  ): Promise<{ settings: TemplateSettingsView }> {
    return {
      settings: await this.templates.settings(
        request.auth!.workspace.id,
        documentType,
        query.companyId,
      ),
    };
  }

  @Put(':documentType')
  async apply(
    @Req() request: AuthenticatedRequest,
    @Param('documentType') documentType: string,
    @Body() dto: ApplyTemplateDto,
  ): Promise<{ settings: TemplateSettingsView }> {
    return {
      settings: await this.templates.apply(
        request.auth!.workspace.id,
        request.auth!.user.id,
        documentType,
        dto,
      ),
    };
  }

  /** Sample document in a layout and colour, opened inline in the browser. */
  @Get(':documentType/preview.pdf')
  async preview(
    @Req() request: AuthenticatedRequest,
    @Param('documentType') documentType: string,
    @Query() query: TemplatePreviewQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.templates.previewPdf(
      request.auth!.workspace.id,
      documentType,
      query,
    );
    sendPdf(response, buffer, filename, 'inline');
  }
}
