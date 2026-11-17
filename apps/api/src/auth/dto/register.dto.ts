import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  @MaxLength(254)
  email!: string;

  @IsString()
  @MinLength(2, { message: 'Nama minimal 2 karakter.' })
  @MaxLength(80, { message: 'Nama maksimal 80 karakter.' })
  displayName!: string;

  @IsString()
  @MinLength(8, { message: 'Password minimal 8 karakter.' })
  @MaxLength(128, { message: 'Password maksimal 128 karakter.' })
  password!: string;
}
