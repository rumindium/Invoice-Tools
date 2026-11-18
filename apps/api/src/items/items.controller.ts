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
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { ItemInputDto, ListItemsQueryDto } from './dto/item.dto';
import { ItemsService } from './items.service';
import type { ItemDetail, ItemListRow, ItemSummary } from './items.service';

@Controller('items')
@UseGuards(SessionGuard)
export class ItemsController {
  constructor(private readonly items: ItemsService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListItemsQueryDto,
  ): Promise<{ items: ItemListRow[]; total: number; summary: ItemSummary }> {
    return this.items.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  summary(@Req() request: AuthenticatedRequest): Promise<ItemSummary> {
    return this.items.summary(request.auth!.workspace.id);
  }

  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<ItemDetail> {
    return this.items.detail(request.auth!.workspace.id, id);
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: ItemInputDto,
  ): Promise<{ item: ItemListRow }> {
    return { item: await this.items.create(request.auth!.workspace.id, dto) };
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ItemInputDto,
  ): Promise<{ item: ItemListRow }> {
    return { item: await this.items.update(request.auth!.workspace.id, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.items.archive(request.auth!.workspace.id, id);
  }
}
