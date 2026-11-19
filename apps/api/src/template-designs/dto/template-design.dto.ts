import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { MAX_IMAGE_DATA_URL } from '../design-schema';

const SEGMENTS = ['invoice', 'quotation', 'goods-receipt'];

export class DesignListQueryDto {
  @IsOptional()
  @IsIn(SEGMENTS, { message: 'kind must be invoice, quotation or goods-receipt.' })
  kind?: string;
}

export class ApplyDesignDto {
  /** Which documents use the design; the design's own kind by default. */
  @IsOptional()
  @IsIn(SEGMENTS, { message: 'documentType must be invoice, quotation or goods-receipt.' })
  documentType?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;
}

export class DesignPreviewQueryDto {
  @IsOptional()
  @IsIn(SEGMENTS, { message: 'documentType must be invoice, quotation or goods-receipt.' })
  documentType?: string;

  /** Cache buster the builder adds (the design's revision); not used by the server. */
  @IsOptional()
  @IsString()
  @MaxLength(20)
  v?: string;
}

export class AssetListQueryDto {
  @IsOptional()
  @IsIn(['upload', 'signature'], { message: 'kind must be upload or signature.' })
  kind?: string;
}

export class CreateAssetDto {
  @IsIn(['upload', 'signature'], { message: 'kind must be upload or signature.' })
  kind!: 'upload' | 'signature';

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsString()
  @MaxLength(MAX_IMAGE_DATA_URL, { message: 'Images must be smaller than about 3 MB.' })
  dataUrl!: string;
}
