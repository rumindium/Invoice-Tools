import { Type } from 'class-transformer';
import {
  IsEmail,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CompanyInputDto {
  @IsString()
  @MinLength(2, { message: 'Company name minimal 2 karakter.' })
  @MaxLength(160, { message: 'Company name maksimal 160 karakter.' })
  legalName!: string;

  @IsOptional()
  @IsString()
  @MaxLength(160)
  displayName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(400, { message: 'Address maksimal 400 karakter.' })
  address?: string;

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
  @MaxLength(200)
  website?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  taxId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxLabel?: string;

  @IsOptional()
  @Matches(/^[A-Z]{3}$/, { message: 'Currency harus kode ISO tiga huruf.' })
  defaultCurrency?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(100)
  defaultTaxRate?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(365)
  defaultPaymentTermDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  footerText?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatoryName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signatoryTitle?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000_000, { message: 'Logo terlalu besar.' })
  logoDataUrl?: string;
}
