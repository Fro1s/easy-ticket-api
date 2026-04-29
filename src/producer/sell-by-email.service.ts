import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { createHash } from 'node:crypto';
import * as QRCode from 'qrcode';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Sector } from '../events/entities/sector.entity';
import { Event } from '../events/entities/event.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { OrderStatus } from '../common/enums/order-status.enum';
import { Role } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { OrdersService } from '../orders/orders.service';
import { ClaimTokensService } from '../claim-tokens/claim-tokens.service';
import { EmailService } from '../email/email.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { SellByEmailDto, SellByEmailResponse } from './dto/sell-by-email.dto';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { buildPixBrCode } from '../payments/lib/build-pix-brcode';

const RESERVATION_TTL_MS = 10 * 60_000;
const CLAIM_TOKEN_TTL_MS = 24 * 60 * 60_000;

interface TxResult {
  orderId: string;
  status: OrderStatus;
  ticketIds: string[];
  ghostUserCreated: boolean;
  duplicate: boolean;
  userId: string;
  buyerEmail: string;
  buyerFirstName: string | null;
  ghostNeedsClaim: boolean;
  eventTitle: string;
  eventArtist: string;
  eventStartsAt: Date;
  venueName: string;
  venueCity: string;
  totalCents: number;
  ticketsForEmail: Array<{
    shortCode: string;
    sectorName: string;
    qrToken: string;
  }>;
}

@Injectable()
export class SellByEmailService {
  private readonly logger = new Logger(SellByEmailService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    private readonly users: UsersService,
    private readonly orders: OrdersService,
    private readonly claimTokens: ClaimTokensService,
    private readonly emails: EmailService,
  ) {}

  async sell(
    currentUser: AuthenticatedUser,
    eventId: string,
    dto: SellByEmailDto,
  ): Promise<SellByEmailResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    const email = dto.email.trim().toLowerCase();
    const markPaid = dto.markPaid ?? true;

    const event = await this.events.findOne({
      where: { id: eventId },
      relations: { venue: true },
    });
    if (!event) throw new NotFoundException('event not found');
    if (
      currentUser.role !== Role.ADMIN &&
      dbUser.producerId !== event.producerId
    ) {
      throw new ForbiddenException('not your event');
    }

    // Idempotency: hash(eventId + email + sectorId + qty + hourBucket).
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const externalId = `sbm:${createHash('sha256')
      .update(`${eventId}|${email}|${dto.sectorId}|${dto.qty}|${hourBucket}`)
      .digest('hex')
      .slice(0, 40)}`;

    const existingByExternal = await this.dataSource
      .getRepository(Order)
      .findOne({ where: { paymentId: externalId } });
    if (existingByExternal) {
      return {
        orderId: existingByExternal.id,
        status: existingByExternal.status,
        ticketIds: [],
        ghostUserCreated: false,
        emailSent: false,
        claimUrl: null,
        pixCopyPaste: null,
        totalCents: existingByExternal.totalCents ?? null,
      };
    }

    // Resolve / create user before opening the transaction.
    let user = await this.users.findByEmail(email);
    let ghostUserCreated = false;
    if (!user) {
      user = await this.users.create({
        email,
        name: dto.buyerName ?? null,
        cpf: null,
        phone: null,
        passwordHash: null,
      });
      ghostUserCreated = true;
    } else if (!user.passwordHash && dto.buyerName && !user.name) {
      user = await this.users.update(user.id, { name: dto.buyerName });
    }

    const ghostNeedsClaim = !user.passwordHash;
    const buyerFirstName = user.name?.trim().split(/\s+/)[0] ?? null;
    const userId = user.id;

    const txResult: TxResult = await this.dataSource.transaction(async (mgr) => {
      const sector = await mgr
        .getRepository(Sector)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id = :id', { id: dto.sectorId })
        .andWhere('s.eventId = :eventId', { eventId: event.id })
        .getOne();
      if (!sector) {
        throw new BadRequestException('sector does not belong to this event');
      }
      const available = sector.capacity - sector.sold - sector.reserved;
      if (available < dto.qty) {
        throw new BadRequestException(
          `not enough stock in sector ${sector.name} (${available} left)`,
        );
      }

      sector.reserved += dto.qty;
      const subtotalCents = sector.priceCents * dto.qty;
      const feeRate = Number(event.platformFeeRate);
      const feeCents = Math.round(subtotalCents * feeRate);
      const totalCents = subtotalCents + feeCents;

      await mgr.getRepository(Sector).save(sector);

      const order = new Order();
      order.id = createId();
      order.userId = userId;
      order.status = OrderStatus.PENDING;
      order.subtotalCents = subtotalCents;
      order.feeCents = feeCents;
      order.discountCents = 0;
      order.totalCents = totalCents;
      order.paymentMethod = null;
      order.paymentId = externalId;
      order.reservedUntil = new Date(Date.now() + RESERVATION_TTL_MS);
      order.paidAt = null;
      const item = new OrderItem();
      item.id = createId();
      item.sectorId = sector.id;
      item.qty = dto.qty;
      item.priceCents = sector.priceCents;
      order.items = [item];
      await mgr.getRepository(Order).save(order);

      let ticketIds: string[] = [];
      let ticketsForEmail: TxResult['ticketsForEmail'] = [];

      if (markPaid) {
        const fresh = await mgr.getRepository(Order).findOne({
          where: { id: order.id },
          relations: { items: { sector: { event: { venue: true } } } },
        });
        if (!fresh) throw new NotFoundException('order vanished');
        const confirmed = await this.orders.markOrderPaid(mgr, fresh, {
          allowMissingPaymentMethod: true,
        });
        ticketIds = confirmed.ticketIds;
        const tickets = await mgr
          .getRepository(Ticket)
          .find({ where: { orderId: order.id } });
        ticketsForEmail = tickets.map((t) => ({
          shortCode: t.shortCode,
          sectorName: sector.name,
          qrToken: t.qrToken,
        }));
      }

      return {
        orderId: order.id,
        status: markPaid ? OrderStatus.PAID : OrderStatus.PENDING,
        ticketIds,
        ghostUserCreated,
        duplicate: false,
        userId,
        buyerEmail: email,
        buyerFirstName,
        ghostNeedsClaim,
        eventTitle: event.title,
        eventArtist: event.artist,
        eventStartsAt: event.startsAt,
        venueName: event.venue?.name ?? '',
        venueCity: event.venue?.city ?? '',
        totalCents,
        ticketsForEmail,
      };
    });

    let claimUrl: string | null = null;
    if (txResult.ghostNeedsClaim) {
      const claim = await this.claimTokens.upsertClaim(
        txResult.userId,
        CLAIM_TOKEN_TTL_MS,
      );
      claimUrl = `${this.emails.baseUrl}/claim?token=${encodeURIComponent(claim.token)}`;
    }

    let emailSent = false;
    if (txResult.ticketsForEmail.length > 0) {
      const ticketsWithQr = await Promise.all(
        txResult.ticketsForEmail.map(async (t) => ({
          shortCode: t.shortCode,
          sectorName: t.sectorName,
          qrPngBase64: await renderQrPngBase64(t.qrToken),
        })),
      );
      try {
        await this.emails.sendTicketByEmail({
          to: txResult.buyerEmail,
          buyerFirstName: txResult.buyerFirstName,
          eventTitle: txResult.eventTitle,
          eventArtist: txResult.eventArtist,
          eventStartsAt: txResult.eventStartsAt,
          venueName: txResult.venueName,
          venueCity: txResult.venueCity,
          tickets: ticketsWithQr,
          claimUrl: claimUrl ?? undefined,
        });
        emailSent = true;
      } catch (err) {
        this.logger.warn(
          `sell-by-email: ticket email failed for ${txResult.buyerEmail}: ${(err as Error).message}`,
        );
      }
    }

    let pixCopyPaste: string | null = null;
    if (
      txResult.status === OrderStatus.PENDING &&
      event.paymentProvider === PaymentProvider.MANUAL_PIX &&
      event.pixKey
    ) {
      try {
        pixCopyPaste = buildPixBrCode({
          key: event.pixKey,
          holderName: event.pixHolderName ?? 'EASY TICKET',
          city: event.venue?.city ?? 'SAO PAULO',
          amountCents: txResult.totalCents,
          txid: txResult.orderId,
        });
      } catch (err) {
        this.logger.warn(
          `sell-by-email: failed to generate BR-Code for ${txResult.orderId}: ${(err as Error).message}`,
        );
      }
    }

    return {
      orderId: txResult.orderId,
      status: txResult.status,
      ticketIds: txResult.ticketIds,
      ghostUserCreated: txResult.ghostUserCreated,
      emailSent,
      claimUrl,
      pixCopyPaste,
      totalCents: txResult.totalCents,
    };
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
