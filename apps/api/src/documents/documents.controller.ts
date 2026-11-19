import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Patch,
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
import { DocumentsService } from './documents.service';
import { FollowUpInputDto, FollowUpStatusDto } from './dto/follow-up.dto';
import {
  ChangeStatusDto,
  InvoiceFromGoodsReceiptDto,
  InvoicePayloadDto,
  InvoiceRevisionDto,
  ListDocumentsQueryDto,
} from './dto/invoice.dto';
import { InvoiceConversionService } from './invoice-conversion.service';
import { sendPdf } from './pdf/send-pdf';
import type { RevisionSummary } from './revisions';
import type { InvoiceFollowUpView, InvoiceListRow, InvoiceSummary, InvoiceView } from './views';

@Controller('documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(
    private readonly documents: DocumentsService,
    private readonly conversions: InvoiceConversionService,
  ) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListDocumentsQueryDto,
  ): Promise<{ items: InvoiceListRow[]; total: number; page: number; pageSize: number }> {
    return this.documents.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest): Promise<InvoiceSummary> {
    return this.documents.summary(request.auth!.workspace.id);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() payload: InvoicePayloadDto,
  ): Promise<{ invoice: InvoiceView }> {
    const workspaceId = request.auth!.workspace.id;
    return { invoice: await this.documents.create(workspaceId, request.auth!.user.id, payload) };
  }

  /** Generates the invoice of a received goods receipt ({ goodsReceiptId }). */
  @Post('from-goods-receipt')
  async fromGoodsReceipt(
    @Req() request: AuthenticatedRequest,
    @Body() dto: InvoiceFromGoodsReceiptDto,
  ): Promise<{ invoice: InvoiceView }> {
    const workspaceId = request.auth!.workspace.id;
    const invoiceId = await this.conversions.fromGoodsReceipt(
      workspaceId,
      request.auth!.user.id,
      dto.goodsReceiptId,
    );
    return { invoice: await this.documents.get(workspaceId, invoiceId) };
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ invoice: InvoiceView }> {
    return { invoice: await this.documents.get(request.auth!.workspace.id, id) };
  }

  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() payload: InvoicePayloadDto,
  ): Promise<{ invoice: InvoiceView }> {
    return {
      invoice: await this.documents.update(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        payload,
      ),
    };
  }

  /** Corrects an issued invoice as a new version ({ ...payload, reason }). */
  @Post(':id/revisions')
  async revise(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: InvoiceRevisionDto,
  ): Promise<{ invoice: InvoiceView }> {
    return {
      invoice: await this.documents.revise(
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
    const invoice = await this.documents.get(request.auth!.workspace.id, id);
    return { revision: invoice.revision, revisions: invoice.revisions };
  }

  @Get(':id/revisions/:revision')
  async revision(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): Promise<{ invoice: InvoiceView }> {
    return { invoice: await this.documents.getRevision(request.auth!.workspace.id, id, revision) };
  }

  @Get(':id/revisions/:revision/pdf')
  async revisionPdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.documents.revisionPdf(
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
    @Body() dto: ChangeStatusDto,
  ): Promise<{ invoice: InvoiceView }> {
    return {
      invoice: await this.documents.changeStatus(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  @Get(':id/follow-ups')
  async listFollowUps(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ followUps: InvoiceFollowUpView[] }> {
    return { followUps: await this.documents.listFollowUps(request.auth!.workspace.id, id) };
  }

  @Post(':id/follow-ups')
  async addFollowUp(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: FollowUpInputDto,
  ): Promise<{ followUp: InvoiceFollowUpView }> {
    return {
      followUp: await this.documents.addFollowUp(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  @Patch(':id/follow-ups/:followUpId')
  async changeFollowUpStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('followUpId') followUpId: string,
    @Body() dto: FollowUpStatusDto,
  ): Promise<{ followUp: InvoiceFollowUpView }> {
    return {
      followUp: await this.documents.changeFollowUpStatus(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        followUpId,
        dto,
      ),
    };
  }

  @Delete(':id/follow-ups/:followUpId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeFollowUp(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('followUpId') followUpId: string,
  ): Promise<void> {
    await this.documents.removeFollowUp(
      request.auth!.workspace.id,
      request.auth!.user.id,
      id,
      followUpId,
    );
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.documents.remove(request.auth!.workspace.id, request.auth!.user.id, id);
  }

  @Get(':id/pdf')
  async pdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.documents.pdf(request.auth!.workspace.id, id);
    sendPdf(response, buffer, filename);
  }
}
