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
import { CustomersService } from './customers.service';
import type {
  CustomerContactView,
  CustomerDetail,
  CustomerListRow,
  CustomerSummary,
} from './customers.service';
import { CustomerContactDto, CustomerInputDto, ListCustomersQueryDto } from './dto/customer.dto';

@Controller('customers')
@UseGuards(SessionGuard)
export class CustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListCustomersQueryDto,
  ): Promise<{ items: CustomerListRow[]; total: number; summary: CustomerSummary }> {
    return this.customers.list(request.auth!.workspace.id, query);
  }

  @Get('summary')
  summary(@Req() request: AuthenticatedRequest): Promise<CustomerSummary> {
    return this.customers.summary(request.auth!.workspace.id);
  }

  @Get(':id')
  detail(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<CustomerDetail> {
    return this.customers.detail(request.auth!.workspace.id, id);
  }

  @Get(':id/contacts')
  async listContacts(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ contacts: CustomerContactView[] }> {
    return {
      contacts: await this.customers.listContacts(request.auth!.workspace.id, id),
    };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CustomerInputDto,
  ): Promise<{ customer: CustomerListRow }> {
    return { customer: await this.customers.create(request.auth!.workspace.id, dto) };
  }

  @Patch(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CustomerInputDto,
  ): Promise<{ customer: CustomerListRow }> {
    return { customer: await this.customers.update(request.auth!.workspace.id, id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async archive(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.customers.archive(request.auth!.workspace.id, id);
  }

  @Post(':id/contacts')
  async addContact(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: CustomerContactDto,
  ): Promise<{ contact: CustomerContactView }> {
    return {
      contact: await this.customers.addContact(request.auth!.workspace.id, id, dto),
    };
  }

  @Patch(':id/contacts/:contactId')
  async updateContact(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
    @Body() dto: CustomerContactDto,
  ): Promise<{ contact: CustomerContactView }> {
    return {
      contact: await this.customers.updateContact(request.auth!.workspace.id, id, contactId, dto),
    };
  }

  @Delete(':id/contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async removeContact(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Param('contactId') contactId: string,
  ): Promise<void> {
    await this.customers.removeContact(request.auth!.workspace.id, id, contactId);
  }
}
