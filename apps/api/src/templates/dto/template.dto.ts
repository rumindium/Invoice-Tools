import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { QUOTATION_TEMPLATE_KEYS, type QuotationTemplateKey } from '../template-catalog';
import { HEX_COLOR_PATTERN } from '../template-theme';

const COLOR_MESSAGE = 'Colour must be a hex value like #2563eb.';

export class ApplyTemplateDto {
  @IsIn(QUOTATION_TEMPLATE_KEYS, { message: 'Unknown template.' })
  key!: QuotationTemplateKey;

  @Matches(HEX_COLOR_PATTERN, { message: COLOR_MESSAGE })
  accentColor!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;
}

export class TemplatePreviewQueryDto {
  @IsOptional()
  @IsIn(QUOTATION_TEMPLATE_KEYS, { message: 'Unknown template.' })
  key?: QuotationTemplateKey;

  @IsOptional()
  @Matches(HEX_COLOR_PATTERN, { message: COLOR_MESSAGE })
  accentColor?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;
}

export class TemplateCompanyQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;
}
