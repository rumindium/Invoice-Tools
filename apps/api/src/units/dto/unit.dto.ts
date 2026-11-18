import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class UnitInputDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1, { message: 'Nama satuan wajib diisi.' })
  @MaxLength(20, { message: 'Nama satuan maksimal 20 karakter.' })
  name!: string;
}
