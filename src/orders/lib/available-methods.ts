import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

/**
 * Métodos de pagamento disponíveis no checkout. PIX sempre disponível.
 * CARD só para ABACATE_PAY com cartão habilitado.
 */
export function availableMethods(
  provider: PaymentProvider,
  cardEnabled: boolean,
): PaymentMethod[] {
  if (provider === PaymentProvider.ABACATE_PAY && cardEnabled) {
    return [PaymentMethod.PIX, PaymentMethod.CARD];
  }
  return [PaymentMethod.PIX];
}
