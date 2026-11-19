import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DOCUMENT_DISCOUNT_TYPES,
  InvoiceCustomerDto,
  InvoiceItemDto,
  TAX_MODES,
} from '../../documents/dto/invoice.dto';
import { QUOTATION_STATUSES, QUOTATION_TARGET_STATUSES } from '../quotation-status';

/** Max length of a signature data URL; the web app downscales drawings well below this. */
export const SIGNATURE_IMAGE_MAX_LENGTH = 90_000;

/**
 * Who the quotation is addressed to: a saved or new customer, plus either a saved PIC
 * (`contactId`) or a typed attention name and title.
 */
export class QuotationRecipientDto extends InvoiceCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  attentionName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  attentionTitle?: string;
}

export class QuotationSignatureDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(SIGNATURE_IMAGE_MAX_LENGTH, { message: 'Signature image is too large.' })
  @Matches(/^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/, {
    message: 'Signature must be a PNG or JPEG image.',
  })
  imageDataUrl?: string;
}

export class QuotationPayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;

  @ValidateNested()
  @Type(() => QuotationRecipientDto)
  recipient!: QuotationRecipientDto;

  @IsDateString({}, { message: 'Quotation date is not a valid date.' })
  issueDate!: string;

  @IsOptional()
  @IsDateString({}, { message: 'Valid until is not a valid date.' })
  validUntil?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  referenceNumber?: string;

  @IsOptional()
  @IsIn(TAX_MODES)
  taxMode?: 'EXCLUSIVE' | 'INCLUSIVE';

  @IsOptional()
  @IsIn(DOCUMENT_DISCOUNT_TYPES)
  discountType?: 'NONE' | 'PERCENT' | 'AMOUNT';

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  discountRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  terms?: string;

  @ValidateNested({ each: true })
  @Type(() => InvoiceItemDto)
  @ArrayMinSize(1, { message: 'Add at least one item.' })
  @ArrayMaxSize(100)
  items!: InvoiceItemDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => QuotationSignatureDto)
  signature?: QuotationSignatureDto;
}

export class QuotationStatusDto {
  @IsIn(QUOTATION_TARGET_STATUSES, { message: 'Unsupported quotation status.' })
  status!: (typeof QUOTATION_TARGET_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListQuotationsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['ALL', 'EXPIRED', ...QUOTATION_STATUSES])
  status?: (typeof QUOTATION_STATUSES)[number] | 'EXPIRED' | 'ALL';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;
}

/** A correction of a sent or accepted quotation: the full new content plus why. */
export class QuotationRevisionDto extends QuotationPayloadDto {
  @IsString()
  @MinLength(3, { message: 'Describe what was wrong (at least 3 characters).' })
  @MaxLength(500)
  reason!: string;
}
