import { ApiProperty } from '@nestjs/swagger';
import { Category } from '../../common/enums/category.enum';
import { EventStatus } from '../../common/enums/event-status.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PixKeyType } from '../../common/enums/pix-key-type.enum';

export class ProducerEventVenue {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
}

export class ProducerEventSectorSummary {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() colorHex: string;
  @ApiProperty() priceCents: number;
  @ApiProperty() capacity: number;
  @ApiProperty() sold: number;
  @ApiProperty() reserved: number;
  @ApiProperty() sortOrder: number;
}

export class ProducerEventKpis {
  @ApiProperty() ticketsSold: number;
  @ApiProperty() grossRevenueCents: number;
  @ApiProperty() platformFeeCents: number;
  @ApiProperty() netCents: number;
  @ApiProperty() pendingManualOrdersCount: number;
}

export class ProducerEventSummary {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() artist: string;
  @ApiProperty({ enum: Category }) category: Category;
  @ApiProperty({ enum: EventStatus }) status: EventStatus;
  @ApiProperty() startsAt: string;
  @ApiProperty() doorsAt: string;
  @ApiProperty() posterUrl: string;
  @ApiProperty({ enum: PaymentProvider }) paymentProvider: PaymentProvider;
  @ApiProperty() platformFeeRate: number;
  @ApiProperty({ type: ProducerEventVenue }) venue: ProducerEventVenue;
  @ApiProperty({ type: ProducerEventKpis }) kpis: ProducerEventKpis;
}

export class ProducerEventDetail extends ProducerEventSummary {
  @ApiProperty({ nullable: true, type: String }) description: string | null;
  @ApiProperty() ageRating: number;
  @ApiProperty({ nullable: true, type: String }) pixKey: string | null;
  @ApiProperty({ nullable: true, enum: PixKeyType })
  pixKeyType: PixKeyType | null;
  @ApiProperty({ nullable: true, type: String })
  pixHolderName: string | null;
  @ApiProperty({ type: [ProducerEventSectorSummary] })
  sectors: ProducerEventSectorSummary[];
}

export class ProducerEventListResponse {
  @ApiProperty({ type: [ProducerEventSummary] })
  items: ProducerEventSummary[];
}

export class ProducerDashboardResponse {
  @ApiProperty({ type: [ProducerEventSummary] })
  events: ProducerEventSummary[];
  @ApiProperty() totalTicketsSold: number;
  @ApiProperty() totalGrossRevenueCents: number;
  @ApiProperty() totalPlatformFeeCents: number;
  @ApiProperty() totalNetCents: number;
  @ApiProperty() totalPendingManualOrders: number;
}
