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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  GoodsReceiptTerminPlanDto,
  InvoiceTerminPlanDto,
  QuotationTerminPlanDto,
  UpdateTerminPlanDto,
} from './dto/termin-plan.dto';
import type { TerminPlanView } from './termin-views';
import { TerminPlanResult, TerminsService } from './termins.service';

/**
 * Payment termin plans. Create one for an accepted quotation (goods receipts), a received
 * goods receipt (invoices) or a typed invoice (invoices); then generate, re-split or delete.
 */
@Controller('termin-plans')
@UseGuards(SessionGuard)
export class TerminsController {
  constructor(private readonly termins: TerminsService) {}

  @Post('goods-receipts')
  fromQuotation(
    @Req() request: AuthenticatedRequest,
    @Body() dto: QuotationTerminPlanDto,
  ): Promise<TerminPlanResult> {
    return this.termins.createForQuotation(request.auth!.workspace.id, request.auth!.user.id, dto);
  }

  @Post('invoices/from-goods-receipt')
  fromGoodsReceipt(
    @Req() request: AuthenticatedRequest,
    @Body() dto: GoodsReceiptTerminPlanDto,
  ): Promise<TerminPlanResult> {
    return this.termins.createForGoodsReceipt(
      request.auth!.workspace.id,
      request.auth!.user.id,
      dto,
    );
  }

  @Post('invoices')
  fromInvoice(
    @Req() request: AuthenticatedRequest,
    @Body() dto: InvoiceTerminPlanDto,
  ): Promise<TerminPlanResult> {
    return this.termins.createForInvoice(request.auth!.workspace.id, request.auth!.user.id, dto);
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ plan: TerminPlanView }> {
    return { plan: await this.termins.get(request.auth!.workspace.id, id) };
  }

  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateTerminPlanDto,
  ): Promise<{ plan: TerminPlanView }> {
    return {
      plan: await this.termins.update(request.auth!.workspace.id, request.auth!.user.id, id, dto),
    };
  }

  @Post(':id/termins/:sequence/generate')
  generate(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('sequence', ParseIntPipe) sequence: number,
  ): Promise<TerminPlanResult> {
    return this.termins.generate(request.auth!.workspace.id, request.auth!.user.id, id, sequence);
  }

  @Post(':id/generate-remaining')
  generateRemaining(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<TerminPlanResult> {
    return this.termins.generateRemaining(request.auth!.workspace.id, request.auth!.user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.termins.remove(request.auth!.workspace.id, request.auth!.user.id, id);
  }
}
