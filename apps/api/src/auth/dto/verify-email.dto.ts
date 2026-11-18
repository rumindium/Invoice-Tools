import { IsString, MaxLength, MinLength } from 'class-validator';

export class VerifyEmailDto {
  @IsString()
  @MinLength(16, { message: 'Tautan tidak valid atau sudah kedaluwarsa.' })
  @MaxLength(200, { message: 'Tautan tidak valid atau sudah kedaluwarsa.' })
  token!: string;
}
