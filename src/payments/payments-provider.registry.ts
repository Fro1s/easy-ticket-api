import { Injectable, NotFoundException } from '@nestjs/common';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { ManualPixProvider } from './providers/manual-pix.provider';
import { MockPaymentsProvider } from './providers/mock-payments.provider';
import { PaymentsProvider } from './payments.types';

@Injectable()
export class PaymentsProviderRegistry {
  private readonly providers: Map<PaymentProvider, PaymentsProvider>;

  constructor(
    manualPix: ManualPixProvider,
    mock: MockPaymentsProvider,
  ) {
    this.providers = new Map<PaymentProvider, PaymentsProvider>([
      [PaymentProvider.MANUAL_PIX, manualPix],
      // Until AbacatePayProvider lands (PR 5), the mock fills its slot so
      // existing dev seed events keep working.
      [PaymentProvider.ABACATE_PAY, mock],
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
