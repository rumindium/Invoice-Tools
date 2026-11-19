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
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { GOODS_RECEIPT_STATUSES, GOODS_RECEIPT_TARGET_STATUSES } from '../goods-receipt-status';

export class CreateGoodsReceiptDto {
  @IsString()
  @MinLength(1, { message: 'Choose the accepted quotation to receive.' })
  @MaxLength(40)
  quotationId!: string;
}

export class GoodsReceiptLineDto {
  @IsString()
  @MaxLength(40)
  id!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'Received quantity cannot be negative.' })
  @Max(1_000_000)
  receivedQuantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'Rejected quantity cannot be negative.' })
  @Max(1_000_000)
  rejectedQuantity!: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  remarks?: string;
}

/** Header details and per-line counts of a draft receipt; lines always come from the quotation. */
export class UpdateGoodsReceiptDto {
  @IsDateString({}, { message: 'Receipt date is not a valid date.' })
  receiptDate!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveryNoteNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  carrier?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  vehicleNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  receivingLocation?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  deliveredByName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receivedByName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  receivedByTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  checkedByName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ValidateNested({ each: true })
  @Type(() => GoodsReceiptLineDto)
  @ArrayMinSize(1, { message: 'A goods receipt needs at least one line.' })
  @ArrayMaxSize(100)
  lines!: GoodsReceiptLineDto[];
}

export class GoodsReceiptStatusDto {
  @IsIn(GOODS_RECEIPT_TARGET_STATUSES, { message: 'Unsupported goods receipt status.' })
  status!: (typeof GOODS_RECEIPT_TARGET_STATUSES)[number];

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListGoodsReceiptsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['ALL', ...GOODS_RECEIPT_STATUSES])
  status?: (typeof GOODS_RECEIPT_STATUSES)[number] | 'ALL';

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

/** A correction of a received goods receipt: the new details and counts plus why. */
export class GoodsReceiptRevisionDto extends UpdateGoodsReceiptDto {
  @IsString()
  @MinLength(3, { message: 'Describe what was wrong (at least 3 characters).' })
  @MaxLength(500)
  reason!: string;
}
