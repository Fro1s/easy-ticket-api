import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ReassignEventDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  producerId: string;
}
