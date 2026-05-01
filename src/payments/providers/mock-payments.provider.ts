import { Injectable } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import {
  CreatePaymentInput,
  PaymentChargeInfo,
  PaymentsProvider,
} from '../payments.types';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

const TTL_MINUTES_BY_METHOD: Record<PaymentMethod, number> = {
  PIX: 30,
  CARD: 5,
};

/**
 * Stub provider that returns deterministic-looking values without hitting any
 * external API. Will be replaced by AbacatePayProvider in Phase 4.5+.
 */
@Injectable()
export class MockPaymentsProvider implements PaymentsProvider {
  readonly name = 'mock';

  async createCharge(input: CreatePaymentInput): Promise<PaymentChargeInfo> {
    const id = `mock_${createId()}`;
    const ttlMin = TTL_MINUTES_BY_METHOD[input.method];
    const expiresAt = new Date(Date.now() + ttlMin * 60_000).toISOString();

    let copyPaste: string | null = null;
    if (input.method === PaymentMethod.PIX) {
      // Simulate a Pix EMV-style payload — frontend renders this as QR.
      copyPaste = `00020126360014BR.GOV.BCB.PIX0114${id}5204000053039865802BR5912EASY TICKET6009SAO PAULO62${pad(input.orderId.slice(0, 8))}6304${randomDigits(4)}|TOTAL=${input.totalCents}`;
    }

    return {
      provider: this.name,
      paymentId: id,
      method: input.method,
      status: 'PENDING',
      copyPaste,
      expiresAt,
    };
  }
}

function pad(s: string): string {
  return `${s}`.padStart(2, '0');
}

function randomDigits(n: number): string {
  let out = '';
  for (let i = 0; i < n; i++) out += Math.floor(Math.random() * 10).toString();
  return out;
}
