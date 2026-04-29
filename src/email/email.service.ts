import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Resend } from 'resend';

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface MagicLinkPayload {
  to: string;
  url: string;
}

interface TicketEmailPayload {
  to: string;
  buyerFirstName: string | null;
  eventTitle: string;
  eventArtist: string;
  eventStartsAt: Date;
  venueName: string;
  venueCity: string;
  tickets: Array<{
    shortCode: string;
    sectorName: string;
    qrPngBase64: string;
  }>;
  claimUrl?: string;
}

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);
  private readonly client: Resend | null;
  private readonly from: string;
  private readonly replyTo: string | null;
  private readonly webBaseUrl: string;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('RESEND_API_KEY')?.trim();
    this.client = apiKey ? new Resend(apiKey) : null;
    this.from =
      this.config.get<string>('EMAIL_FROM') ??
      'Easy Ticket <onboarding@resend.dev>';
    const reply = this.config.get<string>('EMAIL_REPLY_TO')?.trim();
    this.replyTo = reply ? reply : null;
    this.webBaseUrl =
      this.config.get<string>('WEB_BASE_URL') ?? 'http://localhost:3000';
  }

  get baseUrl(): string {
    return this.webBaseUrl;
  }

  async send(input: SendEmailInput): Promise<void> {
    if (!this.client) {
      this.logger.warn(
        `[email:console] no RESEND_API_KEY — would send to ${input.to} subject="${input.subject}"`,
      );
      this.logger.debug(input.html);
      return;
    }
    try {
      const result = await this.client.emails.send({
        from: this.from,
        to: input.to,
        subject: input.subject,
        html: input.html,
        text: input.text,
        ...(this.replyTo ? { replyTo: this.replyTo } : {}),
      });
      if (result.error) {
        this.logger.error(
          `resend send failed to=${input.to} ${JSON.stringify(result.error)}`,
        );
        return;
      }
      this.logger.log(`sent email to ${input.to} id=${result.data?.id}`);
    } catch (err) {
      this.logger.error(
        `resend exception to=${input.to}: ${(err as Error).message}`,
      );
    }
  }

  async sendMagicLink(payload: MagicLinkPayload): Promise<void> {
    const html = renderMagicLink(payload.url);
    await this.send({
      to: payload.to,
      subject: 'Seu link de acesso · Easy Ticket',
      html,
      text: `Acesse sua conta: ${payload.url}`,
    });
  }

  async sendTicketByEmail(payload: TicketEmailPayload): Promise<void> {
    const subject = payload.claimUrl
      ? `Você ganhou ingresso pra ${payload.eventArtist}`
      : `Você tem ingressos novos · ${payload.eventArtist}`;
    const html = renderTicketEmail(payload);
    await this.send({
      to: payload.to,
      subject,
      html,
      text: payload.claimUrl
        ? `Você recebeu ingresso pra ${payload.eventArtist}. Acesse: ${payload.claimUrl}`
        : `Seus ingressos pra ${payload.eventArtist} estão disponíveis em ${this.webBaseUrl}/meus-ingressos`,
    });
  }

  async sendTicketPurchased(payload: TicketEmailPayload): Promise<void> {
    const html = renderTicketEmail(payload);
    await this.send({
      to: payload.to,
      subject: `Bora! Seus ingressos pra ${payload.eventArtist}`,
      html,
      text: `Seus ingressos estão na sua conta: ${this.webBaseUrl}/meus-ingressos`,
    });
  }
}

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderMagicLink(url: string): string {
  return `<!doctype html><html><body style="margin:0;background:#0A0A0F;color:#F7F7F2;font-family:Inter,system-ui,sans-serif;padding:32px">
  <div style="max-width:480px;margin:0 auto;background:#11111A;border:1px solid #25252F;border-radius:8px;padding:32px">
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D1FF4D;margin-bottom:16px">Easy Ticket</div>
    <h1 style="font-size:24px;font-weight:700;margin:0 0 12px;color:#F7F7F2">Seu link de acesso</h1>
    <p style="font-size:15px;line-height:1.55;color:#A8A8B3;margin:0 0 24px">Clique no botão abaixo pra entrar. O link expira em 15 minutos.</p>
    <a href="${escape(url)}" style="display:inline-block;background:#D1FF4D;color:#0A0A0F;text-decoration:none;font-weight:600;padding:14px 28px;border-radius:4px">Acessar minha conta →</a>
    <p style="font-size:12px;color:#6B6B78;margin:32px 0 0">Se não foi você, ignore este e-mail.</p>
  </div>
</body></html>`;
}

function renderTicketEmail(p: TicketEmailPayload): string {
  const ticketRows = p.tickets
    .map(
      (t) => `<tr>
    <td style="padding:16px;border-bottom:1px solid #25252F;vertical-align:middle">
      <div style="font-size:11px;color:#6B6B78;letter-spacing:0.12em;text-transform:uppercase">${escape(t.sectorName)}</div>
      <div style="font-family:'Geist Mono',ui-monospace,monospace;font-size:14px;color:#F7F7F2;margin-top:4px">${escape(t.shortCode)}</div>
    </td>
    <td style="padding:16px;border-bottom:1px solid #25252F;text-align:right">
      <img src="data:image/png;base64,${t.qrPngBase64}" alt="QR" width="120" height="120" style="background:#fff;padding:6px;border-radius:4px"/>
    </td>
  </tr>`,
    )
    .join('');

  const greeting = p.buyerFirstName
    ? `Olá, ${escape(p.buyerFirstName)}!`
    : 'Bora!';
  const claimBlock = p.claimUrl
    ? `<div style="margin:24px 0;padding:20px;background:#D1FF4D;color:#0A0A0F;border-radius:6px">
      <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;font-weight:700;margin-bottom:8px">Crie sua conta</div>
      <div style="font-size:14px;line-height:1.5;margin-bottom:16px">Pra acessar e transferir seus ingressos, ative sua conta no Easy Ticket. O link expira em 24h.</div>
      <a href="${escape(p.claimUrl)}" style="display:inline-block;background:#0A0A0F;color:#D1FF4D;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:4px">Ativar minha conta →</a>
    </div>`
    : '';

  const date = p.eventStartsAt.toLocaleString('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  });

  return `<!doctype html><html><body style="margin:0;background:#0A0A0F;color:#F7F7F2;font-family:Inter,system-ui,sans-serif;padding:32px">
  <div style="max-width:560px;margin:0 auto;background:#11111A;border:1px solid #25252F;border-radius:8px;padding:32px">
    <div style="font-size:11px;letter-spacing:0.18em;text-transform:uppercase;color:#D1FF4D">Easy Ticket</div>
    <h1 style="font-size:26px;font-weight:700;margin:8px 0 4px;color:#F7F7F2">${greeting}</h1>
    <div style="font-size:15px;color:#A8A8B3;margin-bottom:24px">Você tem ${p.tickets.length} ingresso${p.tickets.length > 1 ? 's' : ''} pra <strong style="color:#F7F7F2">${escape(p.eventArtist)}</strong>.</div>

    <div style="background:#0A0A0F;border:1px solid #25252F;border-radius:6px;padding:20px;margin-bottom:20px">
      <div style="font-size:13px;color:#A8A8B3;margin-bottom:4px">${escape(p.eventTitle)}</div>
      <div style="font-size:13px;color:#A8A8B3">${date} · ${escape(p.venueName)}, ${escape(p.venueCity)}</div>
    </div>

    <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#0A0A0F;border:1px solid #25252F;border-radius:6px;overflow:hidden">${ticketRows}</table>

    ${claimBlock}

    <p style="font-size:12px;color:#6B6B78;margin:24px 0 0;line-height:1.55">
      Apresente o QR no portão. Não precisa imprimir. Ingressos também vivem em sua conta no Easy Ticket.
    </p>
  </div>
</body></html>`;
}
