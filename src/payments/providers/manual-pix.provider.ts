import { BadRequestException, Injectable } from '@nestjs/common';
import {
  CreatePaymentInput,
  PaymentChargeInfo,
  PaymentsProvider,
} from '../payments.types';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { buildPixBrCode } from '../lib/build-pix-brcode';

const EXPIRES_IN_MS = 30 * 60_000;

/**
 * Generates a static BR-Code (PIX copy-paste) using the event's configured PIX
 * key. Confirmation is manual via /producer/orders/:id/confirm-manual-payment.
 */
@Injectable()
export class ManualPixProvider implements PaymentsProvider {
  readonly name = 'MANUAL_PIX';

  async createCharge(input: CreatePaymentInput): Promise<PaymentChargeInfo> {
    if (input.method !== PaymentMethod.PIX) {
      throw new BadRequestException(
        'manual provider only supports PIX payments',
      );
    }
    const event = input.event;
    if (!event.pixKey) {
      throw new BadRequestException('event has no PIX key configured');
    }

    const copyPaste = buildPixBrCode({
      key: event.pixKey,
      keyType: event.pixKeyType,
      holderName: event.pixHolderName ?? 'EASY TICKET',
      city: event.venueCity ?? 'SAO PAULO',
      amountCents: input.totalCents,
      txid: input.orderId,
    });

    return {
      provider: this.name,
      paymentId: `manual_${input.orderId}`,
      method: PaymentMethod.PIX,
      status: 'PENDING',
      copyPaste,
      expiresAt: new Date(Date.now() + EXPIRES_IN_MS).toISOString(),
    };
  }
}
