import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OrdersService } from '../../orders/orders.service';
import {
  verifyAbacateSignature,
  timingSafeStringEqual,
} from './abacatepay-signature';

interface AbacateWebhookPayload {
  id?: string;
  event: string;
  apiVersion?: number;
  devMode?: boolean;
  data?: {
    // checkout.* (hosted checkout via billing.create)
    checkout?: {
      id?: string;
      externalId?: string;
      status?: string;
      amount?: number;
    };
    // transparent.* (PIX QR via pixQrCode.create)
    transparent?: {
      id?: string;
      externalId?: string;
      status?: string;
      amount?: number;
    };
    // legacy/fallback
    id?: string;
    externalId?: string;
    status?: string;
    amount?: number;
  };
}

const PAID_EVENTS = new Set(['checkout.completed', 'transparent.completed']);

@ApiExcludeController()
// O gateway reenvia webhooks legitimamente; não limitar por taxa.
@SkipThrottle()
@Controller('payments/abacate')
export class AbacatePayController {
  private readonly logger = new Logger(AbacatePayController.name);

  constructor(
    private readonly config: ConfigService,
    private readonly orders: OrdersService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async webhook(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers('x-webhook-signature') signatureHeader: string | undefined,
    @Query('webhookSecret') querySecret: string | undefined,
    @Body() body: AbacateWebhookPayload,
  ): Promise<{ ok: true }> {
    const secret = this.config.get<string>('ABACATEPAY_WEBHOOK_SECRET')?.trim();
    if (!secret) throw new BadRequestException('webhook secret not configured');

    // The URL query-secret path is dev-only: query strings leak into proxy /
    // CDN / APM logs, so in production we require the HMAC signature over the
    // raw body (which a log leak can't reproduce).
    const allowQuerySecret = process.env.NODE_ENV !== 'production';
    const querySecretMatches =
      allowQuerySecret &&
      typeof querySecret === 'string' &&
      timingSafeStringEqual(querySecret, secret);

    let signatureMatches = false;
    if (signatureHeader && req.rawBody) {
      const raw = req.rawBody.toString('utf8');
      signatureMatches = verifyAbacateSignature(raw, signatureHeader, secret);
    }

    if (!querySecretMatches && !signatureMatches) {
      this.logger.warn(
        `invalid abacate webhook auth (sigPresent=${!!signatureHeader} querySecretPresent=${!!querySecret})`,
      );
      throw new UnauthorizedException('invalid signature');
    }

    const chargeId =
      body.data?.checkout?.id ?? body.data?.transparent?.id ?? body.data?.id;
    const paidAmount =
      body.data?.checkout?.amount ??
      body.data?.transparent?.amount ??
      body.data?.amount;

    if (PAID_EVENTS.has(body.event) && chargeId) {
      this.logger.log(`webhook ${body.event} for paymentId=${chargeId}`);
      // Passa o valor pago quando presente: markOrderPaid recusa a confirmação
      // se não bater com o total do pedido (defesa extra caso o segredo vaze).
      await this.orders.markPaidByPaymentId(chargeId, paidAmount);
    } else {
      this.logger.log(
        `webhook ${body.event} ignored (chargeId=${chargeId ?? 'none'})`,
      );
    }
    return { ok: true };
  }
}
