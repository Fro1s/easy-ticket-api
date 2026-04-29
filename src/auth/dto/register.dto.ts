import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, Length, Matches, MinLength } from 'class-validator';

export class RegisterDto {
  @ApiProperty({ example: 'maria.silva@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiProperty({ example: '12345678900', description: 'CPF, digits only' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf: string;

  @ApiProperty({ example: '+5511998765432' })
  @IsString()
  @Length(10, 32)
  phone: string;

  @ApiProperty({ example: 'senhaSegura123' })
  @IsString()
  @MinLength(8)
  password: string;
}
