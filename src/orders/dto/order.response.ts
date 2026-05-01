import { ApiProperty } from '@nestjs/swagger';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

export class OrderEventResponse {
  @ApiProperty() id: string;
  @ApiProperty() slug: string;
  @ApiProperty() title: string;
  @ApiProperty() artist: string;
  @ApiProperty() startsAt: string;
  @ApiProperty() doorsAt: string;
  @ApiProperty() posterUrl: string;
  @ApiProperty() venueName: string;
  @ApiProperty() venueCity: string;
  @ApiProperty() venueState: string;
}

export class OrderItemResponse {
  @ApiProperty() id: string;
  @ApiProperty() sectorId: string;
  @ApiProperty() sectorName: string;
  @ApiProperty() sectorColorHex: string;
  @ApiProperty() qty: number;
  @ApiProperty() priceCents: number;
}

export class OrderPaymentInfo {
  @ApiProperty() provider: string;
  @ApiProperty() paymentId: string;
  @ApiProperty({ enum: PaymentMethod }) method: PaymentMethod;
  @ApiProperty() status: 'PENDING' | 'PAID' | 'EXPIRED' | 'FAILED';
  @ApiProperty({ nullable: true, type: String }) copyPaste: string | null;
  @ApiProperty() expiresAt: string;
  /** Server-derived: cents discounted from total when paying via Pix. */
  @ApiProperty() pixDiscountCents: number;
  @ApiProperty({ nullable: true, description: 'Redirect URL for hosted-checkout flows (card via AbacatePay). Null for inline PIX.' })
  redirectUrl!: string | null;
}

export class OrderResponse {
  @ApiProperty() id: string;
  @ApiProperty({ enum: OrderStatus }) status: OrderStatus;
  @ApiProperty() subtotalCents: number;
  @ApiProperty() feeCents: number;
  @ApiProperty() discountCents: number;
  @ApiProperty() totalCents: number;
  @ApiProperty({ enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;
  @ApiProperty() reservedUntil: string;
  @ApiProperty() createdAt: string;
  @ApiProperty({ nullable: true, type: String }) paidAt: string | null;
  @ApiProperty({ type: OrderEventResponse }) event: OrderEventResponse;
  @ApiProperty({ type: [OrderItemResponse] }) items: OrderItemResponse[];
  @ApiProperty({ nullable: true, type: OrderPaymentInfo })
  payment: OrderPaymentInfo | null;
  @ApiProperty({ description: 'Taxa de processamento (PSP) em centavos. Zero para MANUAL_PIX/sell-by-email.' })
  processingFeeCents!: number;

  @ApiProperty({ enum: PaymentMethod, nullable: true, description: 'Método que originou a taxa de processamento, se aplicável.' })
  processingFeeMethod!: PaymentMethod | null;

  /** Server estimate of how much the buyer would pay at competitors. */
  @ApiProperty() competitorTotalCents: number;
  @ApiProperty() savingsCents: number;
}

export class ConfirmedOrderResponse extends OrderResponse {
  @ApiProperty({ type: [String] }) ticketIds: string[];
}
