import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, Matches, ValidateIf } from 'class-validator';
import { normalizeCpf } from '../../users/lib/normalize-cpf';

export class TransferTicketDto {
  @ApiPropertyOptional({
    example: 'destinatario@gmail.com',
    description: 'Email do destinatário. Obrigatório se cpf não for informado.',
  })
  @ValidateIf((o: TransferTicketDto) => !o.cpf)
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    example: '12345678900',
    description:
      'CPF do destinatário (com ou sem máscara). Obrigatório se email não for informado.',
  })
  @ValidateIf((o: TransferTicketDto) => !o.email)
  @Transform(({ value }) =>
    typeof value === 'string' ? normalizeCpf(value) : value,
  )
  @Matches(/^\d{11}$/, { message: 'cpf must be 11 digits' })
  cpf?: string;
}

export class TransferTicketResponse {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'ET-ABC123XYZ' }) shortCode: string;
  @ApiProperty({ example: 'VALID' }) status: string;
  @ApiProperty({ example: 'destinatario@gmail.com' }) recipientEmail: string;
}
