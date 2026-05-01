import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AbacatePayClient } from '../abacatepay/abacatepay.client';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import {
  CreatePaymentInput,
  PaymentChargeInfo,
  PaymentsProvider,
} from '../payments.types';

const PIX_EXPIRES_SECONDS = 30 * 60;

@Injectable()
export class AbacatePayProvider implements PaymentsProvider {
  readonly name = 'ABACATE_PAY';
  private readonly logger = new Logger(AbacatePayProvider.name);

  constructor(
    private readonly client: AbacatePayClient,
    private readonly config: ConfigService,
  ) {}

  async createCharge(input: CreatePaymentInput): Promise<PaymentChargeInfo> {
    const customer = {
      name: input.buyerName ?? 'Cliente',
      email: input.buyerEmail,
      taxId: input.buyerCpf ?? undefined,
    };

    if (input.method === PaymentMethod.PIX) {
      this.logger.log(`Creating PIX charge for order ${input.orderId}`);
      const r = await this.client.createPixCharge({
        amount: input.totalCents,
        expiresIn: PIX_EXPIRES_SECONDS,
        description: `Pedido ${input.orderId}`,
        externalId: input.orderId,
        customer,
      });
      return {
        provider: this.name,
        paymentId: r.id,
        method: PaymentMethod.PIX,
        status: r.status === 'PAID' ? 'PAID' : 'PENDING',
        copyPaste: r.brCode,
        expiresAt: r.expiresAt,
        redirectUrl: null,
      };
    }

    if (input.method === PaymentMethod.CARD) {
      this.logger.log(`Creating card checkout for order ${input.orderId}`);
      const webBaseUrl =
        this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
      const successUrl =
        input.successUrl ??
        `${webBaseUrl}/checkout/sucesso?o=${input.orderId}`;
      const cancelUrl =
        input.cancelUrl ?? `${webBaseUrl}/checkout/${input.orderId}`;
      const r = await this.client.createCardCheckout({
        amount: input.totalCents,
        externalId: input.orderId,
        description: `Pedido ${input.orderId}`,
        customer,
        returnUrl: cancelUrl,
        completionUrl: successUrl,
      });
      return {
        provider: this.name,
        paymentId: r.id,
        method: PaymentMethod.CARD,
        status: r.status === 'PAID' ? 'PAID' : 'PENDING',
        copyPaste: null,
        expiresAt: new Date(
          Date.now() + PIX_EXPIRES_SECONDS * 1000,
        ).toISOString(),
        redirectUrl: r.redirectUrl,
      };
    }

    throw new BadRequestException(`unsupported payment method: ${input.method}`);
  }
}
