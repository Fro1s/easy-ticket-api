import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateTicketDto {
  @ApiProperty({ description: 'QR token from the ticket (et:<orderId>:<cuid>)' })
  @IsString()
  @IsNotEmpty()
  qrToken: string;
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
