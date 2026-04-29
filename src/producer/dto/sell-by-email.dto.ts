import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';

export class SellByEmailDto {
  @ApiProperty({ example: 'maria.silva@gmail.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ description: 'Sector id within this event' })
  @IsString()
  sectorId: string;

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
    description: 'When true (default), order is created and marked PAID immediately.',
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  markPaid?: boolean;
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
    description: 'PIX BR-Code copy-paste (only when markPaid=false and provider=MANUAL_PIX). Useful for in-person sales.',
  })
  pixCopyPaste: string | null;
  @ApiProperty({ nullable: true, type: Number })
  totalCents: number | null;
}
