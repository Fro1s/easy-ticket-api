import { ApiProperty } from '@nestjs/swagger';

export class BatchResponse {
  @ApiProperty() id: string;
  @ApiProperty() sectorId: string;
  @ApiProperty() name: string;
  @ApiProperty() priceCents: number;
  @ApiProperty() capacity: number;
  @ApiProperty() sold: number;
  @ApiProperty() reserved: number;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ nullable: true, type: String }) startsAt: string | null;
  @ApiProperty({ nullable: true, type: String }) endsAt: string | null;
}

export class BatchListResponse {
  @ApiProperty({ type: [BatchResponse] })
  items: BatchResponse[];
}
