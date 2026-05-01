import { calculateProcessingFeeCents } from './calculate-processing-fee';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';

describe('calculateProcessingFeeCents', () => {
  const cfg = {
    pixFixedCents: 80,
    cardPercent: 3.5,
    cardFixedCents: 60,
  };

  it('returns 0 for MANUAL_PIX regardless of method', () => {
    expect(
      calculateProcessingFeeCents({
        provider: PaymentProvider.MANUAL_PIX,
        method: PaymentMethod.PIX,
        subtotalCents: 10_000,
        config: cfg,
      }),
    ).toBe(0);
  });

  it('returns 80 cents for ABACATE_PAY PIX regardless of subtotal', () => {
    expect(
      calculateProcessingFeeCents({
        provider: PaymentProvider.ABACATE_PAY,
        method: PaymentMethod.PIX,
        subtotalCents: 10_000,
        config: cfg,
      }),
    ).toBe(80);
    expect(
      calculateProcessingFeeCents({
        provider: PaymentProvider.ABACATE_PAY,
        method: PaymentMethod.PIX,
        subtotalCents: 1,
        config: cfg,
      }),
    ).toBe(80);
  });

  it('returns 3.5% + R$0.60 for ABACATE_PAY CARD', () => {
    // 10000 * 0.035 = 350; + 60 = 410
    expect(
      calculateProcessingFeeCents({
        provider: PaymentProvider.ABACATE_PAY,
        method: PaymentMethod.CARD,
        subtotalCents: 10_000,
        config: cfg,
      }),
    ).toBe(410);
  });

  it('rounds card percent to nearest cent', () => {
    // 9999 * 0.035 = 349.965 → rounds to 350; + 60 = 410
    expect(
      calculateProcessingFeeCents({
        provider: PaymentProvider.ABACATE_PAY,
        method: PaymentMethod.CARD,
        subtotalCents: 9999,
        config: cfg,
      }),
    ).toBe(410);
  });
});
