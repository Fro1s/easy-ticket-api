import { ApiProperty } from '@nestjs/swagger';

export class AdminProducerUser {
  @ApiProperty() id: string;
  @ApiProperty({ nullable: true, type: String }) name: string | null;
  @ApiProperty() email: string;
  @ApiProperty() createdAt: string;
}

export class AdminProducerItem {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty({ nullable: true, type: String }) cnpj: string | null;
  @ApiProperty() eventCount: number;
  @ApiProperty({ type: [AdminProducerUser] }) users: AdminProducerUser[];
}

export class AdminProducersResponse {
  @ApiProperty({ type: [AdminProducerItem] })
  items: AdminProducerItem[];
}

export class ReassignEventResult {
  @ApiProperty() id: string;
  @ApiProperty() producerId: string;
}
