import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches, MinLength } from 'class-validator';

export class ClaimDto {
  @ApiProperty({ description: 'Claim token from sell-by-email message' })
  @IsString()
  @Length(8, 96)
  token: string;

  @ApiProperty({ example: 'Maria Silva' })
  @IsString()
  @Length(2, 160)
  name: string;

  @ApiProperty({ example: '12345678900' })
  @IsString()
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf: string;

  @ApiProperty({ example: '+5511998765432' })
  @IsString()
  @Length(10, 32)
  phone: string;

  @ApiProperty({ example: 'senhaSegura1' })
  @IsString()
  @MinLength(8)
  password: string;
}

export class ConsumeMagicLinkDto {
  @ApiProperty()
  @IsString()
  @Length(8, 96)
  token: string;
}
