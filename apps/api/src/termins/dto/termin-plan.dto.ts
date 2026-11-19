import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { InvoicePayloadDto } from '../../documents/dto/invoice.dto';
import { MAX_TERMINS, MIN_TERMINS } from '../termin-math';

export const TERMIN_GENERATE_OPTIONS = ['FIRST', 'ALL'] as const;
export type TerminGenerateOption = (typeof TERMIN_GENERATE_OPTIONS)[number];

/** Percentages of the termins, in order, and which termins to generate right away. */
export class TerminSplitDto {
  @IsArray()
  @ArrayMinSize(MIN_TERMINS, { message: `Split into at least ${MIN_TERMINS} termins.` })
  @ArrayMaxSize(MAX_TERMINS, { message: `Split into at most ${MAX_TERMINS} termins.` })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { each: true, message: 'Each termin percentage must be a number with at most two decimals.' },
  )
  @Min(0, { each: true, message: 'A termin percentage cannot be below 0%.' })
  @Max(100, { each: true, message: 'A termin percentage cannot exceed 100%.' })
  percentages!: number[];

  @IsIn(TERMIN_GENERATE_OPTIONS, { message: 'Generate the first termin or all termins.' })
  generate!: TerminGenerateOption;
}

export class QuotationTerminPlanDto extends TerminSplitDto {
  @IsString()
  @MinLength(1, { message: 'Choose the accepted quotation to receive.' })
  @MaxLength(40)
  quotationId!: string;
}

export class GoodsReceiptTerminPlanDto extends TerminSplitDto {
  @IsString()
  @MinLength(1, { message: 'Choose the received goods receipt to invoice.' })
  @MaxLength(40)
  goodsReceiptId!: string;
}

export class InvoiceTerminPlanDto extends TerminSplitDto {
  @ValidateNested()
  @Type(() => InvoicePayloadDto)
  invoice!: InvoicePayloadDto;
}

export class UpdateTerminPlanDto {
  @IsArray()
  @ArrayMinSize(MIN_TERMINS, { message: `Split into at least ${MIN_TERMINS} termins.` })
  @ArrayMaxSize(MAX_TERMINS, { message: `Split into at most ${MAX_TERMINS} termins.` })
  @Type(() => Number)
  @IsNumber(
    { maxDecimalPlaces: 2, allowNaN: false, allowInfinity: false },
    { each: true, message: 'Each termin percentage must be a number with at most two decimals.' },
  )
  @Min(0, { each: true, message: 'A termin percentage cannot be below 0%.' })
  @Max(100, { each: true, message: 'A termin percentage cannot exceed 100%.' })
  percentages!: number[];
}
