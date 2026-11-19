import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import {
  FeedbackInputDto,
  FeedbackStatusDto,
  ListFeedbackQueryDto,
  RelatedDocumentsQueryDto,
} from './dto/feedback.dto';
import { FeedbackService } from './feedback.service';
import type { FeedbackListRow, FeedbackSummary, FeedbackView, RelatedDocumentView } from './views';

@Controller('feedback')
@UseGuards(SessionGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListFeedbackQueryDto,
  ): Promise<{ items: FeedbackListRow[]; total: number; page: number; pageSize: number }> {
    return this.feedback.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  async summary(@Req() request: AuthenticatedRequest): Promise<FeedbackSummary> {
    return this.feedback.summary(request.auth!.workspace.id);
  }

  /** Quotations, goods receipts and invoices a feedback can point to. */
  @Get('related-documents')
  async relatedDocuments(
    @Req() request: AuthenticatedRequest,
    @Query() query: RelatedDocumentsQueryDto,
  ): Promise<{ documents: RelatedDocumentView[] }> {
    return { documents: await this.feedback.relatedDocuments(request.auth!.workspace.id, query) };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: FeedbackInputDto,
  ): Promise<{ feedback: FeedbackView }> {
    return {
      feedback: await this.feedback.create(request.auth!.workspace.id, request.auth!.user.id, dto),
    };
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ feedback: FeedbackView }> {
    return { feedback: await this.feedback.get(request.auth!.workspace.id, id) };
  }

  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: FeedbackInputDto,
  ): Promise<{ feedback: FeedbackView }> {
    return {
      feedback: await this.feedback.update(
        request.auth!.workspace.id,
        request.auth!.user.id,
        id,
        dto,
      ),
    };
  }

  @Post(':id/status')
  async changeStatus(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: FeedbackStatusDto,
  ): Promise<{ feedback: FeedbackView }> {
    return {
      feedback: await this.feedback.changeStatus(
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
    await this.feedback.remove(request.auth!.workspace.id, request.auth!.user.id, id);
  }
}
