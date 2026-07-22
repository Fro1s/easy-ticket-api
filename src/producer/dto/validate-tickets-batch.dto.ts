import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsString,
  ValidateNested,
} from 'class-validator';

export class BatchValidationItemDto {
  @ApiProperty()
  @IsString()
  ticketId: string;

  @ApiProperty({ description: 'ISO timestamp do momento do scan no device' })
  @IsISO8601()
  validatedAt: string;
}

export class ValidateTicketsBatchDto {
  @ApiProperty()
  @IsString()
  eventId: string;

  @ApiProperty({ type: [BatchValidationItemDto] })
  @IsArray()
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => BatchValidationItemDto)
  items: BatchValidationItemDto[];
}

export class BatchValidationResultItem {
  @ApiProperty() ticketId: string;
  @ApiProperty() ok: boolean;
  @ApiProperty({ required: false }) reason?: string;
  @ApiProperty({ required: false }) usedAt?: string;
}

export class ValidateTicketsBatchResponse {
  @ApiProperty({ type: [BatchValidationResultItem] })
  results: BatchValidationResultItem[];
}
