import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../common/enums/category.enum';
import { EventStatus } from '../../common/enums/event-status.enum';

export class EventBatchInfo {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() priceCents: number;
  @ApiProperty({ nullable: true, type: String }) startsAt: string | null;
  @ApiProperty({ nullable: true, type: String }) endsAt: string | null;
}

export class SectorResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() colorHex: string;
  @ApiProperty() capacity: number;
  @ApiProperty() sold: number;
  @ApiProperty() reserved: number;
  @ApiProperty() sortOrder: number;
  @ApiProperty({ type: EventBatchInfo, nullable: true })
  activeBatch: EventBatchInfo | null;
  @ApiProperty({ type: EventBatchInfo, nullable: true })
  nextBatch: EventBatchInfo | null;
}

export class VenueSummary {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
  @ApiProperty() capacity: number;
}

export class EventSummary {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() artist: string;
  @ApiProperty({ enum: Category }) category: Category;
  @ApiProperty() startsAt: string;
  @ApiProperty() doorsAt: string;
  @ApiProperty() posterUrl: string;
  @ApiProperty({ enum: EventStatus }) status: EventStatus;
  @ApiProperty() priceFromCents: number;
  @ApiProperty({ type: VenueSummary }) venue: VenueSummary;
}

export class EventDetail extends EventSummary {
  @ApiProperty() description: string;
  @ApiProperty() ageRating: number;
  @ApiProperty({ type: [SectorResponse] }) sectors: SectorResponse[];
  @ApiProperty({
    description: 'Per-event platform fee rate (0..1). 0 means no fee.',
    example: 0.025,
  })
  platformFeeRate: number;
}

export class EventListResponse {
  @ApiProperty({ type: [EventSummary] }) items: EventSummary[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class SectorAvailability {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() capacity: number;
  @ApiProperty() sold: number;
  @ApiProperty() reserved: number;
  @ApiProperty() available: number;
}

export class AvailabilityResponse {
  @ApiProperty() eventId: string;
  @ApiProperty({ type: [SectorAvailability] }) sectors: SectorAvailability[];
  @ApiProperty() fetchedAt: string;
}
