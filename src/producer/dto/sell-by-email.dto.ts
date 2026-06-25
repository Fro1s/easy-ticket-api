import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AttendeeDto } from '../../orders/dto/attendee.dto';

export class SellByEmailDto {
  @ApiProperty({ example: 'maria.silva@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Sector id within this event' })
  @IsString()
  sectorId: string;

  @ApiProperty({
    required: false,
    description:
      'Optional batch id. Producer/admin sales can target private batches.',
  })
  @IsOptional()
  @IsString()
  batchId?: string;

  @ApiProperty({ minimum: 1, maximum: 6 })
  @IsInt()
  @Min(1)
  @Max(6)
  qty: number;

  @ApiProperty({ required: false, example: 'Maria Silva' })
  @IsOptional()
  @IsString()
  @Length(2, 160)
  buyerName?: string;

  @ApiProperty({
    required: false,
    description:
      'When true (default), order is created and marked PAID immediately.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  markPaid?: boolean;

  @ApiPropertyOptional({
    type: [AttendeeDto],
    description:
      'Required when batch is a combo (ticketsPerUnit > 1). One entry per emitted ticket (qty × ticketsPerUnit).',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees?: AttendeeDto[];
}

export class SellByEmailResponse {
  @ApiProperty() orderId: string;
  @ApiProperty() status: string;
  @ApiProperty() ticketIds: string[];
  @ApiProperty() ghostUserCreated: boolean;
  @ApiProperty() emailSent: boolean;
  @ApiProperty({ nullable: true, type: String }) claimUrl: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description:
      'PIX BR-Code copy-paste (only when markPaid=false and provider=MANUAL_PIX). Useful for in-person sales.',
  })
  pixCopyPaste: string | null;
  @ApiProperty({ nullable: true, type: Number })
  totalCents: number | null;
}
