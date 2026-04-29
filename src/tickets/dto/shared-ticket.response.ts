import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../common/enums/category.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';

export class SharedTicketEvent {
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() artist: string;
  @ApiProperty({ enum: Category }) category: Category;
  @ApiProperty() startsAt: string;
  @ApiProperty() doorsAt: string;
  @ApiProperty() posterUrl: string;
  @ApiProperty() venueName: string;
  @ApiProperty() venueCity: string;
  @ApiProperty() venueState: string;
}

export class SharedTicketSector {
  @ApiProperty() name: string;
  @ApiProperty() colorHex: string;
}

export class SharedTicketResponse {
  @ApiProperty() shortCode: string;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
  @ApiProperty() holderFirstName: string;
  @ApiProperty({ type: SharedTicketEvent }) event: SharedTicketEvent;
  @ApiProperty({ type: SharedTicketSector }) sector: SharedTicketSector;
}
