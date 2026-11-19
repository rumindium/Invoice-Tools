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
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../auth/session.guard';
import { SessionGuard } from '../auth/session.guard';
import { sendPdf } from '../documents/pdf/send-pdf';
import type { TemplateSettingsView } from '../templates/templates.service';
import type { TemplateAssetView, TemplateDesignView } from './design-views';
import {
  ApplyDesignDto,
  AssetListQueryDto,
  CreateAssetDto,
  DesignListQueryDto,
  DesignPreviewQueryDto,
} from './dto/template-design.dto';
import { TemplateDesignsService } from './template-designs.service';

/**
 * Template builder designs. Bodies are validated against the design schema (zod) rather than
 * class-validator DTOs, because a design is a nested union of element types.
 */
@Controller('template-designs')
@UseGuards(SessionGuard)
export class TemplateDesignsController {
  constructor(private readonly designs: TemplateDesignsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: DesignListQueryDto,
  ): Promise<{ designs: TemplateDesignView[] }> {
    return { designs: await this.designs.list(request.auth!.workspace.id, query.kind) };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() body: Record<string, unknown>,
  ): Promise<{ design: TemplateDesignView }> {
    const { workspace, user } = request.auth!;
    return { design: await this.designs.create(workspace.id, user.id, body) };
  }

  @Get(':id')
  async get(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
  ): Promise<{ design: TemplateDesignView }> {
    return { design: await this.designs.get(request.auth!.workspace.id, id) };
  }

  /** Body: the design plus `revision`, the revision the change is based on. */
  @Put(':id')
  async update(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ): Promise<{ design: TemplateDesignView }> {
    const { workspace, user } = request.auth!;
    const { revision, ...design } = body ?? {};
    return { design: await this.designs.update(workspace.id, user.id, id, revision, design) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    const { workspace, user } = request.auth!;
    await this.designs.remove(workspace.id, user.id, id);
  }

  /** Makes the design the company's active template for a document type. */
  @Post(':id/apply')
  @HttpCode(HttpStatus.OK)
  async apply(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: ApplyDesignDto,
  ): Promise<{ settings: TemplateSettingsView; design: TemplateDesignView }> {
    const { workspace, user } = request.auth!;
    const settings = await this.designs.apply(
      workspace.id,
      user.id,
      id,
      dto.documentType,
      dto.companyId,
    );
    return { settings, design: await this.designs.get(workspace.id, id) };
  }

  /** The design with sample data, as a PDF opened in the browser. */
  @Get(':id/preview.pdf')
  async preview(
    @Req() request: AuthenticatedRequest,
    @Param('id') id: string,
    @Query() query: DesignPreviewQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    const { buffer, filename } = await this.designs.previewPdf(
      request.auth!.workspace.id,
      id,
      query.documentType,
    );
    sendPdf(response, buffer, filename, 'inline');
  }
}

/** The builder's image library: uploads and saved signatures. */
@Controller('template-assets')
@UseGuards(SessionGuard)
export class TemplateAssetsController {
  constructor(private readonly designs: TemplateDesignsService) {}

  @Get()
  async list(
    @Req() request: AuthenticatedRequest,
    @Query() query: AssetListQueryDto,
  ): Promise<{ assets: TemplateAssetView[] }> {
    return { assets: await this.designs.listAssets(request.auth!.workspace.id, query.kind) };
  }

  @Post()
  async create(
    @Req() request: AuthenticatedRequest,
    @Body() dto: CreateAssetDto,
  ): Promise<{ asset: TemplateAssetView }> {
    const { workspace, user } = request.auth!;
    return { asset: await this.designs.addAsset(workspace.id, user.id, dto) };
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@Req() request: AuthenticatedRequest, @Param('id') id: string): Promise<void> {
    await this.designs.removeAsset(request.auth!.workspace.id, id);
  }
}
