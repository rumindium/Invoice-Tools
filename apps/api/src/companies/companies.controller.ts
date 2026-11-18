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
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { CompaniesService, CompanyView } from './companies.service';
import { CompanyInputDto } from './dto/company-input.dto';

interface CompanyResponse {
  company: CompanyView;
}

@Controller('companies')
@UseGuards(SessionGuard)
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<{ companies: CompanyView[] }> {
    return { companies: await this.companies.list(request.auth!.workspace.id) };
  }

  @Get('current')
  async current(@Req() request: AuthenticatedRequest): Promise<{ company: CompanyView | null }> {
    return { company: await this.companies.current(request.auth!.workspace.id) };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CompanyInputDto,
  ): Promise<CompanyResponse> {
    return { company: await this.companies.create(request.auth!.workspace.id, dto) };
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CompanyInputDto,
  ): Promise<CompanyResponse> {
    return { company: await this.companies.update(request.auth!.workspace.id, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.companies.archive(request.auth!.workspace.id, id);
  }
}
