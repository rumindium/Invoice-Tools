import { Transform } from 'class-transformer';
import { IsDateString, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export const FOLLOW_UP_METHODS = [
  'EMAIL',
  'WHATSAPP',
  'PHONE',
  'MEETING',
  'VISIT',
  'OTHER',
] as const;
export const FOLLOW_UP_STATUSES = ['OPEN', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;

export type FollowUpMethod = (typeof FOLLOW_UP_METHODS)[number];
export type FollowUpStatus = (typeof FOLLOW_UP_STATUSES)[number];

function trim({ value }: { value: unknown }): unknown {
  return typeof value === 'string' ? value.trim() : value;
}

export class FollowUpInputDto {
  @Transform(trim)
  @IsString()
  @MinLength(2, { message: 'Activity minimal 2 karakter.' })
  @MaxLength(160, { message: 'Activity maksimal 160 karakter.' })
  activity!: string;

  @IsIn(FOLLOW_UP_METHODS, { message: 'Metode follow up tidak dikenal.' })
  method!: FollowUpMethod;

  @IsDateString({}, { message: 'Tanggal follow up tidak valid.' })
  followUpDate!: string;

  @Transform(trim)
  @IsString()
  @MinLength(1, { message: 'Feedback wajib diisi.' })
  @MaxLength(2000, { message: 'Feedback maksimal 2000 karakter.' })
  feedback!: string;

  @IsIn(FOLLOW_UP_STATUSES, { message: 'Status follow up tidak dikenal.' })
  status!: FollowUpStatus;

  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(1000, { message: 'Evidence maksimal 1000 karakter.' })
  evidence?: string;
}

export class FollowUpStatusDto {
  @IsIn(FOLLOW_UP_STATUSES, { message: 'Status follow up tidak dikenal.' })
  status!: FollowUpStatus;
}
