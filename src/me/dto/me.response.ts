import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { Category } from '../../common/enums/category.enum';

export class MeProfile {
  @ApiProperty() id: string;
  @ApiProperty() email: string;
  @ApiProperty({ nullable: true, type: String }) name: string | null;
  @ApiProperty({ nullable: true, type: String }) cpf: string | null;
  @ApiProperty({ nullable: true, type: String }) phone: string | null;
  @ApiProperty() role: string;
  @ApiProperty() referralCode: string;
  @ApiProperty() createdAt: string;
  @ApiProperty() ticketCount: number;
  @ApiProperty() orderCount: number;
}

export class MyTicketEvent {
  @ApiProperty() id: string;
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

export class MyTicketSector {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() colorHex: string;
  @ApiProperty() priceCents: number;
}

export class MyTicketItem {
  @ApiProperty() id: string;
  @ApiProperty() shortCode: string;
  @ApiProperty() qrToken: string;
  @ApiProperty({ enum: TicketStatus }) status: TicketStatus;
  @ApiProperty() orderId: string;
  @ApiProperty({ nullable: true, type: String }) usedAt: string | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ type: MyTicketEvent }) event: MyTicketEvent;
  @ApiProperty({ type: MyTicketSector }) sector: MyTicketSector;
}

export class MyTicketsResponse {
  @ApiProperty({ type: [MyTicketItem] }) items: MyTicketItem[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}

export class MyOrderItemDetail {
  @ApiProperty() id: string;
  @ApiProperty() sectorId: string;
  @ApiProperty() sectorName: string;
  @ApiProperty() sectorColorHex: string;
  @ApiProperty() qty: number;
  @ApiProperty() priceCents: number;
}

export class MyOrderEvent {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() artist: string;
  @ApiProperty() startsAt: string;
  @ApiProperty() posterUrl: string;
  @ApiProperty() venueName: string;
  @ApiProperty() venueCity: string;
}

export class MyOrderItem {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() feeCents: number;
  @ApiProperty() discountCents: number;
  @ApiProperty() totalCents: number;
  @ApiProperty() createdAt: string;
  @ApiProperty({ nullable: true, type: String }) paidAt: string | null;
  @ApiProperty({ type: MyOrderEvent }) event: MyOrderEvent;
  @ApiProperty({ type: [MyOrderItemDetail] }) items: MyOrderItemDetail[];
}

export class MyOrdersResponse {
  @ApiProperty({ type: [MyOrderItem] }) items: MyOrderItem[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
