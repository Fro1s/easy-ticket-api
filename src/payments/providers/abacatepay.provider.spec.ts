import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbacatePayProvider } from './abacatepay.provider';
import { AbacatePayClient } from '../abacatepay/abacatepay.client';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { CreatePaymentInput } from '../payments.types';

describe('AbacatePayProvider — validação de dados do comprador', () => {
  const createPixCharge = jest.fn();
  const createCardCheckout = jest.fn();
  const client = { createPixCharge, createCardCheckout } as unknown as AbacatePayClient;
  const config = { get: () => 'http://localhost:3000' } as unknown as ConfigService;

  const provider = new AbacatePayProvider(client, config);

  const baseInput = (overrides: Partial<CreatePaymentInput> = {}): CreatePaymentInput => ({
    orderId: 'order-1',
    totalCents: 3580,
    method: PaymentMethod.PIX,
    buyerEmail: 'buyer@x.com',
    buyerName: 'Vinícius Basílio',
    buyerCpf: '42086909845',
    event: {} as CreatePaymentInput['event'],
    ...overrides,
  });

  beforeEach(() => {
    createPixCharge.mockReset();
    createCardCheckout.mockReset();
    createPixCharge.mockResolvedValue({
      id: 'pix_1',
      brCode: 'br-code',
      status: 'PENDING',
      expiresAt: '2026-06-10T17:00:00.000Z',
    });
  });

  it('bloqueia e avisa quando falta o CPF (PIX)', async () => {
    await expect(
      provider.createCharge(baseInput({ buyerCpf: null })),
    ).rejects.toThrow(BadRequestException);
    await expect(
      provider.createCharge(baseInput({ buyerCpf: null })),
    ).rejects.toThrow(/CPF/i);
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it('bloqueia quando o CPF vem vazio/em branco', async () => {
    await expect(
      provider.createCharge(baseInput({ buyerCpf: '   ' })),
    ).rejects.toThrow(/CPF/i);
    expect(createPixCharge).not.toHaveBeenCalled();
  });

  it('gera o PIX normalmente quando o CPF está presente (mesmo sem telefone)', async () => {
    const r = await provider.createCharge(baseInput());
    expect(createPixCharge).toHaveBeenCalledTimes(1);
    expect(r.copyPaste).toBe('br-code');
  });
});
