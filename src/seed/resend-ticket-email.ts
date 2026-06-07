import 'dotenv/config';
import { DataSource } from 'typeorm';
import * as QRCode from 'qrcode';
import { Resend, type Attachment } from 'resend';
import { dataSourceOptions } from '../common/database/data-source';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Sector } from '../events/entities/sector.entity';
import { Event } from '../events/entities/event.entity';
import { Venue } from '../venues/entities/venue.entity';
import { OrderStatus } from '../common/enums/order-status.enum';

// One-off: reenvia o email de "ingressos comprados" pra um usuário cujo email
// foi atualizado no DB (ex.: caixa lotada). Pega a order PAID mais recente do
// usuário identificado por USER_EMAIL e dispara via Resend usando o mesmo
// template do fluxo de compra (orders.service.ts -> sendTicketPurchased).
//
// Uso:
//   USER_EMAIL=Soaresvitor.anglo@gmail.com pnpm ts-node -r tsconfig-paths/register src/seed/resend-ticket-email.ts
//
// Env vars adicionais respeitadas (mesmas do app):
//   RESEND_API_KEY, EMAIL_FROM, EMAIL_REPLY_TO, WEB_BASE_URL
//
// Não escreve nada no banco — só lê e envia o email.

async function main() {
  const targetEmail = process.env.USER_EMAIL?.trim();
  if (!targetEmail) {
    throw new Error('USER_EMAIL env var is required');
  }
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('RESEND_API_KEY env var is required');
  }
  const from = process.env.EMAIL_FROM ?? 'Easy Ticket <onboarding@resend.dev>';
  const replyTo = process.env.EMAIL_REPLY_TO?.trim() || null;
  const webBaseUrl = process.env.WEB_BASE_URL ?? 'http://localhost:3000';

  const ds = new DataSource(dataSourceOptions);
  await ds.initialize();

  const user = await ds.getRepository(User).findOne({
    where: { email: targetEmail },
  });
  if (!user) {
    throw new Error(`user not found for email=${targetEmail}`);
  }
  console.log(`[resend] user ${user.id} email=${user.email}`);

  const order = await ds.getRepository(Order).findOne({
    where: { userId: user.id, status: OrderStatus.PAID },
    order: { createdAt: 'DESC' },
  });
  if (!order) {
    throw new Error(`no PAID order found for user ${user.id}`);
  }
  console.log(`[resend] order ${order.id} paidAt=${order.paidAt?.toISOString()}`);

  const items = await ds
    .getRepository(OrderItem)
    .find({ where: { orderId: order.id } });
  if (!items.length) {
    throw new Error(`order ${order.id} has no items`);
  }

  const tickets = await ds
    .getRepository(Ticket)
    .find({ where: { orderId: order.id }, order: { createdAt: 'ASC' } });
  if (!tickets.length) {
    throw new Error(`order ${order.id} has no tickets`);
  }
  console.log(`[resend] found ${tickets.length} ticket(s)`);

  const sectorIds = Array.from(new Set(tickets.map((t) => t.sectorId)));
  const sectors = await ds
    .getRepository(Sector)
    .createQueryBuilder('s')
    .where('s.id IN (:...ids)', { ids: sectorIds })
    .getMany();
  const bySectorId = new Map(sectors.map((s) => [s.id, s]));

  const eventId = sectors[0]!.eventId;
  const event = await ds.getRepository(Event).findOne({ where: { id: eventId } });
  if (!event) throw new Error(`event ${eventId} not found`);
  const venue = event.venueId
    ? await ds.getRepository(Venue).findOne({ where: { id: event.venueId } })
    : null;

  const buyerEmailLower = user.email.toLowerCase();
  const firstName = user.name ? user.name.trim().split(/\s+/)[0] : null;

  // Mesma lógica de orders.service: tickets cujo holderEmail é diferente do
  // comprador vão pra outro envio. Aqui o foco é só reenviar pro comprador
  // atualizado — então agrupamos por destino e enviamos cada grupo.
  const ticketsByDest: Record<string, Ticket[]> = {};
  for (const t of tickets) {
    const dest =
      t.holderEmail && t.holderEmail.toLowerCase() !== buyerEmailLower
        ? t.holderEmail.toLowerCase()
        : buyerEmailLower;
    (ticketsByDest[dest] ||= []).push(t);
  }

  const resend = new Resend(apiKey);

  for (const [destEmail, group] of Object.entries(ticketsByDest)) {
    const ticketsForEmail = await Promise.all(
      group.map(async (t) => {
        const sector = bySectorId.get(t.sectorId)!;
        return {
          shortCode: t.shortCode,
          sectorName: sector.name,
          qrPngBase64: await renderQrPngBase64(t.qrToken),
        };
      }),
    );

    const isBuyer = destEmail === buyerEmailLower;
    const toAddress = isBuyer ? user.email : destEmail;
    const greetingName = isBuyer
      ? firstName
      : group[0]?.holderName?.split(/\s+/)[0] ?? null;

    const payload = {
      to: toAddress,
      buyerFirstName: greetingName,
      eventTitle: event.title,
      eventArtist: event.artist,
      eventStartsAt: event.startsAt,
      venueName: venue?.name ?? '',
      venueCity: venue?.city ?? '',
      tickets: ticketsForEmail,
    };

    const subject = isBuyer
      ? `Bora! Seus ingressos pra ${payload.eventArtist}`
      : `Você tem ingressos novos · ${payload.eventArtist}`;
    const text = isBuyer
      ? `Seus ingressos estão na sua conta: ${webBaseUrl}/meus-ingressos`
      : `Seus ingressos pra ${payload.eventArtist} estão disponíveis em ${webBaseUrl}/meus-ingressos`;

    const inlined = withInlineQrAttachments(payload);
    const html = renderTicketEmail(inlined.payload);

    console.log(`[resend] sending to ${toAddress} (${ticketsForEmail.length} ticket(s))`);
    const result = await resend.emails.send({
      from,
      to: toAddress,
      subject,
      html,
      text,
      attachments: inlined.attachments,
      ...(replyTo ? { replyTo } : {}),
    });
    if (result.error) {
      console.error(`[resend] FAILED to=${toAddress}`, result.error);
    } else {
      console.log(`[resend] sent to=${toAddress} id=${result.data?.id}`);
    }
  }

  await ds.destroy();
}

async function renderQrPngBase64(text: string): Promise<string> {
  const buf = await QRCode.toBuffer(text, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 240,
    color: { dark: '#0A0A0F', light: '#FFFFFF' },
  });
  return buf.toString('base64');
}

// ---- copiado 1:1 do EmailService pra manter o template idêntico ----

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
    qrCid?: string;
  }>;
  claimUrl?: string;
}

function withInlineQrAttachments(payload: TicketEmailPayload): {
  payload: TicketEmailPayload;
  attachments: Attachment[];
} {
  const tickets = payload.tickets.map((ticket, index) => {
    const safeCode = ticket.shortCode.replace(/[^a-zA-Z0-9_-]/g, '-');
    return {
      ...ticket,
      qrCid: `ticket-qr-${index}-${safeCode}@easy-ticket`,
    };
  });

  return {
    payload: { ...payload, tickets },
    attachments: tickets.map((ticket, index) => ({
      filename: `ingresso-${index + 1}-${ticket.shortCode}.png`,
      content: Buffer.from(ticket.qrPngBase64, 'base64'),
      contentType: 'image/png',
      contentId: ticket.qrCid,
    })),
  };
}

function escape(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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
      <img src="${t.qrCid ? `cid:${escape(t.qrCid)}` : `data:image/png;base64,${t.qrPngBase64}`}" alt="QR" width="120" height="120" style="background:#fff;padding:6px;border-radius:4px"/>
    </td>
  </tr>`,
    )
    .join('');

  const greeting = p.buyerFirstName
    ? `Olá, ${escape(p.buyerFirstName)}!`
    : 'Bora!';
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

    <p style="font-size:12px;color:#6B6B78;margin:24px 0 0;line-height:1.55">
      Apresente o QR no portão. Não precisa imprimir. Ingressos também vivem em sua conta no Easy Ticket.
    </p>
  </div>
</body></html>`;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
