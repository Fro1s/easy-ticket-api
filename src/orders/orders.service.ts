import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, EntityManager, LessThan } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Sector } from '../events/entities/sector.entity';
import { Event } from '../events/entities/event.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import {
  ConfirmedOrderResponse,
  OrderResponse,
  OrderPaymentInfo,
} from './dto/order.response';
import { OrderStatus } from '../common/enums/order-status.enum';
import { PaymentMethod } from '../common/enums/payment-method.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { PaymentsProviderRegistry } from '../payments/payments-provider.registry';
import type { PaymentChargeInfo } from '../payments/payments.types';
import { calculateProcessingFeeCents } from '../payments/lib/calculate-processing-fee';
import { UsersService } from '../users/users.service';
import { EmailService } from '../email/email.service';
import { OrdersStreamService } from './orders-stream.service';
import * as QRCode from 'qrcode';

const RESERVATION_TTL_MS = 10 * 60_000;
const COMPETITOR_FEE_RATE = 0.2;
// Mocked in-memory cache of payment session data per order (until we move to Redis).
const paymentCache = new Map<string, PaymentChargeInfo>();

@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly paymentsRegistry: PaymentsProviderRegistry,
    private readonly users: UsersService,
    private readonly emails: EmailService,
    private readonly stream: OrdersStreamService,
    private readonly config: ConfigService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE, { name: 'orders:expire-stale' })
  async expireStaleOrdersJob(): Promise<void> {
    const stale = await this.dataSource.getRepository(Order).find({
      where: {
        status: OrderStatus.PENDING,
        reservedUntil: LessThan(new Date()),
      },
      select: { id: true },
      take: 200,
    });

    if (stale.length === 0) return;

    let expired = 0;
    for (const { id } of stale) {
      try {
        const fresh = await this.dataSource.getRepository(Order).findOne({
          where: { id },
        });
        if (fresh) {
          await this.expireIfStale(fresh);
          if (fresh.status === OrderStatus.EXPIRED) expired += 1;
        }
      } catch (err) {
        this.logger.warn(
          `failed to expire order ${id}: ${(err as Error).message}`,
        );
      }
    }
    if (expired > 0) {
      this.logger.log(`expired ${expired} stale order(s)`);
    }
  }

  async create(userId: string, dto: CreateOrderDto): Promise<OrderResponse> {
    return this.dataSource.transaction(async (mgr) => {
      const eventRepo = mgr.getRepository(Event);
      const sectorRepo = mgr.getRepository(Sector);
      const orderRepo = mgr.getRepository(Order);

      const event = await eventRepo.findOne({
        where: { slug: dto.eventSlug },
        relations: { venue: true },
      });
      if (!event) throw new NotFoundException('event not found');
      if (event.status !== EventStatus.PUBLISHED) {
        throw new BadRequestException('event is not on sale');
      }

      const sectorIds = dto.items.map((it) => it.sectorId);
      if (new Set(sectorIds).size !== sectorIds.length) {
        throw new BadRequestException('duplicate sector in items');
      }

      const sectors = await sectorRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id IN (:...ids)', { ids: sectorIds })
        .andWhere('s.eventId = :eventId', { eventId: event.id })
        .getMany();

      if (sectors.length !== sectorIds.length) {
        throw new BadRequestException('sector does not belong to this event');
      }
      const bySectorId = new Map(sectors.map((s) => [s.id, s]));

      let subtotalCents = 0;
      const itemsToInsert: OrderItem[] = [];

      for (const item of dto.items) {
        const sector = bySectorId.get(item.sectorId)!;
        const available = sector.capacity - sector.sold - sector.reserved;
        if (available < item.qty) {
          throw new ConflictException(
            `not enough stock in sector ${sector.name} (${available} left)`,
          );
        }
        sector.reserved += item.qty;
        subtotalCents += sector.priceCents * item.qty;

        const oi = new OrderItem();
        oi.id = createId();
        oi.sectorId = sector.id;
        oi.qty = item.qty;
        oi.priceCents = sector.priceCents;
        itemsToInsert.push(oi);
      }

      await sectorRepo.save(sectors);

      const feeRate = Number(event.platformFeeRate);
      const feeCents = Math.round(subtotalCents * feeRate);
      const totalCents = subtotalCents + feeCents;

      const order = new Order();
      order.id = createId();
      order.userId = userId;
      order.status = OrderStatus.PENDING;
      order.subtotalCents = subtotalCents;
      order.feeCents = feeCents;
      order.discountCents = 0;
      order.totalCents = totalCents;
      order.paymentMethod = null;
      order.paymentId = null;
      order.reservedUntil = new Date(Date.now() + RESERVATION_TTL_MS);
      order.paidAt = null;
      order.items = itemsToInsert;

      await orderRepo.save(order);

      return this.serialize(order, event, sectors);
    });
  }

  async findOne(userId: string, orderId: string): Promise<OrderResponse> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId },
      relations: { items: { sector: { event: { venue: true } } } },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();

    await this.expireIfStale(order);

    const event = order.items[0]?.sector?.event;
    if (!event) throw new NotFoundException('order has no event');
    const sectors = order.items.map((it) => it.sector!).filter(Boolean);
    return this.serialize(order, event, sectors);
  }

  async checkout(
    userId: string,
    orderId: string,
    dto: CheckoutOrderDto,
  ): Promise<OrderResponse> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId },
      relations: { items: { sector: { event: { venue: true } } } },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.userId !== userId) throw new ForbiddenException();
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('order is not pending');
    }
    if (order.reservedUntil.getTime() < Date.now()) {
      await this.expireIfStale(order);
      throw new BadRequestException('order reservation expired');
    }

    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('user not found');

    const event = order.items[0]!.sector!.event!;
    const provider = this.paymentsRegistry.resolve(event.paymentProvider);

    const feeCfg = {
      pixFixedCents: Math.round(Number(this.config.get('ABACATEPAY_FEE_PIX_FIXED_BRL') ?? 0.80) * 100),
      cardPercent: Number(this.config.get('ABACATEPAY_FEE_CARD_PERCENT') ?? 3.5),
      cardFixedCents: Math.round(Number(this.config.get('ABACATEPAY_FEE_CARD_FIXED_BRL') ?? 0.60) * 100),
    };
    const processingFeeCents = calculateProcessingFeeCents({
      provider: event.paymentProvider,
      method: dto.method,
      subtotalCents: order.subtotalCents,
      config: feeCfg,
    });
    order.processingFeeCents = processingFeeCents;
    order.processingFeeMethod = processingFeeCents > 0 ? dto.method : null;
    order.totalCents = order.subtotalCents + order.feeCents + processingFeeCents;

    const charge = await provider.createCharge({
      orderId: order.id,
      totalCents: order.totalCents,
      method: dto.method,
      buyerEmail: user.email,
      buyerName: user.name,
      buyerCpf: user.cpf,
      event: {
        id: event.id,
        paymentProvider: event.paymentProvider,
        pixKey: event.pixKey,
        pixKeyType: event.pixKeyType,
        pixHolderName: event.pixHolderName,
        venueCity: event.venue?.city ?? null,
      },
    });
    paymentCache.set(order.id, charge);

    order.paymentMethod = dto.method;
    order.paymentId = charge.paymentId;
    await this.dataSource.getRepository(Order).save(order);

    if (charge.status === 'PAID') {
      await this.dataSource.transaction(async (mgr) => {
        const fresh = await mgr.getRepository(Order).findOne({
          where: { id: order.id },
          relations: { items: { sector: { event: { venue: true } } } },
        });
        if (fresh) {
          await this.markOrderPaid(mgr, fresh, {
            allowMissingPaymentMethod: false,
            sendEmail: true,
          });
        }
      });
      // Reload to get updated status for the response.
      const reloaded = await this.dataSource.getRepository(Order).findOne({
        where: { id: order.id },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (reloaded) {
        const finalSectors = reloaded.items.map((it) => it.sector!).filter(Boolean);
        return this.serialize(reloaded, event, finalSectors);
      }
    }

    const sectors = order.items.map((it) => it.sector!).filter(Boolean);
    return this.serialize(order, event, sectors);
  }

  /**
   * DEV ONLY — simulates the gateway webhook hitting our backend after the
   * buyer pays. Marks the order PAID, increments sold counts, and issues
   * tickets. Will be replaced by `POST /payments/webhook` in PR 5.
   */
  async simulatePayment(
    userId: string,
    orderId: string,
  ): Promise<ConfirmedOrderResponse> {
    return this.dataSource.transaction(async (mgr) => {
      const order = await mgr.getRepository(Order).findOne({
        where: { id: orderId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId) throw new ForbiddenException();
      return this.markOrderPaid(mgr, order, {
        allowMissingPaymentMethod: false,
        sendEmail: true,
      });
    });
  }

  /**
   * Called by the AbacatePay webhook on `billing.paid`. Looks up the Order by
   * paymentId (the charge id returned at checkout time) and marks it PAID.
   * Idempotent: a second call for the same paymentId is a no-op.
   */
  async markPaidByPaymentId(paymentId: string): Promise<void> {
    await this.dataSource.transaction(async (mgr) => {
      const order = await mgr.getRepository(Order).findOne({
        where: { paymentId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) {
        this.logger.warn(`webhook: no order found for paymentId=${paymentId}`);
        return;
      }
      if (order.status === OrderStatus.PAID) return; // idempotent
      if (!order.paymentMethod) order.paymentMethod = PaymentMethod.PIX;
      await this.markOrderPaid(mgr, order, {
        allowMissingPaymentMethod: true,
        sendEmail: true,
      });
    });
  }

  /**
   * Shared core used by both `simulatePayment` (dev webhook stand-in) and the
   * producer-driven manual confirmation flow. Caller must pass an open
   * EntityManager (transaction). Locks sectors, moves reserved → sold, emits
   * Tickets, and marks the Order PAID. Idempotent: returns existing tickets if
   * the order was already PAID.
   */
  async markOrderPaid(
    mgr: EntityManager,
    order: Order,
    opts: { allowMissingPaymentMethod: boolean; sendEmail?: boolean },
  ): Promise<ConfirmedOrderResponse> {
    const orderRepo = mgr.getRepository(Order);
    const sectorRepo = mgr.getRepository(Sector);
    const ticketRepo = mgr.getRepository(Ticket);

    if (order.status === OrderStatus.PAID) {
      const tickets = await ticketRepo.find({ where: { orderId: order.id } });
      const event = order.items[0]!.sector!.event!;
      const sectors = order.items.map((it) => it.sector!).filter(Boolean);
      const base = await this.serialize(order, event, sectors);
      return { ...base, ticketIds: tickets.map((t) => t.id) };
    }
    if (order.status !== OrderStatus.PENDING) {
      throw new BadRequestException('order is not payable');
    }
    if (!order.paymentMethod) {
      if (!opts.allowMissingPaymentMethod) {
        throw new BadRequestException('checkout has not been started');
      }
      // Manual confirm path: stamp PIX so downstream serialization is happy.
      order.paymentMethod = PaymentMethod.PIX;
      if (!order.paymentId) order.paymentId = `manual_${order.id}`;
    }

    const sectorIds = order.items.map((it) => it.sectorId);
    const sectors = await sectorRepo
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.id IN (:...ids)', { ids: sectorIds })
      .getMany();
    const bySectorId = new Map(sectors.map((s) => [s.id, s]));

    const tickets: Ticket[] = [];
    for (const item of order.items) {
      const sector = bySectorId.get(item.sectorId)!;
      sector.reserved = Math.max(0, sector.reserved - item.qty);
      sector.sold += item.qty;

      for (let i = 0; i < item.qty; i++) {
        const t = new Ticket();
        t.id = createId();
        t.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
        t.qrToken = `et:${order.id}:${createId()}`;
        t.orderId = order.id;
        t.userId = order.userId;
        t.eventId = sector.eventId;
        t.sectorId = sector.id;
        t.status = TicketStatus.VALID;
        tickets.push(t);
      }
    }

    await sectorRepo.save(sectors);
    await ticketRepo.save(tickets);

    order.status = OrderStatus.PAID;
    order.paidAt = new Date();
    paymentCache.delete(order.id);
    await orderRepo.save(order);
    this.stream.notify(order.id, OrderStatus.PAID, order.paidAt);

    const event = order.items[0]!.sector!.event!;
    const finalSectors = order.items
      .map((it) => bySectorId.get(it.sectorId)!)
      .filter(Boolean);
    const base = await this.serialize(order, event, finalSectors);

    // Fire email out of band (don't fail the transaction if email throws).
    if (opts.sendEmail) {
      const buyer = await this.users.findById(order.userId);
      if (buyer?.email) {
        const ticketsForEmail = await Promise.all(
          tickets.map(async (t) => {
            const sector = bySectorId.get(t.sectorId)!;
            return {
              shortCode: t.shortCode,
              sectorName: sector.name,
              qrPngBase64: await renderQrPngBase64(t.qrToken),
            };
          }),
        );
        const firstName = buyer.name ? buyer.name.trim().split(/\s+/)[0] : null;
        try {
          await this.emails.sendTicketPurchased({
            to: buyer.email,
            buyerFirstName: firstName ?? null,
            eventTitle: event.title,
            eventArtist: event.artist,
            eventStartsAt: event.startsAt,
            venueName: event.venue?.name ?? '',
            venueCity: event.venue?.city ?? '',
            tickets: ticketsForEmail,
          });
        } catch (err) {
          this.logger.warn(
            `markOrderPaid: ticket email failed for ${buyer.email}: ${(err as Error).message}`,
          );
        }
      }
    }

    return { ...base, ticketIds: tickets.map((t) => t.id) };
  }

  // ---------- private ----------

  private async expireIfStale(order: Order): Promise<void> {
    if (
      order.status !== OrderStatus.PENDING ||
      order.reservedUntil.getTime() >= Date.now()
    )
      return;

    await this.dataSource.transaction(async (mgr) => {
      const orderRepo = mgr.getRepository(Order);
      const sectorRepo = mgr.getRepository(Sector);

      const fresh = await orderRepo.findOne({
        where: { id: order.id },
        relations: { items: true },
      });
      if (!fresh || fresh.status !== OrderStatus.PENDING) return;

      const sectorIds = fresh.items.map((it) => it.sectorId);
      const sectors = await sectorRepo
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id IN (:...ids)', { ids: sectorIds })
        .getMany();
      const bySectorId = new Map(sectors.map((s) => [s.id, s]));
      for (const it of fresh.items) {
        const s = bySectorId.get(it.sectorId);
        if (s) s.reserved = Math.max(0, s.reserved - it.qty);
      }
      await sectorRepo.save(sectors);

      fresh.status = OrderStatus.EXPIRED;
      await orderRepo.save(fresh);
      paymentCache.delete(fresh.id);

      order.status = OrderStatus.EXPIRED;
      this.stream.notify(fresh.id, OrderStatus.EXPIRED);
    });
  }

  private async serialize(
    order: Order,
    event: Event,
    sectors: Sector[],
  ): Promise<OrderResponse> {
    const sectorById = new Map(sectors.map((s) => [s.id, s]));

    const items = order.items.map((it) => {
      const s = sectorById.get(it.sectorId);
      return {
        id: it.id,
        sectorId: it.sectorId,
        sectorName: s?.name ?? '',
        sectorColorHex: s?.colorHex ?? '#999999',
        qty: it.qty,
        priceCents: it.priceCents,
      };
    });

    const competitorFeeCents = Math.round(
      order.subtotalCents * COMPETITOR_FEE_RATE,
    );
    const competitorTotalCents = order.subtotalCents + competitorFeeCents;
    const savingsCents = competitorTotalCents - order.totalCents;

    let payment: OrderPaymentInfo | null = null;
    if (order.paymentMethod && order.paymentId) {
      const cached = paymentCache.get(order.id);
      const pixDiscountCents = 0;
      const fallbackProviderName = (() => {
        try {
          return this.paymentsRegistry.resolve(event.paymentProvider).name;
        } catch {
          return 'unknown';
        }
      })();
      payment = {
        provider: cached?.provider ?? fallbackProviderName,
        paymentId: order.paymentId,
        method: order.paymentMethod,
        status: order.status === OrderStatus.PAID ? 'PAID' : (cached?.status ?? 'PENDING'),
        copyPaste: cached?.copyPaste ?? null,
        expiresAt:
          cached?.expiresAt ?? new Date(Date.now() + 60_000).toISOString(),
        pixDiscountCents,
        redirectUrl: cached?.redirectUrl ?? null,
      };
    }

    return {
      id: order.id,
      status: order.status,
      subtotalCents: order.subtotalCents,
      feeCents: order.feeCents,
      discountCents: order.discountCents,
      totalCents: order.totalCents,
      paymentMethod: order.paymentMethod,
      reservedUntil: order.reservedUntil.toISOString(),
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      event: {
        id: event.id,
        slug: event.slug,
        title: event.title,
        artist: event.artist,
        startsAt: event.startsAt.toISOString(),
        doorsAt: event.doorsAt.toISOString(),
        posterUrl: event.posterUrl,
        venueName: event.venue?.name ?? '',
        venueCity: event.venue?.city ?? '',
        venueState: event.venue?.state ?? '',
      },
      items,
      payment,
      processingFeeCents: order.processingFeeCents,
      processingFeeMethod: order.processingFeeMethod,
      competitorTotalCents,
      savingsCents,
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
