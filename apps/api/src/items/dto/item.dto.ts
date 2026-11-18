import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export const ITEM_KINDS = ['PRODUCT', 'SERVICE'] as const;

export class ItemInputDto {
  @IsOptional()
  @IsIn(ITEM_KINDS, { message: 'Item kind tidak dikenal.' })
  kind?: 'PRODUCT' | 'SERVICE';

  @IsString()
  @MinLength(2, { message: 'Nama item minimal 2 karakter.' })
  @MaxLength(160, { message: 'Nama item maksimal 160 karakter.' })
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Deskripsi maksimal 1000 karakter.' })
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Harga harus berupa angka.' })
  @Min(0, { message: 'Harga tidak boleh negatif.' })
  @Max(1_000_000_000_000)
  unitPrice!: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class ListItemsQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
