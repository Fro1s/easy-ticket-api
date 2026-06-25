import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, ValidateIf } from 'class-validator';

export class ValidateTicketDto {
  @ApiPropertyOptional({
    description: 'QR token from the ticket (et:<orderId>:<cuid>)',
  })
  @ValidateIf((o: ValidateTicketDto) => !o.ticketId && !o.shortCode)
  @IsString()
  qrToken?: string;

  @ApiPropertyOptional({
    description: 'Ticket id (manual validation from panel)',
  })
  @IsOptional()
  @IsString()
  ticketId?: string;

  @ApiPropertyOptional({ description: 'Ticket short code, e.g. ET-XXXXXXXXX' })
  @IsOptional()
  @IsString()
  shortCode?: string;
}

export class ValidateTicketSuccessTicket {
  @ApiProperty() shortCode: string;
  @ApiProperty() sectorName: string;
  @ApiProperty() sectorColor: string;
  @ApiProperty() holderFirstName: string;
  @ApiProperty() validatedAt: string;
}

export class ValidateTicketResponse {
  @ApiProperty() ok: boolean;
  @ApiPropertyOptional({ type: ValidateTicketSuccessTicket })
  ticket?: ValidateTicketSuccessTicket;
}
