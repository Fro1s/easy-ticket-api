import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';

export interface ProcessingFeeConfig {
  pixFixedCents: number;
  cardPercent: number;
  cardFixedCents: number;
}

export interface CalcInput {
  provider: PaymentProvider;
  method: PaymentMethod;
  subtotalCents: number;
  config: ProcessingFeeConfig;
}

export function calculateProcessingFeeCents(input: CalcInput): number {
  if (input.provider !== PaymentProvider.ABACATE_PAY) return 0;
  if (input.method === PaymentMethod.PIX) return input.config.pixFixedCents;
  if (input.method === PaymentMethod.CARD) {
    return Math.round(input.subtotalCents * (input.config.cardPercent / 100)) + input.config.cardFixedCents;
  }
  return 0;
}
