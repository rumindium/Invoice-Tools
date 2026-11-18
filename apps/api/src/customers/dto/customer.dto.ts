import { Type } from 'class-transformer';
import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const CUSTOMER_TYPES = ['BUSINESS', 'INDIVIDUAL'] as const;

export class CustomerInputDto {
  @IsOptional()
  @IsIn(CUSTOMER_TYPES, { message: 'Customer type tidak dikenal.' })
  type?: 'BUSINESS' | 'INDIVIDUAL';

  @IsString()
  @MinLength(2, { message: 'Nama customer minimal 2 karakter.' })
  @MaxLength(160, { message: 'Nama customer maksimal 160 karakter.' })
  name!: string;

  @IsOptional()
  @IsEmail({}, { message: 'Email tidak valid.' })
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'Phone maksimal 40 karakter.' })
  phone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, { message: 'Address maksimal 400 karakter.' })
  address?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Notes maksimal 1000 karakter.' })
  notes?: string;
}

export class CustomerContactDto {
  @IsString()
  @MinLength(2, { message: 'Nama PIC minimal 2 karakter.' })
  @MaxLength(120, { message: 'Nama PIC maksimal 120 karakter.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(120, { message: 'Jabatan maksimal 120 karakter.' })
  jobTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40, { message: 'No telp maksimal 40 karakter.' })
  phone?: string;
}

export class ListCustomersQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pageSize?: number;
}
