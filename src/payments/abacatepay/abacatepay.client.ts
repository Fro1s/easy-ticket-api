/**
 * AbacatePayClient — direct v2 API integration via fetch.
 *
 * NOTE: Replaces the abacatepay-nodejs-sdk@1.6.0 (v1-only) usage. The dev keys
 * issued today are v2 keys; v1 endpoints reject them with "API key version
 * mismatch". v2 requires:
 *   - PIX: POST /v2/transparents/create  body { method:'PIX', data:{ amount, ... } }
 *   - CARD: two-step. First POST /v2/products/create to register a one-shot
 *     product, then POST /v2/checkouts/create with items:[{id, quantity}].
 *
 * Webhook charge IDs returned at create time match what the panel sends back:
 *   - transparents.* event → data.transparent.id
 *   - checkouts.*   event → data.checkout.id
 */

import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AbacateChargeStatus,
  CardCheckoutRequest,
  CardCheckoutResponse,
  PixChargeRequest,
  PixChargeResponse,
} from './abacatepay.types';
import { buildPixBody } from './build-pix-body';

const BASE_URL = 'https://api.abacatepay.com/v2';

interface ApiEnvelope<T> {
  success?: boolean;
  data: T | null;
  error: string | null;
}

interface ApiPixData {
  id: string;
  brCode: string;
  brCodeBase64?: string;
  status: string;
  expiresAt: string;
}

interface ApiProductData {
  id: string;
}

interface ApiCheckoutData {
  id: string;
  url: string;
  status: string;
}

function normalizeStatus(raw: string | undefined): AbacateChargeStatus {
  const upper = (raw ?? '').toUpperCase();
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
    : 'PENDING';
}

@Injectable()
export class AbacatePayClient {
  private readonly logger = new Logger(AbacatePayClient.name);
  private readonly apiKey: string | null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ABACATEPAY_API_KEY')?.trim();
    this.apiKey = apiKey || null;
    if (!this.apiKey) {
      this.logger.warn(
        'ABACATEPAY_API_KEY is not set — AbacatePayClient will reject all requests',
      );
    }
  }

  // -------------------------------------------------------------------------
  // PIX — /v2/transparents/create
  // -------------------------------------------------------------------------

  async createPixCharge(req: PixChargeRequest): Promise<PixChargeResponse> {
    this.assertConfigured();
    this.logger.log(
      `Creating PIX charge: externalId=${req.externalId} amount=${req.amount}`,
    );

    const body = buildPixBody(req);

    const r = await this.call<ApiPixData>('/transparents/create', body);
    return {
      id: r.id,
      brCode: r.brCode,
      brCodeBase64: r.brCodeBase64,
      status: normalizeStatus(r.status),
      expiresAt: r.expiresAt,
    };
  }

  // -------------------------------------------------------------------------
  // Card — /v2/products/create + /v2/checkouts/create
  // -------------------------------------------------------------------------

  async createCardCheckout(
    req: CardCheckoutRequest,
  ): Promise<CardCheckoutResponse> {
    this.assertConfigured();
    this.logger.log(
      `Creating card checkout: externalId=${req.externalId} amount=${req.amount}`,
    );

    // v2 /checkouts/create requires `items: [{id, quantity}]` referring to
    // products. Create a one-shot product per order.
    const product = await this.call<ApiProductData>('/products/create', {
      externalId: req.externalId,
      name: req.description,
      price: req.amount,
      currency: 'BRL',
    });

    const checkout = await this.call<ApiCheckoutData>('/checkouts/create', {
      items: [{ id: product.id, quantity: 1 }],
      methods: ['CARD'],
      returnUrl: req.returnUrl,
      completionUrl: req.completionUrl ?? req.returnUrl,
      externalId: req.externalId,
    });

    return {
      id: checkout.id,
      redirectUrl: checkout.url,
      status: normalizeStatus(checkout.status),
    };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private async call<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`${BASE_URL}${path}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiKey!}`,
          'Content-Type': 'application/json',
          'User-Agent': 'easy-ticket/1.0',
        },
        body: JSON.stringify(body),
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`AbacatePay v2 fetch error on ${path}: ${msg}`);
      throw new BadRequestException(`AbacatePay error: ${msg}`);
    }

    let env: ApiEnvelope<T>;
    try {
      env = (await response.json()) as ApiEnvelope<T>;
    } catch {
      throw new BadRequestException(
        `AbacatePay returned non-JSON (status=${response.status})`,
      );
    }

    if (!response.ok || env.error || !env.data) {
      const msg = env.error || `HTTP ${response.status}`;
      this.logger.warn(`AbacatePay v2 ${path} failed: ${msg}`);
      throw new BadRequestException(`AbacatePay error: ${msg}`);
    }

    return env.data;
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new BadRequestException(
        'AbacatePay is not configured (missing ABACATEPAY_API_KEY)',
      );
    }
  }
}
