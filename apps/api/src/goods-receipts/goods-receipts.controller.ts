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
import type { RevisionSummary } from '../documents/revisions';
import {
  CreateGoodsReceiptDto,
  GoodsReceiptRevisionDto,
  GoodsReceiptStatusDto,
  ListGoodsReceiptsQueryDto,
  UpdateGoodsReceiptDto,
} from './dto/goods-receipt.dto';
import { GoodsReceiptsService } from './goods-receipts.service';
import type {
  GoodsReceiptListRow,
  GoodsReceiptSourceRow,
  GoodsReceiptSummary,
  GoodsReceiptView,
} from './views';

@Controller('goods-receipts')
@UseGuards(SessionGuard)
export class GoodsReceiptsController {
  constructor(private readonly receipts: GoodsReceiptsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListGoodsReceiptsQueryDto,
  ): Promise<{ items: GoodsReceiptListRow[]; total: number; page: number; pageSize: number }> {
    return this.receipts.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest): Promise<GoodsReceiptSummary> {
    return this.receipts.summary(request.auth!.workspace.id);
  }

  /** Accepted quotations that can still be received. */
  @Get('sources')
  async sources(
    @Req() request: AuthenticatedRequest,
  ): Promise<{ quotations: GoodsReceiptSourceRow[] }> {
    return { quotations: await this.receipts.sources(request.auth!.workspace.id) };
  }

  /** Generates the receipt for an accepted quotation ({ quotationId }). */
  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateGoodsReceiptDto,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return {
      goodsReceipt: await this.receipts.createFromQuotation(
        request.auth!.workspace.id,
        request.auth!.user.id,
        dto,
      ),
    };
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return { goodsReceipt: await this.receipts.get(request.auth!.workspace.id, id) };
  }

  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateGoodsReceiptDto,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return {
      goodsReceipt: await this.receipts.update(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  /** Corrects a received goods receipt as a new version ({ ...details, lines, reason }). */
  @Post(':id/revisions')
  async revise(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: GoodsReceiptRevisionDto,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return {
      goodsReceipt: await this.receipts.revise(
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
    const receipt = await this.receipts.get(request.auth!.workspace.id, id);
    return { revision: receipt.revision, revisions: receipt.revisions };
  }

  @Get(':id/revisions/:revision')
  async revision(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return {
      goodsReceipt: await this.receipts.getRevision(request.auth!.workspace.id, id, revision),
    };
  }

  @Get(':id/revisions/:revision/pdf')
  async revisionPdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('revision', ParseIntPipe) revision: number,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.receipts.revisionPdf(
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
    @Body() dto: GoodsReceiptStatusDto,
  ): Promise<{ goodsReceipt: GoodsReceiptView }> {
    return {
      goodsReceipt: await this.receipts.changeStatus(
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
    await this.receipts.remove(request.auth!.workspace.id, request.auth!.user.id, id);
  }

  @Get(':id/pdf')
  async pdf(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.receipts.pdf(request.auth!.workspace.id, id);
    sendPdf(response, buffer, filename);
  }
}
