import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { sendPdf } from '../documents/pdf/send-pdf';
import {
  ListQuotationsQueryDto,
  QuotationPayloadDto,
  QuotationRevisionDto,
  QuotationStatusDto,
} from './dto/quotation.dto';
import { QuotationsService } from './quotations.service';
import type { RevisionSummary } from '../documents/revisions';
import type { QuotationListRow, QuotationSummary, QuotationView } from './views';

@Controller('quotations')
@UseGuards(SessionGuard)
export class QuotationsController {
  constructor(private readonly quotations: QuotationsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListQuotationsQueryDto,
  ): Promise<{ items: QuotationListRow[]; total: number; page: number; pageSize: number }> {
    return this.quotations.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest): Promise<QuotationSummary> {
    return this.quotations.summary(request.auth!.workspace.id);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() payload: QuotationPayloadDto,
  ): Promise<{ quotation: QuotationView }> {
    return {
      quotation: await this.quotations.create(
        request.auth!.workspace.id,
        request.auth!.user.id,
        payload,
      ),
    };
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ quotation: QuotationView }> {
    return { quotation: await this.quotations.get(request.auth!.workspace.id, id) };
  }

  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() payload: QuotationPayloadDto,
  ): Promise<{ quotation: QuotationView }> {
    return {
      quotation: await this.quotations.update(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        payload,
      ),
    };
  }

  /** Corrects a sent or accepted quotation as a new version ({ ...payload, reason }). */
  @Post(':id/revisions')
  async revise(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: QuotationRevisionDto,
  ): Promise<{ quotation: QuotationView }> {
    return {
      quotation: await this.quotations.revise(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  @Get(':id/revisions')
  async revisions(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ revision: number; revisions: RevisionSummary[] }> {
    const quotation = await this.quotations.get(request.auth!.workspace.id, id);
    return { revision: quotation.revision, revisions: quotation.revisions };
  }

  @Get(':id/revisions/:revision')
  async revision(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): Promise<{ quotation: QuotationView }> {
    return {
      quotation: await this.quotations.getRevision(request.auth!.workspace.id, id, revision),
    };
  }

  @Get(':id/revisions/:revision/pdf')
  async revisionPdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.quotations.revisionPdf(
      request.auth!.workspace.id,
      id,
      revision,
    );
    sendPdf(response, buffer, filename);
  }

  @Post(':id/status')
  async changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: QuotationStatusDto,
  ): Promise<{ quotation: QuotationView }> {
    return {
      quotation: await this.quotations.changeStatus(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.quotations.remove(request.auth!.workspace.id, request.auth!.user.id, id);
  }

  @Get(':id/pdf')
  async pdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.quotations.pdf(request.auth!.workspace.id, id);
    sendPdf(response, buffer, filename);
  }
}
