import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ConfirmManualPaymentDto {
  @ApiPropertyOptional({
    description:
      'Free-text reference left by the producer/admin who confirmed the manual PIX (e.g. "Pix 14:32 R$ 50 via Caixa")',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reference?: string;
}
