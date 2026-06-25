import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateOrderItemDto {
  @ApiProperty()
  @IsString()
  sectorId: string;

  @ApiProperty({ minimum: 1, maximum: 2 })
  @IsInt()
  @Min(1)
  @Max(2)
  qty: number;

  @ApiPropertyOptional({
    description: 'Lote específico (combo). Se ausente, resolve o avulso ativo.',
  })
  @IsOptional()
  @IsString()
  batchId?: string;
}

export class CreateOrderDto {
  @ApiProperty()
  @IsString()
  eventSlug: string;

  @ApiProperty({ type: [CreateOrderItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items: CreateOrderItemDto[];
}
