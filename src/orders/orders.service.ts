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
import { DataSource, EntityManager, In, LessThan } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { resolveActiveBatch, isBatchOpen } from '../events/lib/active-batch';
import { Event } from '../events/entities/event.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import { UpdateOrderAttendeesDto } from './dto/attendee.dto';
import { validateAttendees } from './lib/validate-attendees';
import { existingOrderMatchesRequest } from './lib/order-reuse';
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
/** Máximo de unidades (soma de qty) por pedido. */
const MAX_QTY_PER_ORDER = 2;
// In-memory cache of payment session data per order. Entries are stamped with
// an expiry and swept lazily so the map can't grow unbounded (single-instance
// only — move to Redis before running >1 machine).
const PAYMENT_CACHE_TTL_MS = 40 * 60_000;
interface PaymentCacheEntry {
  charge: PaymentChargeInfo;
  expiresAt: number;
}
const paymentCache = new Map<string, PaymentCacheEntry>();

function paymentCacheSet(orderId: string, charge: PaymentChargeInfo): void {
  const now = Date.now();
  paymentCache.set(orderId, { charge, expiresAt: now + PAYMENT_CACHE_TTL_MS });
  // Lazy sweep so the map stays bounded even if a cancel path forgets to delete.
  if (paymentCache.size > 500) {
    for (const [k, v] of paymentCache) {
      if (v.expiresAt <= now) paymentCache.delete(k);
    }
  }
}

function paymentCacheGet(orderId: string): PaymentChargeInfo | null {
  const entry = paymentCache.get(orderId);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    paymentCache.delete(orderId);
    return null;
  }
  return entry.charge;
}

/**
 * Side effects that must run AFTER the confirming DB transaction commits and
 * releases its Sector/Batch row locks — never while holding them, or every
 * concurrent buyer of the same event serializes behind this network I/O.
 */
interface PaidSideEffects {
  orderId: string;
  paidAt: Date;
  order: Order;
  tickets: Ticket[];
  event: Event;
  sectorById: Map<string, Sector>;
  sendEmail: boolean;
}

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

      // Anti-flood: se o usuário já tem um pedido PENDENTE e ainda válido (não
      // expirado) para este evento, reusa ele em vez de criar outro. Sem isso,
      // cada clique em "Ir para pagamento" gerava um pedido novo — a origem do
      // monte de pendentes órfãos.
      const existing = await orderRepo
        .createQueryBuilder('o')
        .innerJoin('o.items', 'oi')
        .innerJoin('oi.sector', 's')
        .where('o.userId = :userId', { userId })
        .andWhere('o.status = :status', { status: OrderStatus.PENDING })
        .andWhere('o.reservedUntil > NOW()')
        .andWhere('s.eventId = :eventId', { eventId: event.id })
        .orderBy('o.createdAt', 'DESC')
        .getOne();
      if (existing) {
        const full = await orderRepo.findOne({
          where: { id: existing.id },
          relations: { items: { sector: { event: { venue: true } } } },
        });
        if (full) {
          // Só reusa se o pedido pendente representa a MESMA seleção (mesmo
          // lote/combo). Se o usuário trocou (ex.: avulso → combo), o pedido
          // antigo é cancelado para liberar a reserva e seguimos criando o novo.
          const existingBatches = await mgr.getRepository(Batch).find({
            where: { id: In(full.items.map((it) => it.batchId)) },
          });
          const tpuByBatchId = new Map(
            existingBatches.map((b) => [b.id, b.ticketsPerUnit ?? 1]),
          );
          const matches = existingOrderMatchesRequest(
            full.items.map((it) => ({
              batchId: it.batchId,
              ticketsPerUnit: tpuByBatchId.get(it.batchId) ?? 1,
            })),
            dto.items.map((it) => ({
              sectorId: it.sectorId,
              batchId: it.batchId,
            })),
          );
          if (matches) {
            const ev = full.items[0].sector.event;
            const secs = full.items.map((it) => it.sector).filter(Boolean);
            return this.serialize(full, ev, secs, mgr);
          }
          await this.cancelPendingOrderTx(mgr, full);
        }
      }

      const sectorIds = dto.items.map((it) => it.sectorId);
      if (new Set(sectorIds).size !== sectorIds.length) {
        throw new BadRequestException('duplicate sector in items');
      }

      // Limite de 2 unidades por pedido (soma de qty de todos os itens).
      const totalQty = dto.items.reduce((s, it) => s + it.qty, 0);
      if (totalQty > MAX_QTY_PER_ORDER) {
        throw new BadRequestException(
          `máximo de ${MAX_QTY_PER_ORDER} ingressos por pedido`,
        );
      }

      // Validation/resolution reads WITHOUT locks. Stock contention is confined
      // to the atomic conditional UPDATEs at the very end of the transaction, so
      // the hot batch row lock is held for microseconds instead of the whole
      // request (which otherwise serialized every concurrent buyer and starved
      // the connection pool under a burst).
      const sectors = await sectorRepo
        .createQueryBuilder('s')
        .where('s.id IN (:...ids)', { ids: sectorIds })
        .andWhere('s.eventId = :eventId', { eventId: event.id })
        .getMany();

      if (sectors.length !== sectorIds.length) {
        throw new BadRequestException('sector does not belong to this event');
      }
      const bySectorId = new Map(sectors.map((s) => [s.id, s]));

      const batchRepo = mgr.getRepository(Batch);
      const allBatches = await batchRepo
        .createQueryBuilder('b')
        .where('b.sectorId IN (:...ids)', { ids: sectorIds })
        .andWhere('b."producerOnly" = false')
        .getMany();
      const batchesBySector = new Map<string, Batch[]>();
      for (const b of allBatches) {
        const arr = batchesBySector.get(b.sectorId) ?? [];
        arr.push(b);
        batchesBySector.set(b.sectorId, arr);
      }
      const now = new Date();

      let subtotalCents = 0;
      const itemsToInsert: OrderItem[] = [];
      const reserves: {
        batchId: string;
        sectorId: string;
        qty: number;
        batchName: string;
      }[] = [];

      for (const item of dto.items) {
        const sector = bySectorId.get(item.sectorId)!;
        const sectorBatches = batchesBySector.get(sector.id) ?? [];
        const snapshots = sectorBatches.map((b) => ({
          id: b.id,
          name: b.name,
          priceCents: b.priceCents,
          ticketsPerUnit: b.ticketsPerUnit ?? 1,
          capacity: b.capacity,
          sold: b.sold,
          reserved: b.reserved,
          sortOrder: b.sortOrder,
          startsAt: b.startsAt,
          endsAt: b.endsAt,
          isActive: b.isActive,
        }));

        let batch: Batch;
        if (item.batchId) {
          const chosen = sectorBatches.find((b) => b.id === item.batchId);
          if (!chosen) {
            throw new BadRequestException('lote não pertence ao setor');
          }
          const snap = snapshots.find((s) => s.id === chosen.id)!;
          if (!isBatchOpen(snap, now)) {
            throw new ConflictException(`lote ${chosen.name} indisponível`);
          }
          batch = chosen;
        } else {
          const { active } = resolveActiveBatch(
            snapshots.filter((s) => s.ticketsPerUnit <= 1),
            now,
          );
          if (!active) {
            throw new ConflictException(
              `setor ${sector.name} sem lote disponível`,
            );
          }
          batch = sectorBatches.find((b) => b.id === active.id)!;
        }

        const tpu = batch.ticketsPerUnit ?? 1;
        if (tpu > 1 && item.qty > 1) {
          throw new BadRequestException('máximo de 1 combo por pedido');
        }

        subtotalCents += batch.priceCents * item.qty;

        const oi = new OrderItem();
        oi.id = createId();
        oi.sectorId = sector.id;
        oi.batchId = batch.id;
        oi.qty = item.qty;
        oi.priceCents = batch.priceCents;
        itemsToInsert.push(oi);
        reserves.push({
          batchId: batch.id,
          sectorId: sector.id,
          qty: item.qty,
          batchName: batch.name,
        });
      }

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

      // ---- Contended critical section (kept minimal) ----
      // Atomic conditional reserve: the WHERE clause is the no-oversell check,
      // so no row lock is ever held across reads/round-trips. Sorted by id for a
      // stable lock-acquisition order across concurrent multi-item orders.
      const sortedReserves = [...reserves].sort((a, b) =>
        a.batchId < b.batchId ? -1 : a.batchId > b.batchId ? 1 : 0,
      );
      for (const r of sortedReserves) {
        const upd = await batchRepo
          .createQueryBuilder()
          .update(Batch)
          .set({ reserved: () => `reserved + ${r.qty}` })
          .where('id = :id', { id: r.batchId })
          .andWhere('capacity - sold - reserved >= :qty', { qty: r.qty })
          .execute();
        if (!upd.affected) {
          throw new ConflictException(`lote ${r.batchName} sem estoque`);
        }
      }

      const sectorReserve = new Map<string, number>();
      for (const r of reserves) {
        sectorReserve.set(
          r.sectorId,
          (sectorReserve.get(r.sectorId) ?? 0) + r.qty,
        );
      }
      for (const sid of Array.from(sectorReserve.keys()).sort()) {
        await sectorRepo
          .createQueryBuilder()
          .update(Sector)
          .set({ reserved: () => `reserved + ${sectorReserve.get(sid)!}` })
          .where('id = :id', { id: sid })
          .execute();
      }

      return this.serialize(order, event, sectors, mgr);
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
    const sectors = order.items.map((it) => it.sector).filter(Boolean);
    return this.serialize(order, event, sectors);
  }

  async updateAttendees(
    userId: string,
    orderId: string,
    dto: UpdateOrderAttendeesDto,
  ): Promise<OrderResponse> {
    return this.dataSource.transaction(async (mgr) => {
      const order = await mgr.getRepository(Order).findOne({
        where: { id: orderId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId) throw new ForbiddenException();
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException('order is not pending');
      }

      const batches = await mgr.getRepository(Batch).find({
        where: { id: In(order.items.map((i) => i.batchId)) },
      });
      const byBatchId = new Map(batches.map((b) => [b.id, b]));
      const dtoByItemId = new Map(
        dto.items.map((i) => [i.orderItemId, i.attendees]),
      );

      for (const item of order.items) {
        const incoming = dtoByItemId.get(item.id);
        if (!incoming) continue;
        const batch = byBatchId.get(item.batchId);
        if (!batch) {
          throw new BadRequestException(`batch not found for item ${item.id}`);
        }
        const normalized = incoming.map((a) => ({
          name: a.name.trim(),
          email: a.email?.trim().toLowerCase() || null,
        }));
        validateAttendees({
          qty: item.qty,
          ticketsPerUnit: batch.ticketsPerUnit,
          attendees: normalized,
          requireEmail: (batch.ticketsPerUnit ?? 1) > 1,
        });
        item.attendees = normalized;
        await mgr.getRepository(OrderItem).save(item);
      }

      const event = order.items[0].sector.event;
      const sectors = order.items.map((it) => it.sector).filter(Boolean);
      return this.serialize(order, event, sectors);
    });
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

    const event = order.items[0].sector.event;

    if (dto.method === PaymentMethod.CARD && event.cardEnabled === false) {
      throw new BadRequestException(
        'este evento não aceita pagamento por cartão',
      );
    }

    const checkoutBatches = await this.dataSource
      .getRepository(Batch)
      .find({ where: { id: In(order.items.map((i) => i.batchId)) } });
    const batchById = new Map(checkoutBatches.map((b) => [b.id, b]));
    for (const item of order.items) {
      const batch = batchById.get(item.batchId)!;
      validateAttendees({
        qty: item.qty,
        ticketsPerUnit: batch.ticketsPerUnit,
        attendees: item.attendees ?? null,
      });
    }

    const provider = this.paymentsRegistry.resolve(event.paymentProvider);

    const feeCfg = {
      pixFixedCents: Math.round(
        Number(this.config.get('ABACATEPAY_FEE_PIX_FIXED_BRL') ?? 0.8) * 100,
      ),
      cardPercent: Number(
        this.config.get('ABACATEPAY_FEE_CARD_PERCENT') ?? 3.5,
      ),
      cardFixedCents: Math.round(
        Number(this.config.get('ABACATEPAY_FEE_CARD_FIXED_BRL') ?? 0.6) * 100,
      ),
    };
    const processingFeeCents = calculateProcessingFeeCents({
      provider: event.paymentProvider,
      method: dto.method,
      subtotalCents: order.subtotalCents,
      config: feeCfg,
    });
    order.processingFeeCents = processingFeeCents;
    order.processingFeeMethod = processingFeeCents > 0 ? dto.method : null;
    order.totalCents =
      order.subtotalCents + order.feeCents + processingFeeCents;

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
    paymentCacheSet(order.id, charge);

    order.paymentMethod = dto.method;
    order.paymentId = charge.paymentId;
    await this.dataSource.getRepository(Order).save(order);

    if (charge.status === 'PAID') {
      const deferred: PaidSideEffects[] = [];
      await this.dataSource.transaction(async (mgr) => {
        const fresh = await mgr.getRepository(Order).findOne({
          where: { id: order.id },
          relations: { items: { sector: { event: { venue: true } } } },
        });
        if (fresh) {
          await this.markOrderPaid(mgr, fresh, {
            allowMissingPaymentMethod: false,
            sendEmail: true,
            deferSideEffects: deferred,
          });
        }
      });
      for (const fx of deferred) await this.runPaidSideEffects(fx);
      // Reload to get updated status for the response.
      const reloaded = await this.dataSource.getRepository(Order).findOne({
        where: { id: order.id },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (reloaded) {
        const finalSectors = reloaded.items
          .map((it) => it.sector)
          .filter(Boolean);
        return this.serialize(reloaded, event, finalSectors);
      }
    }

    const sectors = order.items.map((it) => it.sector).filter(Boolean);
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
    // DEV ONLY: this endpoint mints paid tickets without any real payment.
    // It must never be reachable in production, where a confirmed order is the
    // gateway webhook's job alone.
    if (this.config.get('NODE_ENV') === 'production') {
      throw new NotFoundException();
    }
    const deferred: PaidSideEffects[] = [];
    const result = await this.dataSource.transaction(async (mgr) => {
      const order = await mgr.getRepository(Order).findOne({
        where: { id: orderId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) throw new NotFoundException('order not found');
      if (order.userId !== userId) throw new ForbiddenException();
      return this.markOrderPaid(mgr, order, {
        allowMissingPaymentMethod: false,
        sendEmail: true,
        deferSideEffects: deferred,
      });
    });
    for (const fx of deferred) await this.runPaidSideEffects(fx);
    return result;
  }

  /**
   * Called by the AbacatePay webhook on `billing.paid`. Looks up the Order by
   * paymentId (the charge id returned at checkout time) and marks it PAID.
   * Idempotent: a second call for the same paymentId is a no-op.
   */
  async markPaidByPaymentId(
    paymentId: string,
    paidAmountCents?: number,
  ): Promise<void> {
    const deferred: PaidSideEffects[] = [];
    await this.dataSource.transaction(async (mgr) => {
      // Read by paymentId WITHOUT locking the Order row. The Sector/Batch locks
      // taken inside markOrderPaid are the sole serialization point, which
      // avoids a lock-order inversion (Order→Sector here vs the expiry cron's
      // Sector→Order) that could deadlock. Idempotency is re-checked under those
      // locks, so two concurrent webhooks for the same paymentId can't
      // double-issue tickets.
      const order = await mgr.getRepository(Order).findOne({
        where: { paymentId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) {
        this.logger.warn(`webhook: no order found for paymentId=${paymentId}`);
        return;
      }
      if (order.status === OrderStatus.PAID) return; // fast idempotent path
      // Confere o valor pago contra o total do pedido quando o gateway o envia:
      // um "completed" com valor divergente (pagamento parcial / replay) não
      // deve confirmar o pedido.
      if (
        typeof paidAmountCents === 'number' &&
        Number.isFinite(paidAmountCents) &&
        paidAmountCents !== order.totalCents
      ) {
        this.logger.warn(
          `webhook amount mismatch for paymentId=${paymentId}: paid=${paidAmountCents} expected=${order.totalCents} — ignoring`,
        );
        return;
      }
      if (!order.paymentMethod) order.paymentMethod = PaymentMethod.PIX;
      await this.markOrderPaid(mgr, order, {
        allowMissingPaymentMethod: true,
        sendEmail: true,
        deferSideEffects: deferred,
      });
    });
    for (const fx of deferred) await this.runPaidSideEffects(fx);
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
    opts: {
      allowMissingPaymentMethod: boolean;
      sendEmail?: boolean;
      deferSideEffects?: PaidSideEffects[];
    },
  ): Promise<ConfirmedOrderResponse> {
    const orderRepo = mgr.getRepository(Order);
    const ticketRepo = mgr.getRepository(Ticket);

    const idempotentResponse = async () => {
      const existing = await ticketRepo.find({ where: { orderId: order.id } });
      const ev = order.items[0].sector.event;
      const secs = order.items.map((it) => it.sector).filter(Boolean);
      const base = await this.serialize(order, ev, secs, mgr);
      return { ...base, ticketIds: existing.map((t) => t.id) };
    };

    if (order.status === OrderStatus.PAID) return idempotentResponse();
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

    const paidAt = new Date();
    // Atomic claim: exactly one concurrent confirmation flips PENDING -> PAID.
    // This single row UPDATE is the whole serialization point — no Sector/Batch
    // FOR UPDATE is held across ticket issuance, so 100 confirmations don't
    // queue on the event's inventory rows (and can't deadlock with the cron).
    const claim = await orderRepo
      .createQueryBuilder()
      .update(Order)
      .set({
        status: OrderStatus.PAID,
        paidAt,
        paymentMethod: order.paymentMethod,
        paymentId: order.paymentId,
      })
      .where('id = :id AND status = :pending', {
        id: order.id,
        pending: OrderStatus.PENDING,
      })
      .execute();
    if (!claim.affected) {
      // Lost the race (or no longer payable). Re-read to decide.
      const current = await orderRepo.findOne({
        where: { id: order.id },
        select: { id: true, status: true },
      });
      if (current?.status === OrderStatus.PAID) {
        order.status = OrderStatus.PAID;
        return idempotentResponse();
      }
      throw new BadRequestException('order is not payable');
    }
    order.status = OrderStatus.PAID;
    order.paidAt = paidAt;

    // We exclusively own the transition — safe to issue tickets and move stock.
    const batchIds = Array.from(new Set(order.items.map((it) => it.batchId)));
    const batches = await mgr
      .getRepository(Batch)
      .find({ where: { id: In(batchIds) } });
    const byBatchId = new Map(batches.map((b) => [b.id, b]));
    const sectorById = new Map<string, Sector>();
    for (const it of order.items) {
      if (it.sector) sectorById.set(it.sectorId, it.sector);
    }

    const tickets: Ticket[] = [];
    const batchQty = new Map<string, number>();
    const sectorQty = new Map<string, number>();
    for (const item of order.items) {
      batchQty.set(item.batchId, (batchQty.get(item.batchId) ?? 0) + item.qty);
      sectorQty.set(
        item.sectorId,
        (sectorQty.get(item.sectorId) ?? 0) + item.qty,
      );
      const tpu = byBatchId.get(item.batchId)?.ticketsPerUnit || 1;
      const ticketsForItem = item.qty * tpu;
      for (let i = 0; i < ticketsForItem; i++) {
        const t = new Ticket();
        t.id = createId();
        t.shortCode = `ET-${createId().slice(0, 9).toUpperCase()}`;
        t.qrToken = `et:${order.id}:${createId()}`;
        t.orderId = order.id;
        t.userId = order.userId;
        t.eventId = item.sector.eventId;
        t.sectorId = item.sectorId;
        t.batchId = item.batchId;
        t.status = TicketStatus.VALID;
        const attendee = item.attendees?.[i];
        t.holderName = attendee?.name ?? null;
        t.holderEmail = attendee?.email ?? null;
        tickets.push(t);
      }
    }
    await ticketRepo.save(tickets);
    paymentCache.delete(order.id);

    // Atomic stock move (reserved -> sold). Sorted ids for stable lock order;
    // GREATEST guards against any reserved drift going negative.
    for (const bid of Array.from(batchQty.keys()).sort()) {
      const qty = batchQty.get(bid)!;
      await mgr
        .getRepository(Batch)
        .createQueryBuilder()
        .update(Batch)
        .set({
          sold: () => `sold + ${qty}`,
          reserved: () => `GREATEST(0, reserved - ${qty})`,
        })
        .where('id = :id', { id: bid })
        .execute();
    }
    for (const sid of Array.from(sectorQty.keys()).sort()) {
      const qty = sectorQty.get(sid)!;
      await mgr
        .getRepository(Sector)
        .createQueryBuilder()
        .update(Sector)
        .set({
          sold: () => `sold + ${qty}`,
          reserved: () => `GREATEST(0, reserved - ${qty})`,
        })
        .where('id = :id', { id: sid })
        .execute();
    }

    const event = order.items[0].sector.event;
    const finalSectors = order.items.map((it) => it.sector).filter(Boolean);
    const base = await this.serialize(order, event, finalSectors, mgr);

    // SSE notify + ticket email/QR do network I/O and must NOT run while the
    // Sector/Batch locks are held (that serializes every concurrent buyer of
    // the event behind this I/O). High-concurrency callers pass
    // `deferSideEffects` and run them after the transaction commits; the
    // low-concurrency manual paths fall back to running inline.
    const sideEffects: PaidSideEffects = {
      orderId: order.id,
      paidAt: order.paidAt,
      order,
      tickets,
      event,
      sectorById,
      sendEmail: opts.sendEmail === true,
    };
    if (opts.deferSideEffects) {
      opts.deferSideEffects.push(sideEffects);
    } else {
      await this.runPaidSideEffects(sideEffects);
    }

    return { ...base, ticketIds: tickets.map((t) => t.id) };
  }

  /**
   * Runs the post-commit side effects of a confirmed order: SSE notification
   * and the ticket email (with QR rendering). Never throws — a committed sale
   * must not be undone by a failed notification/email.
   */
  private async runPaidSideEffects(fx: PaidSideEffects): Promise<void> {
    this.stream.notify(fx.orderId, OrderStatus.PAID, fx.paidAt);
    if (!fx.sendEmail) return;
    try {
      await this.distributeTicketEmails(
        fx.order,
        fx.tickets,
        fx.event,
        fx.sectorById,
      );
    } catch (err) {
      this.logger.error(
        `post-commit ticket email failed for order ${fx.orderId}`,
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  async resendTicketsForOrder(orderId: string): Promise<number> {
    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId },
      relations: { items: { sector: { event: { venue: true } } } },
    });
    if (!order) throw new NotFoundException('order not found');
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('only paid orders can be resent');
    }
    const tickets = await this.dataSource
      .getRepository(Ticket)
      .find({ where: { orderId: order.id } });
    if (!tickets.length) {
      throw new BadRequestException('order has no tickets to resend');
    }
    const event = order.items[0]?.sector?.event;
    if (!event) throw new NotFoundException('order has no event');
    const sectorById = new Map(
      order.items.map((it) => [it.sectorId, it.sector]),
    );
    return this.distributeTicketEmails(order, tickets, event, sectorById);
  }

  // ---------- private ----------

  private async distributeTicketEmails(
    order: Order,
    tickets: Ticket[],
    event: Event,
    sectorById: Map<string, Sector>,
  ): Promise<number> {
    const buyer = await this.users.findById(order.userId);
    if (!buyer?.email) return 0;
    const buyerEmailLower = buyer.email.toLowerCase();
    const firstName = buyer.name ? buyer.name.trim().split(/\s+/)[0] : null;

    const ticketsByDest: Record<string, Ticket[]> = {};
    for (const t of tickets) {
      const dest =
        t.holderEmail && t.holderEmail.toLowerCase() !== buyerEmailLower
          ? t.holderEmail.toLowerCase()
          : buyerEmailLower;
      (ticketsByDest[dest] ||= []).push(t);
    }

    let sent = 0;
    for (const [destEmail, group] of Object.entries(ticketsByDest)) {
      const ticketsForEmail = await Promise.all(
        group.map(async (t) => {
          const sector = sectorById.get(t.sectorId);
          return {
            shortCode: t.shortCode,
            sectorName: sector?.name ?? '',
            qrPngBase64: await renderQrPngBase64(t.qrToken),
          };
        }),
      );
      try {
        if (destEmail === buyerEmailLower) {
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
        } else {
          await this.emails.sendTicketByEmail({
            to: destEmail,
            buyerFirstName: group[0]?.holderName?.split(/\s+/)[0] ?? null,
            eventTitle: event.title,
            eventArtist: event.artist,
            eventStartsAt: event.startsAt,
            venueName: event.venue?.name ?? '',
            venueCity: event.venue?.city ?? '',
            tickets: ticketsForEmail,
          });
        }
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `distributeTicketEmails: ticket email failed for ${destEmail}: ${(err as Error).message}`,
        );
      }
    }
    return sent;
  }

  /**
   * Cancela um pedido PENDENTE dentro de uma transação já aberta (`mgr`),
   * liberando a reserva de setor/lote. Usado pelo anti-flood de `create`
   * quando o usuário troca de lote/combo: o pedido antigo é descartado e a
   * reserva volta a ficar disponível para o pedido novo na mesma transação.
   */
  private async cancelPendingOrderTx(
    mgr: EntityManager,
    order: Order,
  ): Promise<void> {
    const orderRepo = mgr.getRepository(Order);
    const fresh = await orderRepo.findOne({
      where: { id: order.id },
      relations: { items: true },
    });
    if (!fresh || fresh.status !== OrderStatus.PENDING) return;

    const sectorIds = fresh.items.map((it) => it.sectorId);
    const sectors = await mgr
      .getRepository(Sector)
      .createQueryBuilder('s')
      .setLock('pessimistic_write')
      .where('s.id IN (:...ids)', { ids: sectorIds })
      .getMany();
    const bySectorId = new Map(sectors.map((s) => [s.id, s]));
    for (const it of fresh.items) {
      const s = bySectorId.get(it.sectorId);
      if (s) s.reserved = Math.max(0, s.reserved - it.qty);
    }
    await mgr.getRepository(Sector).save(sectors);

    const batchIds = fresh.items.map((it) => it.batchId);
    const batchesToRelease = await mgr
      .getRepository(Batch)
      .createQueryBuilder('b')
      .setLock('pessimistic_write')
      .where('b.id IN (:...ids)', { ids: batchIds })
      .getMany();
    const byBatchId = new Map(batchesToRelease.map((b) => [b.id, b]));
    for (const it of fresh.items) {
      const b = byBatchId.get(it.batchId);
      if (b) b.reserved = Math.max(0, b.reserved - it.qty);
    }
    await mgr.getRepository(Batch).save(batchesToRelease);

    fresh.status = OrderStatus.EXPIRED;
    await orderRepo.save(fresh);
    paymentCache.delete(fresh.id);
    this.stream.notify(fresh.id, OrderStatus.EXPIRED);
  }

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

      const batchIds = fresh.items.map((it) => it.batchId);
      const batchesForExpire = await mgr
        .getRepository(Batch)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where('b.id IN (:...ids)', { ids: batchIds })
        .getMany();
      const byBatchId = new Map(batchesForExpire.map((b) => [b.id, b]));
      for (const it of fresh.items) {
        const b = byBatchId.get(it.batchId);
        if (b) b.reserved = Math.max(0, b.reserved - it.qty);
      }
      await mgr.getRepository(Batch).save(batchesForExpire);

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
    mgr?: EntityManager,
  ): Promise<OrderResponse> {
    const sectorById = new Map(sectors.map((s) => [s.id, s]));

    // When called inside a transaction, reuse its EntityManager — otherwise this
    // query grabs a SECOND pool connection while the caller still holds the
    // transaction's connection, which deadlocks the pool under concurrency.
    const reader = mgr ?? this.dataSource;
    const batchIds = Array.from(new Set(order.items.map((it) => it.batchId)));
    const batches = batchIds.length
      ? await reader.getRepository(Batch).find({ where: { id: In(batchIds) } })
      : [];
    const batchById = new Map(batches.map((b) => [b.id, b]));

    const items = order.items.map((it) => {
      const s = sectorById.get(it.sectorId);
      const b = batchById.get(it.batchId);
      return {
        id: it.id,
        sectorId: it.sectorId,
        sectorName: s?.name ?? '',
        batchName: b?.name ?? null,
        sectorColorHex: s?.colorHex ?? '#999999',
        qty: it.qty,
        priceCents: it.priceCents,
        ticketsPerUnit: b?.ticketsPerUnit ?? 1,
        attendees: it.attendees ?? null,
      };
    });

    const competitorFeeCents = Math.round(
      order.subtotalCents * COMPETITOR_FEE_RATE,
    );
    const competitorTotalCents = order.subtotalCents + competitorFeeCents;
    const savingsCents = competitorTotalCents - order.totalCents;

    let payment: OrderPaymentInfo | null = null;
    if (order.paymentMethod && order.paymentId) {
      const cached = paymentCacheGet(order.id);
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
        status:
          order.status === OrderStatus.PAID
            ? 'PAID'
            : (cached?.status ?? 'PENDING'),
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
        paymentProvider: event.paymentProvider,
        cardEnabled: event.cardEnabled,
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
