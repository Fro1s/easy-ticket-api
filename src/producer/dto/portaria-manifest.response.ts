import { ApiProperty } from '@nestjs/swagger';

export class PortariaManifestTicket {
  @ApiProperty() ticketId: string;
  @ApiProperty({ description: 'sha256 hex do qrToken' }) qrTokenHash: string;
  @ApiProperty() shortCode: string;
  @ApiProperty() sectorName: string;
  @ApiProperty({ nullable: true, type: String }) batchName: string | null;
  @ApiProperty() sectorColor: string;
  @ApiProperty() holderFirstName: string;
  @ApiProperty({ description: 'VALID | USED | outros TicketStatus' })
  status: string;
  @ApiProperty({ nullable: true, type: String }) usedAt: string | null;
}

export class PortariaManifestResponse {
  @ApiProperty() eventId: string;
  @ApiProperty() generatedAt: string;
  @ApiProperty({ type: [PortariaManifestTicket] })
  tickets: PortariaManifestTicket[];
}
