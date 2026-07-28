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
  querySecretFromRawUrl,
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

    // O `webhookSecret` na query string é o ÚNICO segredo compartilhado que a
    // AbacatePay oferece por integração, então é ele que autoriza — inclusive
    // em produção. (Já tentamos exigir só a assinatura HMAC em prod: a chave
    // dessa assinatura é publicada na doc pública da AbacatePay, logo ela não
    // prova nada sobre quem chamou e todo webhook pago virava 401.)
    // Comparamos as duas leituras do parâmetro: a decodificada pelo Express
    // (que troca `+` por espaço) e a extraída da URL crua.
    const received = [querySecret, querySecretFromRawUrl(req.originalUrl)];
    const querySecretMatches = received.some(
      (value) =>
        typeof value === 'string' &&
        timingSafeStringEqual(value.trim(), secret),
    );

    // Assinatura: só sinal de integridade/origem (chave pública), nunca auth.
    const hmacKey = this.config
      .get<string>('ABACATEPAY_WEBHOOK_HMAC_KEY')
      ?.trim();
    const signatureMatches =
      !!signatureHeader &&
      !!req.rawBody &&
      !!hmacKey &&
      verifyAbacateSignature(
        req.rawBody.toString('utf8'),
        signatureHeader,
        hmacKey,
      );

    if (!querySecretMatches) {
      // Sem vazar o segredo: só o que permite diagnosticar divergência.
      this.logger.warn(
        `invalid abacate webhook auth (sigPresent=${!!signatureHeader} sigValid=${signatureMatches} querySecretPresent=${!!querySecret} receivedLen=${querySecret?.length ?? 0} expectedLen=${secret.length})`,
      );
      throw new UnauthorizedException('invalid signature');
    }

    if (signatureHeader && hmacKey && !signatureMatches) {
      this.logger.warn(
        'abacate webhook signature did not verify (autorizado pelo webhookSecret)',
      );
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
