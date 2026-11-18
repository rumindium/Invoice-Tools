import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsDateString,
  IsEmail,
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

export const DOCUMENT_DISCOUNT_TYPES = ['NONE', 'PERCENT', 'AMOUNT'] as const;
export const TAX_MODES = ['EXCLUSIVE', 'INCLUSIVE'] as const;
export const INVOICE_STATUSES = [
  'DRAFT',
  'ISSUED',
  'PARTIALLY_PAID',
  'PAID',
  'OVERDUE',
  'VOID',
] as const;

export class InvoiceItemDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  catalogItemId?: string;

  @IsString()
  @MinLength(1, { message: 'Item description is required.' })
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0.0001, { message: 'Quantity must be greater than zero.' })
  @Max(1_000_000)
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0, { message: 'Unit price cannot be negative.' })
  @Max(1_000_000_000_000)
  unitPrice!: number;

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  taxRate?: number;
}

export class InvoiceCustomerDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  contactId?: string;

  @IsString()
  @MinLength(2, { message: 'Customer name minimal 2 karakter.' })
  @MaxLength(160)
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email tidak valid.' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  phone?: string;
}

export class InvoicePayloadDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  companyId?: string;

  @ValidateNested()
  @Type(() => InvoiceCustomerDto)
  customer!: InvoiceCustomerDto;

  @IsDateString({}, { message: 'Invoice date tidak valid.' })
  issueDate!: string;

  @IsOptional()
  @IsDateString({}, { message: 'Due date tidak valid.' })
  dueDate?: string;

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
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  shippingAmount?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  additionalCharges?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  chargesTaxRate?: number;

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
}

export class ChangeStatusDto {
  @IsIn(['ISSUED', 'PAID', 'VOID'], { message: 'Unsupported invoice status.' })
  status!: 'ISSUED' | 'PAID' | 'VOID';

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class ListDocumentsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @IsIn(['ALL', ...INVOICE_STATUSES])
  status?: (typeof INVOICE_STATUSES)[number] | 'ALL';

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
