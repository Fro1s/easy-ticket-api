/**
 * AbacatePayClient — thin NestJS wrapper around abacatepay-nodejs-sdk@1.6.0.
 *
 * SDK shape relied upon:
 *   - Factory: `AbacatePay(apiKey: string)` → returns object (not a class).
 *   - PIX:  sdk.pixQrCode.create({ amount, expiresIn, description, customer? })
 *             → { error: string | null, data: IPixQrCode | null }
 *             IPixQrCode: { id, brCode, brCodeBase64, status, expiresAt, ... }
 *   - Card: sdk.billing.create({ frequency:'ONE_TIME', methods:['CARD'],
 *             products:[{ externalId, name, quantity:1, price, description }],
 *             returnUrl, completionUrl, customer })
 *             → { error: string | null, data: IBilling | null }
 *             IBilling: { id, url (redirect), status, ... }
 *
 * IMPORTANT: pixQrCode.create has no externalId field — callers must persist
 * the returned charge id → orderId mapping themselves (e.g. on the Order row).
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import AbacatePay from 'abacatepay-nodejs-sdk';
import {
  AbacateChargeStatus,
  CardCheckoutRequest,
  CardCheckoutResponse,
  PixChargeRequest,
  PixChargeResponse,
} from './abacatepay.types';

type SdkInstance = ReturnType<typeof AbacatePay>;

/** Maps SDK billing/pix statuses to our unified AbacateChargeStatus. */
function normalizeStatus(raw: string): AbacateChargeStatus {
  const upper = raw.toUpperCase();
  const known: AbacateChargeStatus[] = [
    'PENDING',
    'PAID',
    'EXPIRED',
    'CANCELLED',
    'REFUNDED',
    'FAILED',
  ];
  return known.includes(upper as AbacateChargeStatus)
    ? (upper as AbacateChargeStatus)
    : 'FAILED';
}

@Injectable()
export class AbacatePayClient {
  private readonly logger = new Logger(AbacatePayClient.name);
  private readonly sdk: SdkInstance | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ABACATEPAY_API_KEY')?.trim();

    if (apiKey) {
      this.sdk = AbacatePay(apiKey);
    } else {
      this.sdk = null;
      this.logger.warn(
        'ABACATEPAY_API_KEY is not set — AbacatePayClient will reject all requests',
      );
    }
  }

  // -------------------------------------------------------------------------
  // PIX
  // -------------------------------------------------------------------------

  async createPixCharge(req: PixChargeRequest): Promise<PixChargeResponse> {
    this.assertConfigured();

    this.logger.log(
      `Creating PIX charge: externalId=${req.externalId} amount=${req.amount}`,
    );

    let response: Awaited<ReturnType<SdkInstance['pixQrCode']['create']>>;

    try {
      response = await this.sdk!.pixQrCode.create({
        amount: req.amount,
        expiresIn: req.expiresIn,
        description: req.description,
        customer: req.customer.email
          ? {
              email: req.customer.email,
              name: req.customer.name,
              cellphone: req.customer.cellphone,
              taxId: req.customer.taxId,
            }
          : undefined,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AbacatePay PIX SDK threw for externalId=${req.externalId}: ${msg}`,
      );
      throw new BadRequestException(`AbacatePay PIX error: ${msg}`);
    }

    if (response.error) {
      this.logger.warn(
        `AbacatePay PIX API error for externalId=${req.externalId}: ${response.error}`,
      );
      throw new BadRequestException(`AbacatePay PIX error: ${response.error}`);
    }

    // After the guard above, TS knows we're in the `{ error: null; data: IPixQrCode }` branch.
    const pix = (response as Extract<typeof response, { error: null }>).data;

    return {
      id: pix.id,
      brCode: pix.brCode,
      brCodeBase64: pix.brCodeBase64,
      status: normalizeStatus(pix.status),
      expiresAt: pix.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // Card (hosted checkout via billing.create)
  // -------------------------------------------------------------------------

  async createCardCheckout(
    req: CardCheckoutRequest,
  ): Promise<CardCheckoutResponse> {
    this.assertConfigured();

    this.logger.log(
      `Creating card checkout: externalId=${req.externalId} amount=${req.amount}`,
    );

    let response: Awaited<ReturnType<SdkInstance['billing']['create']>>;

    try {
      response = await this.sdk!.billing.create({
        frequency: 'ONE_TIME',
        methods: ['CARD'],
        products: [
          {
            externalId: req.externalId,
            name: req.description,
            quantity: 1,
            price: req.amount,
            description: req.description,
          },
        ],
        returnUrl: req.returnUrl,
        completionUrl: req.completionUrl ?? req.returnUrl,
        customer: {
          email: req.customer.email,
          name: req.customer.name,
          cellphone: req.customer.cellphone,
          taxId: req.customer.taxId,
        },
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(
        `AbacatePay card SDK threw for externalId=${req.externalId}: ${msg}`,
      );
      throw new BadRequestException(`AbacatePay card error: ${msg}`);
    }

    if (response.error) {
      this.logger.warn(
        `AbacatePay card API error for externalId=${req.externalId}: ${response.error}`,
      );
      throw new BadRequestException(
        `AbacatePay card error: ${response.error}`,
      );
    }

    const billing = response.data!;

    return {
      id: billing.id,
      redirectUrl: billing.url,
      status: normalizeStatus(billing.status),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private assertConfigured(): void {
    if (!this.sdk) {
      throw new BadRequestException(
        'AbacatePay is not configured (missing ABACATEPAY_API_KEY)',
      );
    }
  }
}
