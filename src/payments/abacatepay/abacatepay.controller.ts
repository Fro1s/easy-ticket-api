import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  HttpCode,
  Logger,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { OrdersService } from '../../orders/orders.service';
import { verifyAbacateSignature } from './abacatepay-signature';

interface AbacateWebhookPayload {
  event: string;
  data?: {
    id?: string;
    externalId?: string;
    status?: string;
  };
}

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
    @Headers('x-abacatepay-signature') signature: string | undefined,
    @Body() body: AbacateWebhookPayload,
  ): Promise<{ ok: true }> {
    const secret = this.config.get<string>('ABACATEPAY_WEBHOOK_SECRET')?.trim();
    if (!secret) throw new BadRequestException('webhook secret not configured');
    if (!req.rawBody) throw new BadRequestException('rawBody not captured');
    const raw = req.rawBody.toString('utf8');
    if (!verifyAbacateSignature(raw, signature ?? '', secret)) {
      this.logger.warn(`invalid abacate signature (sig prefix=${(signature ?? '').slice(0, 10)})`);
      throw new UnauthorizedException('invalid signature');
    }

    if (body.event === 'billing.paid' && body.data?.id) {
      await this.orders.markPaidByPaymentId(body.data.id);
    }
    // billing.expired / billing.failed: ignored — order will expire by cron.
    return { ok: true };
  }
}
