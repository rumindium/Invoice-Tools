import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ChangeStatusDto, InvoicePayloadDto, ListDocumentsQueryDto } from './dto/invoice.dto';
import type { InvoiceFollowUpView, InvoiceListRow, InvoiceSummary, InvoiceView } from './views';

@Controller('documents')
@UseGuards(SessionGuard)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

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

    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    response.setHeader('Content-Length', String(buffer.length));
    response.setHeader('Cache-Control', 'no-store');
    response.end(buffer);
  }
}
