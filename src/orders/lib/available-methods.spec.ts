import { availableMethods } from './available-methods';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

describe('availableMethods', () => {
  it('MANUAL_PIX => só PIX', () => {
    expect(availableMethods(PaymentProvider.MANUAL_PIX, true)).toEqual([
      PaymentMethod.PIX,
    ]);
    expect(availableMethods(PaymentProvider.MANUAL_PIX, false)).toEqual([
      PaymentMethod.PIX,
    ]);
  });
  it('ABACATE_PAY com cartão habilitado => PIX e CARD', () => {
    expect(availableMethods(PaymentProvider.ABACATE_PAY, true)).toEqual([
      PaymentMethod.PIX,
      PaymentMethod.CARD,
    ]);
  });
  it('ABACATE_PAY com cartão desabilitado => só PIX', () => {
    expect(availableMethods(PaymentProvider.ABACATE_PAY, false)).toEqual([
      PaymentMethod.PIX,
    ]);
  });
});
