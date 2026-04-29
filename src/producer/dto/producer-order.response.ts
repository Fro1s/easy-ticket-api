import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class ProducerOrderItem {
  @ApiProperty() id: string;
  @ApiProperty() shortId: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() buyerEmail: string;
  @ApiProperty({ nullable: true, type: String }) buyerName: string | null;
  @ApiProperty() qty: number;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() feeCents: number;
  @ApiProperty() totalCents: number;
  @ApiProperty({ enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;
  @ApiProperty() createdAt: string;
  @ApiProperty({ nullable: true, type: String }) paidAt: string | null;
  @ApiProperty() reservedUntil: string;
  @ApiProperty() isManualPending: boolean;
}

export class ProducerOrdersResponse {
  @ApiProperty({ type: [ProducerOrderItem] })
  items: ProducerOrderItem[];
  @ApiProperty() total: number;
  @ApiProperty() page: number;
  @ApiProperty() pageSize: number;
}
