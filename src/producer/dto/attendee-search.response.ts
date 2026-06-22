import { ApiProperty } from '@nestjs/swagger';
import { TicketStatus } from '../../common/enums/ticket-status.enum';

export class AttendeeSearchItem {
  @ApiProperty() ticketId: string;
  @ApiProperty() shortCode: string;
  @ApiProperty({ nullable: true, type: String }) holderName: string | null;
  @ApiProperty({ nullable: true, type: String }) holderEmail: string | null;
  @ApiProperty({ nullable: true, type: String }) buyerName: string | null;
  @ApiProperty() buyerEmail: string;
  @ApiProperty() sectorName: string;
  @ApiProperty({ nullable: true, type: String }) batchName: string | null;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
  @ApiProperty({ nullable: true, type: String }) usedAt: string | null;
}

export class AttendeeSearchResponse {
  @ApiProperty({ type: [AttendeeSearchItem] })
  items: AttendeeSearchItem[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
