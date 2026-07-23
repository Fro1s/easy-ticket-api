import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CheckoutOrderDto } from './checkout-order.dto';
import { PaymentMethod } from '../../common/enums/payment-method.enum';

describe('CheckoutOrderDto', () => {
  it('accepts optional phone', async () => {
    const dto = plainToInstance(CheckoutOrderDto, {
      method: PaymentMethod.PIX,
      phone: '(14) 99696-2007',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('remains valid without phone', async () => {
    const dto = plainToInstance(CheckoutOrderDto, {
      method: PaymentMethod.PIX,
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('rejects phone longer than 32 chars', async () => {
    const dto = plainToInstance(CheckoutOrderDto, {
      method: PaymentMethod.PIX,
      phone: '9'.repeat(33),
    });
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
  });
});
