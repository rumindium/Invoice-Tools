import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { UnitInputDto } from './dto/unit.dto';
import { UnitsService } from './units.service';
import type { UnitView } from './units.service';

@Controller('units')
@UseGuards(SessionGuard)
export class UnitsController {
  constructor(private readonly units: UnitsService) {}

  @Get()
  async list(@Req() request: AuthenticatedRequest): Promise<{ units: UnitView[] }> {
    return { units: await this.units.list(request.auth!.workspace.id) };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: UnitInputDto,
  ): Promise<{ unit: UnitView }> {
    return { unit: await this.units.create(request.auth!.workspace.id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.units.remove(request.auth!.workspace.id, id);
  }
}
