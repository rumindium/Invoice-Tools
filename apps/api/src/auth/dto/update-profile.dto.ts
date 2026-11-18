import { IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter.' })
  @MaxLength(80, { message: 'Nama maksimal 80 karakter.' })
  displayName!: string;
}
