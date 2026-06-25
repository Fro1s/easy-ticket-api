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
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OrdersService } from '../../orders/orders.service';
import { verifyAbacateSignature } from './abacatepay-signature';

interface AbacateWebhookPayload {
  id?: string;
  event: string;
  apiVersion?: number;
  devMode?: boolean;
  data?: {
    // checkout.* (hosted checkout via billing.create)
    checkout?: { id?: string; externalId?: string; status?: string };
    // transparent.* (PIX QR via pixQrCode.create)
    transparent?: { id?: string; externalId?: string; status?: string };
    // legacy/fallback
    id?: string;
    externalId?: string;
    status?: string;
  };
}

const PAID_EVENTS = new Set(['checkout.completed', 'transparent.completed']);

@ApiExcludeController()
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

    const querySecretMatches =
      typeof querySecret === 'string' && querySecret === secret;

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

    if (PAID_EVENTS.has(body.event) && chargeId) {
      this.logger.log(`webhook ${body.event} for paymentId=${chargeId}`);
      await this.orders.markPaidByPaymentId(chargeId);
    } else {
      this.logger.log(
        `webhook ${body.event} ignored (chargeId=${chargeId ?? 'none'})`,
      );
    }
    return { ok: true };
  }
}
