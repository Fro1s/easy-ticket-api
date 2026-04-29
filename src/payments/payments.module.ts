import { Module } from '@nestjs/common';
import { MockPaymentsProvider } from './providers/mock-payments.provider';
import { ManualPixProvider } from './providers/manual-pix.provider';
import { PaymentsProviderRegistry } from './payments-provider.registry';

// Kept for backward-compat with anything still injecting the symbol token.
// New code should depend on PaymentsProviderRegistry directly.
export const PAYMENTS_PROVIDER = Symbol('PAYMENTS_PROVIDER');

@Module({
  providers: [
    MockPaymentsProvider,
    ManualPixProvider,
    PaymentsProviderRegistry,
    { provide: PAYMENTS_PROVIDER, useExisting: MockPaymentsProvider },
  ],
  exports: [PAYMENTS_PROVIDER, PaymentsProviderRegistry],
})
export class PaymentsModule {}
