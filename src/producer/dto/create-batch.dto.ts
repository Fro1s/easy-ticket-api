import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString, IsInt, IsOptional, IsString, Length, Min,
} from 'class-validator';

export class CreateBatchDto {
  @ApiProperty() @IsString() @Length(1, 80)
  name: string;

  @ApiProperty() @IsInt() @Min(0)
  priceCents: number;

  @ApiProperty() @IsInt() @Min(1)
  capacity: number;

  @ApiProperty() @IsInt() @Min(0)
  sortOrder: number;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional() @IsOptional() @IsDateString()
  endsAt?: string;
}
