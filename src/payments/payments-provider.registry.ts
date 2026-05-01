import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { ManualPixProvider } from './providers/manual-pix.provider';
import { AbacatePayProvider } from './providers/abacatepay.provider';
import { PaymentsProvider } from './payments.types';

@Injectable()
export class PaymentsProviderRegistry {
  private readonly providers: Map<PaymentProvider, PaymentsProvider>;

  constructor(
    manualPix: ManualPixProvider,
    abacate: AbacatePayProvider,
  ) {
    this.providers = new Map<PaymentProvider, PaymentsProvider>([
      [PaymentProvider.MANUAL_PIX, manualPix],
      [PaymentProvider.ABACATE_PAY, abacate],
    ]);
  }

  resolve(key: PaymentProvider): PaymentsProvider {
    const provider = this.providers.get(key);
    if (!provider) {
      throw new NotFoundException(
        `payment provider ${key} is not implemented`,
      );
    }
    return provider;
  }
}
