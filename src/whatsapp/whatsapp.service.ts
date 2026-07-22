import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildTicketMessage,
  type TicketWhatsAppPayload,
} from './lib/build-ticket-message';

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private readonly provider: 'console' | 'zapi';
  private readonly zapiInstanceId: string | null;
  private readonly zapiToken: string | null;
  private readonly zapiClientToken: string | null;

  constructor(private readonly config: ConfigService) {
    const p = this.config.get<string>('WHATSAPP_PROVIDER')?.trim().toLowerCase();
    this.provider = p === 'zapi' ? 'zapi' : 'console';
    this.zapiInstanceId = this.config.get<string>('ZAPI_INSTANCE_ID') ?? null;
    this.zapiToken = this.config.get<string>('ZAPI_TOKEN') ?? null;
    this.zapiClientToken = this.config.get<string>('ZAPI_CLIENT_TOKEN') ?? null;
  }

  async sendText(phone: string, message: string): Promise<boolean> {
    if (this.provider !== 'zapi' || !this.zapiInstanceId || !this.zapiToken) {
      this.logger.warn(
        `[whatsapp:console] would send to ${phone}:\n${message}`,
      );
      return false;
    }
    try {
      const res = await fetch(
        `https://api.z-api.io/instances/${this.zapiInstanceId}/token/${this.zapiToken}/send-text`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.zapiClientToken
              ? { 'Client-Token': this.zapiClientToken }
              : {}),
          },
          body: JSON.stringify({ phone, message }),
        },
      );
      if (!res.ok) {
        this.logger.error(
          `zapi send failed to=${phone} status=${res.status} body=${await res.text()}`,
        );
        return false;
      }
      this.logger.log(`whatsapp sent to ${phone}`);
      return true;
    } catch (err) {
      this.logger.error(`zapi exception to=${phone}: ${(err as Error).message}`);
      return false;
    }
  }

  async sendTickets(
    toPhone: string,
    payload: TicketWhatsAppPayload,
  ): Promise<boolean> {
    return this.sendText(toPhone, buildTicketMessage(payload));
  }
}
