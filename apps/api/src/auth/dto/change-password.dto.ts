import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: 'Password saat ini wajib diisi.' })
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(128, { message: 'Password maksimal 128 karakter.' })
  newPassword!: string;
}
