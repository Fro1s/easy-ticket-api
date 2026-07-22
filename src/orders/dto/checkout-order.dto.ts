import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class CheckoutOrderDto {
  @ApiProperty({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  method: PaymentMethod;

  @ApiProperty({
    required: false,
    description: 'WhatsApp com DDD para receber os ingressos (opcional)',
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  phone?: string;
}
