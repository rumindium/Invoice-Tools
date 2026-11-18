import { IsEmail, MaxLength } from 'class-validator';

export class EmailOnlyDto {
  @IsEmail({}, { message: 'Email tidak valid.' })
  @MaxLength(254)
  email!: string;
}
