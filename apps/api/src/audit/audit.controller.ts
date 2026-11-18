import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import type { AuditPage } from './audit.service';
import { AuditService } from './audit.service';
import { ListAuditQueryDto } from './dto/audit-query.dto';

@Controller('audit-events')
@UseGuards(SessionGuard)
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  list(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListAuditQueryDto,
  ): Promise<AuditPage> {
    return this.audit.list(request.auth!.workspace.id, query);
  }
}
