import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import * as QRCode from 'qrcode';
import { Ticket } from './entities/ticket.entity';
import { SharedTicketResponse } from './dto/shared-ticket.response';
import {
  TransferTicketDto,
  TransferTicketResponse,
} from './dto/transfer-ticket.dto';
import { resolveRecipientLookup } from './lib/resolve-recipient-lookup';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { User } from '../users/entities/user.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';

@Injectable()
export class TicketsService {
  private readonly logger = new Logger(TicketsService.name);

  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
    private readonly dataSource: DataSource,
    private readonly users: UsersService,
    private readonly emails: EmailService,
  ) {}

  async findShared(shortCode: string): Promise<SharedTicketResponse> {
    const code = shortCode.toUpperCase();

    const row = await this.tickets
      .createQueryBuilder('t')
      .leftJoin('events', 'e', 'e.id = t.eventId')
      .leftJoin('venues', 'v', 'v.id = e.venueId')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('users', 'u', 'u.id = t.userId')
      .where('t.shortCode = :code', { code })
      .select([
        't.shortCode AS t_short',
        't.status AS t_status',
        't.holderName AS t_holder',
        'u.name AS u_name',
        'e.slug AS e_slug',
        'e.title AS e_title',
        'e.artist AS e_artist',
        'e.category AS e_category',
        'e.startsAt AS e_starts',
        'e.doorsAt AS e_doors',
        'e.posterUrl AS e_poster',
        'v.name AS v_name',
        'v.city AS v_city',
        'v.state AS v_state',
        's.name AS s_name',
        's.colorHex AS s_color',
      ])
      .getRawOne();

    if (!row) throw new NotFoundException('ticket not found');

    const fullName: string = row.t_holder ?? row.u_name ?? '';
    const holderFirstName = fullName.trim().split(/\s+/)[0] ?? '';

    return {
      shortCode: row.t_short,
      status: row.t_status,
      holderFirstName,
      event: {
        slug: row.e_slug,
        title: row.e_title,
        artist: row.e_artist,
        category: row.e_category,
        startsAt: new Date(row.e_starts).toISOString(),
        doorsAt: new Date(row.e_doors).toISOString(),
        posterUrl: row.e_poster,
        venueName: row.v_name,
        venueCity: row.v_city,
        venueState: row.v_state,
      },
      sector: {
        name: row.s_name,
        colorHex: row.s_color,
      },
    };
  }

  async transfer(
    senderUserId: string,
    ticketId: string,
    dto: TransferTicketDto,
  ): Promise<TransferTicketResponse> {
    const lookup = resolveRecipientLookup(dto);
    if (!lookup) {
      throw new BadRequestException('informe email ou cpf do destinatário');
    }

    const recipient =
      lookup.by === 'email'
        ? await this.users.findByEmail(lookup.value)
        : await this.users.findByCpf(lookup.value);
    if (!recipient) {
      throw new NotFoundException('destinatário não possui conta no sistema');
    }
    if (recipient.id === senderUserId) {
      throw new BadRequestException('não é possível transferir para si mesmo');
    }

    const newTicket = await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Ticket);
      const original = await repo.findOne({
        where: { id: ticketId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!original) throw new NotFoundException('ticket not found');
      if (original.userId !== senderUserId) {
        throw new ForbiddenException('ticket does not belong to you');
      }
      if (original.status !== TicketStatus.VALID) {
        throw new BadRequestException(
          'apenas tickets válidos podem ser transferidos',
        );
      }

      original.status = TicketStatus.TRANSFERRED;
      original.transferredToUserId = recipient.id;

      const fresh = new Ticket();
      fresh.id = createId();
      fresh.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
      fresh.qrToken = `et:${original.orderId}:${createId()}`;
      fresh.orderId = original.orderId;
      fresh.userId = recipient.id;
      fresh.eventId = original.eventId;
      fresh.sectorId = original.sectorId;
      fresh.batchId = original.batchId;
      fresh.status = TicketStatus.VALID;
      fresh.holderName = recipient.name;
      fresh.holderEmail = recipient.email;

      await repo.save(original);
      await repo.save(fresh);
      return fresh;
    });

    await this.notifyRecipient(newTicket, recipient);

    return {
      id: newTicket.id,
      shortCode: newTicket.shortCode,
      status: newTicket.status,
      recipientEmail: recipient.email,
    };
  }

  // Best-effort: avisa o destinatário com o ticket novo. Nunca derruba a
  // transferência (que já foi commitada) se o email falhar.
  private async notifyRecipient(
    ticket: Ticket,
    recipient: User,
  ): Promise<void> {
    try {
      const event = await this.dataSource.getRepository(Event).findOne({
        where: { id: ticket.eventId },
        relations: { venue: true },
      });
      if (!event) return;
      const sector = await this.dataSource
        .getRepository(Sector)
        .findOne({ where: { id: ticket.sectorId } });

      await this.emails.sendTicketByEmail({
        to: recipient.email,
        buyerFirstName: recipient.name
          ? recipient.name.trim().split(/\s+/)[0]
          : null,
        eventTitle: event.title,
        eventArtist: event.artist,
        eventStartsAt: event.startsAt,
        venueName: event.venue?.name ?? '',
        venueCity: event.venue?.city ?? '',
        tickets: [
          {
            shortCode: ticket.shortCode,
            sectorName: sector?.name ?? '',
            qrPngBase64: await renderQrPngBase64(ticket.qrToken),
          },
        ],
      });
    } catch (err) {
      this.logger.warn(
        `transfer: email falhou para ${recipient.email}: ${(err as Error).message}`,
      );
    }
  }
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
