import { forwardRef, Module } from '@nestjs/common';
import { MockPaymentsProvider } from './providers/mock-payments.provider';
import { ManualPixProvider } from './providers/manual-pix.provider';
import { AbacatePayProvider } from './providers/abacatepay.provider';
import { PaymentsProviderRegistry } from './payments-provider.registry';
import { AbacatePayClient } from './abacatepay/abacatepay.client';
import { AbacatePayController } from './abacatepay/abacatepay.controller';
import { OrdersModule } from '../orders/orders.module';

// Kept for backward-compat with anything still injecting the symbol token.
// New code should depend on PaymentsProviderRegistry directly.
export const PAYMENTS_PROVIDER = Symbol('PAYMENTS_PROVIDER');

@Module({
  imports: [forwardRef(() => OrdersModule)],
  controllers: [AbacatePayController],
  providers: [
    MockPaymentsProvider,
    ManualPixProvider,
    AbacatePayProvider,
    PaymentsProviderRegistry,
    AbacatePayClient,
    { provide: PAYMENTS_PROVIDER, useExisting: MockPaymentsProvider },
  ],
  exports: [PAYMENTS_PROVIDER, PaymentsProviderRegistry, AbacatePayClient],
})
export class PaymentsModule {}
