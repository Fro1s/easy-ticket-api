import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsDateString, IsInt, IsOptional, IsString, Length, Min, ValidateIf,
} from 'class-validator';

export class UpdateBatchDto {
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(1, 80)
  name?: string;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  priceCents?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1)
  capacity?: number;

  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;

  @ApiPropertyOptional()
  @IsOptional() @IsBoolean()
  producerOnly?: boolean;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  startsAt?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional() @ValidateIf((_, v) => v !== null) @IsDateString()
  endsAt?: string | null;
}
