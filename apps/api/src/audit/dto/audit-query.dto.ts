import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export const AUDIT_TARGET_TYPES = [
  'user',
  'invoice',
  'customer',
  'item',
  'unit',
  'company',
] as const;

export type AuditTargetType = (typeof AUDIT_TARGET_TYPES)[number];

export class ListAuditQueryDto {
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

  @IsOptional()
  @IsIn(['ALL', ...AUDIT_TARGET_TYPES], { message: 'Kategori audit tidak dikenal.' })
  targetType?: AuditTargetType | 'ALL';

  @IsOptional()
  @IsString()
  @MaxLength(120)
  search?: string;
}
