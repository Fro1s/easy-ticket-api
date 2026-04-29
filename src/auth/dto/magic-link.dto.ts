import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class MagicLinkDto {
  @ApiProperty({ example: 'maria.silva@gmail.com' })
  @IsEmail()
  email: string;
}
