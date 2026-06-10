import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { Order } from '../orders/entities/order.entity';
import { OrderItem } from '../orders/entities/order-item.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Producer } from '../producers/entities/producer.entity';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { Ticket } from '../tickets/entities/ticket.entity';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { Role } from '../common/enums/role.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
import { resolveCreateProducerId } from './lib/resolve-create-producer-id';
import {
  AttendeeSearchItem,
  AttendeeSearchResponse,
} from './dto/attendee-search.response';
import { ListProducerOrdersQuery } from './dto/list-orders.query';
import {
  ProducerOrderItem,
  ProducerOrdersResponse,
} from './dto/producer-order.response';
import {
  ProducerDashboardResponse,
  ProducerEventDetail,
  ProducerEventKpis,
  ProducerEventListResponse,
  ProducerEventSummary,
} from './dto/producer-event.response';

@Injectable()
export class ProducerEventsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(Sector) private readonly sectors: Repository<Sector>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Venue) private readonly venues: Repository<Venue>,
    private readonly users: UsersService,
  ) {}

  private slugify(input: string): string {
    return input
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
  }

  /** Returns producerId scope; null = ADMIN sees all. Throws 403 if PRODUCER lacks producerId. */
  private async resolveScope(
    currentUser: AuthenticatedUser,
  ): Promise<string | null> {
    if (currentUser.role === Role.ADMIN) return null;
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser?.producerId) {
      throw new ForbiddenException('user has no producer linked');
    }
    return dbUser.producerId;
  }

  async list(
    currentUser: AuthenticatedUser,
  ): Promise<ProducerEventListResponse> {
    const producerId = await this.resolveScope(currentUser);
    const qb = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('event.sectors', 'sector')
      .leftJoinAndSelect('sector.batches', 'batch');
    if (producerId) {
      qb.where('event.producerId = :producerId', { producerId });
    }
    qb.orderBy('event.startsAt', 'DESC');

    const events = await qb.getMany();
    const items = await Promise.all(
      events.map(async (e) =>
        this.sanitizeForRole(
          currentUser,
          this.toSummary(e, await this.computeKpis(e)),
        ),
      ),
    );
    return { items };
  }

  private sanitizeForRole<T extends ProducerEventSummary>(
    user: AuthenticatedUser,
    e: T,
  ): T {
    if (user.role === Role.STAFF) {
      return { ...e, kpis: null, platformFeeRate: 0 };
    }
    return e;
  }

  async dashboard(
    currentUser: AuthenticatedUser,
  ): Promise<ProducerDashboardResponse> {
    const { items } = await this.list(currentUser);
    return {
      events: items,
      totalTicketsSold: items.reduce(
        (s, e) => s + (e.kpis?.ticketsSold ?? 0),
        0,
      ),
      totalGrossRevenueCents: items.reduce(
        (s, e) => s + (e.kpis?.grossRevenueCents ?? 0),
        0,
      ),
      totalPlatformFeeCents: items.reduce(
        (s, e) => s + (e.kpis?.platformFeeCents ?? 0),
        0,
      ),
      totalNetCents: items.reduce((s, e) => s + (e.kpis?.netCents ?? 0), 0),
      totalPendingManualOrders: items.reduce(
        (s, e) => s + (e.kpis?.pendingManualOrdersCount ?? 0),
        0,
      ),
    };
  }

  async getById(
    currentUser: AuthenticatedUser,
    eventId: string,
  ): Promise<ProducerEventDetail> {
    const producerId = await this.resolveScope(currentUser);
    const event = await this.events.findOne({
      where: { id: eventId },
      relations: { venue: true, sectors: { batches: true } },
    });
    if (!event) throw new NotFoundException('event not found');
    if (producerId && event.producerId !== producerId) {
      throw new ForbiddenException('not your event');
    }
    const kpis = await this.computeKpis(event);
    const summary = this.toSummary(event, kpis);
    // Source of truth: SUM(qty) por sector e por batch nas orders PAID.
    // Evita drift dos contadores desnormalizados sector.sold / batch.sold.
    const soldRows = await this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('oi.sector', 's')
      .select('oi.sectorId', 'sectorId')
      .addSelect('oi.batchId', 'batchId')
      .addSelect('COALESCE(SUM(oi.qty), 0)', 'qty')
      .where('s.eventId = :eventId', { eventId: event.id })
      .andWhere('o.status = :paid', { paid: OrderStatus.PAID })
      .groupBy('oi.sectorId')
      .addGroupBy('oi.batchId')
      .getRawMany<{ sectorId: string; batchId: string; qty: string }>();
    const soldByBatch = new Map(
      soldRows.map((r) => [r.batchId, Number(r.qty)]),
    );
    const soldBySector = new Map<string, number>();
    for (const r of soldRows) {
      soldBySector.set(
        r.sectorId,
        (soldBySector.get(r.sectorId) ?? 0) + Number(r.qty),
      );
    }
    return this.sanitizeForRole(currentUser, {
      ...summary,
      description: event.description,
      ageRating: event.ageRating,
      pixKey: event.pixKey,
      pixKeyType: event.pixKeyType,
      pixHolderName: event.pixHolderName,
      sectors: event.sectors
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => ({
          id: s.id,
          name: s.name,
          colorHex: s.colorHex,
          capacity: s.capacity,
          sold: soldBySector.get(s.id) ?? 0,
          reserved: s.reserved,
          sortOrder: s.sortOrder,
          batches: (s.batches ?? [])
            .slice()
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((b) => ({
              id: b.id,
              name: b.name,
              priceCents: b.priceCents,
              ticketsPerUnit: b.ticketsPerUnit ?? 1,
              capacity: b.capacity,
              sold: soldByBatch.get(b.id) ?? 0,
              reserved: b.reserved,
              sortOrder: b.sortOrder,
              isActive: b.isActive,
              startsAt: b.startsAt ? b.startsAt.toISOString() : null,
              endsAt: b.endsAt ? b.endsAt.toISOString() : null,
            })),
        })),
      cardEnabled: event.cardEnabled,
    });
  }

  async getBySlug(
    currentUser: AuthenticatedUser,
    slug: string,
  ): Promise<ProducerEventDetail> {
    const event = await this.events.findOne({ where: { slug } });
    if (!event) throw new NotFoundException('event not found');
    return this.getById(currentUser, event.id);
  }

  private async computeKpis(event: Event): Promise<ProducerEventKpis> {
    // Source of truth: SUM(qty) in PAID order_items. Counters em sector.sold /
    // batch.sold são desnormalizados e ficaram drifted em prod (ver auditoria
    // 2026-05-11 no HANDOFF). KPI agora calcula direto pra evitar a classe de
    // bug — UI mostrava 50 quando o real eram 54.
    const row = await this.dataSource
      .getRepository(OrderItem)
      .createQueryBuilder('oi')
      .innerJoin('oi.order', 'o')
      .innerJoin('oi.sector', 's')
      .innerJoin('oi.batch', 'b')
      .select('COALESCE(SUM(oi.qty * b.ticketsPerUnit), 0)', 'qty')
      .addSelect('COALESCE(SUM(oi.priceCents * oi.qty), 0)', 'gross')
      .where('s.eventId = :eventId', { eventId: event.id })
      .andWhere('o.status = :paid', { paid: OrderStatus.PAID })
      .getRawOne<{ qty: string; gross: string }>();
    const ticketsSold = Number(row?.qty ?? 0);
    const grossRevenueCents = Number(row?.gross ?? 0);
    const platformFeeCents = Math.round(
      grossRevenueCents * Number(event.platformFeeRate),
    );
    const netCents = grossRevenueCents - platformFeeCents;

    // Conta pedidos PENDING sem charge no gateway (origem manual/sell-by-email),
    // independente do paymentProvider do evento. Eventos em Abacate ainda podem
    // ter vendas manuais via vendedor.
    const pendingManualOrdersCount = await this.orders
      .createQueryBuilder('o')
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.sector', 's')
      .where('s.eventId = :eventId', { eventId: event.id })
      .andWhere('o.status = :status', { status: OrderStatus.PENDING })
      .andWhere('o.reservedUntil > NOW()')
      .andWhere('o.paymentId IS NULL')
      .getCount();
    const ticketsValidated = await this.dataSource
      .getRepository(Ticket)
      .createQueryBuilder('t')
      .where('t.eventId = :eventId', { eventId: event.id })
      .andWhere('t.status = :used', { used: TicketStatus.USED })
      .getCount();
    return {
      ticketsSold,
      grossRevenueCents,
      platformFeeCents,
      netCents,
      pendingManualOrdersCount,
      ticketsValidated,
    };
  }

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateEventDto,
  ): Promise<ProducerEventDetail> {
    const dbUser = await this.users.findById(currentUser.id);
    const producerId = resolveCreateProducerId({
      role: currentUser.role,
      ownProducerId: dbUser?.producerId ?? null,
      dtoProducerId: dto.producerId,
    });

    // Garante que o produtor-alvo existe (relevante quando ADMIN informa um id).
    const producerExists = await this.dataSource
      .getRepository(Producer)
      .findOne({ where: { id: producerId }, select: { id: true } });
    if (!producerExists) {
      throw new BadRequestException('producer not found');
    }

    const venue = await this.venues.findOne({ where: { id: dto.venueId } });
    if (!venue) throw new BadRequestException('venue not found');

    if (new Date(dto.doorsAt) > new Date(dto.startsAt)) {
      throw new BadRequestException('doorsAt must be <= startsAt');
    }

    const totalCapacity = dto.sectors.reduce(
      (s, c) => s + c.batches.reduce((bs, b) => bs + b.capacity, 0),
      0,
    );
    if (totalCapacity > venue.capacity) {
      throw new BadRequestException(
        `total batch capacity (${totalCapacity}) exceeds venue capacity (${venue.capacity})`,
      );
    }

    const slugBase = this.slugify(`${dto.artist}-${dto.title}`);
    let slug = slugBase;
    let suffix = 1;
    while (await this.events.findOne({ where: { slug } })) {
      suffix += 1;
      slug = `${slugBase}-${suffix}`;
    }

    const eventId = createId();

    await this.dataSource.transaction(async (mgr) => {
      const event = mgr.getRepository(Event).create({
        id: eventId,
        slug,
        title: dto.title,
        artist: dto.artist,
        category: dto.category,
        startsAt: new Date(dto.startsAt),
        doorsAt: new Date(dto.doorsAt),
        ageRating: dto.ageRating,
        posterUrl: dto.posterUrl,
        description: dto.description,
        venueId: dto.venueId,
        producerId,
        status: EventStatus.DRAFT,
        paymentProvider: dto.paymentProvider,
        pixKey: dto.pixKey ?? null,
        pixKeyType: dto.pixKeyType ?? null,
        pixHolderName: dto.pixHolderName ?? null,
        platformFeeRate: dto.platformFeeRate,
      });
      await mgr.getRepository(Event).save(event);

      const sectors = dto.sectors.map((s) =>
        mgr.getRepository(Sector).create({
          id: createId(),
          eventId,
          name: s.name,
          colorHex: s.colorHex,
          capacity: s.capacity,
          sortOrder: s.sortOrder,
          sold: 0,
          reserved: 0,
        }),
      );
      await mgr.getRepository(Sector).save(sectors);

      for (const dtoSector of dto.sectors) {
        const sector = sectors.find((s) => s.name === dtoSector.name)!;
        const batchEntities = dtoSector.batches.map((b) =>
          mgr.getRepository(Batch).create({
            id: createId(),
            sectorId: sector.id,
            name: b.name,
            priceCents: b.priceCents,
            capacity: b.capacity,
            sold: 0,
            reserved: 0,
            sortOrder: b.sortOrder,
            producerOnly: b.producerOnly ?? dtoSector.producerOnly ?? false,
            startsAt: b.startsAt ? new Date(b.startsAt) : null,
            endsAt: b.endsAt ? new Date(b.endsAt) : null,
          }),
        );
        sector.capacity = dtoSector.batches.reduce(
          (s, b) => s + b.capacity,
          0,
        );
        await mgr.getRepository(Batch).save(batchEntities);
      }
      await mgr.getRepository(Sector).save(sectors);
    });

    return this.getById(currentUser, eventId);
  }

  async updateEvent(
    currentUser: AuthenticatedUser,
    eventId: string,
    dto: import('./dto/update-event.dto').UpdateEventDto,
  ): Promise<ProducerEventDetail> {
    const detail = await this.getById(currentUser, eventId);

    const patch: Partial<Event> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.artist !== undefined) patch.artist = dto.artist;
    if (dto.category !== undefined) patch.category = dto.category;
    if (dto.startsAt !== undefined) patch.startsAt = new Date(dto.startsAt);
    if (dto.doorsAt !== undefined) patch.doorsAt = new Date(dto.doorsAt);
    if (dto.ageRating !== undefined) patch.ageRating = dto.ageRating;
    if (dto.posterUrl !== undefined) patch.posterUrl = dto.posterUrl;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.venueId !== undefined) patch.venueId = dto.venueId;
    if (dto.paymentProvider !== undefined)
      patch.paymentProvider = dto.paymentProvider;
    if (dto.pixKey !== undefined) patch.pixKey = dto.pixKey || null;
    if (dto.pixKeyType !== undefined) patch.pixKeyType = dto.pixKeyType ?? null;
    if (dto.pixHolderName !== undefined)
      patch.pixHolderName = dto.pixHolderName || null;
    if (dto.platformFeeRate !== undefined)
      patch.platformFeeRate = dto.platformFeeRate;
    if (dto.cardEnabled !== undefined) patch.cardEnabled = dto.cardEnabled;

    const start = patch.startsAt ?? new Date(detail.startsAt);
    const doors = patch.doorsAt ?? new Date(detail.doorsAt);
    if (doors > start) {
      throw new BadRequestException(
        'a abertura precisa ser antes ou igual ao início',
      );
    }

    await this.events.update(eventId, patch);
    return this.getById(currentUser, eventId);
  }

  async publish(
    currentUser: AuthenticatedUser,
    eventId: string,
  ): Promise<ProducerEventDetail> {
    const detail = await this.getById(currentUser, eventId);
    if (detail.status === EventStatus.PUBLISHED) return detail;
    if (detail.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        `event is ${detail.status}, cannot publish`,
      );
    }
    if (!detail.sectors.length || detail.sectors.some((s) => s.capacity <= 0)) {
      throw new BadRequestException(
        'event needs at least one sector with capacity > 0',
      );
    }
    if (new Date(detail.startsAt) <= new Date()) {
      throw new BadRequestException('cannot publish event in the past');
    }
    await this.events.update(eventId, { status: EventStatus.PUBLISHED });
    return this.getById(currentUser, eventId);
  }

  async listOrders(
    currentUser: AuthenticatedUser,
    eventSlug: string,
    query: ListProducerOrdersQuery,
  ): Promise<ProducerOrdersResponse> {
    const detail = await this.getBySlug(currentUser, eventSlug);

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    // Na aba "Todos" (sem filtro de status), escondemos CANCELLED/EXPIRED pra
    // limpar a lista — todo mundo continua vendo se filtrar explicitamente por
    // cada um desses status.
    const hideStatuses = query.status
      ? []
      : [OrderStatus.CANCELLED, OrderStatus.EXPIRED];

    const idsQb = this.orders
      .createQueryBuilder('o')
      .select('o.id', 'id')
      .addSelect('o.createdAt', 'createdAt')
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.sector', 's')
      .leftJoin('o.user', 'u')
      .where('s.eventId = :eventId', { eventId: detail.id })
      .groupBy('o.id')
      .orderBy('MAX(o.createdAt)', 'DESC')
      .offset((page - 1) * pageSize)
      .limit(pageSize);

    if (query.status) {
      idsQb.andWhere('o.status = :status', { status: query.status });
    }
    if (hideStatuses.length) {
      idsQb.andWhere('o.status NOT IN (:...hideStatuses)', { hideStatuses });
    }
    if (query.q) {
      idsQb.andWhere('(u.email ILIKE :q OR o.id ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }

    const rows = await idsQb.getRawMany<{ id: string }>();
    const ids = rows.map((r) => r.id);

    const totalQb = this.orders
      .createQueryBuilder('o')
      .innerJoin('o.items', 'oi')
      .innerJoin('oi.sector', 's')
      .leftJoin('o.user', 'u')
      .where('s.eventId = :eventId', { eventId: detail.id });
    if (query.status) {
      totalQb.andWhere('o.status = :status', { status: query.status });
    }
    if (hideStatuses.length) {
      totalQb.andWhere('o.status NOT IN (:...hideStatuses)', { hideStatuses });
    }
    if (query.q) {
      totalQb.andWhere('(u.email ILIKE :q OR o.id ILIKE :q)', {
        q: `%${query.q}%`,
      });
    }
    const total = await totalQb.select('COUNT(DISTINCT o.id)', 'c').getRawOne<{
      c: string;
    }>();
    const totalCount = Number(total?.c ?? 0);

    if (!ids.length) {
      return { items: [], total: totalCount, page, pageSize };
    }

    const hydrated = await this.orders.find({
      where: { id: In(ids) },
      relations: { user: true, items: true },
    });
    const byId = new Map(hydrated.map((o) => [o.id, o]));

    const isStaff = currentUser.role === Role.STAFF;
    const items: ProducerOrderItem[] = ids
      .map((id) => byId.get(id))
      .filter((o): o is Order => !!o)
      .map((o) => ({
        id: o.id,
        shortId: o.id.slice(-8).toUpperCase(),
        status: o.status,
        buyerEmail: o.user.email,
        buyerName: o.user.name,
        qty: o.items.reduce((s, i) => s + i.qty, 0),
        subtotalCents: isStaff ? 0 : o.subtotalCents,
        feeCents: isStaff ? 0 : o.feeCents,
        totalCents: isStaff ? 0 : o.totalCents,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        reservedUntil: o.reservedUntil.toISOString(),
        // Mostra "confirmar pagamento" para qualquer pedido PENDING sem charge
        // no gateway — cobre tanto eventos MANUAL_PIX quanto Abacate com vendas
        // por vendedor (que são sempre offline/manual). Usa paymentMethod como
        // sinal porque sell-by-email reusa paymentId como chave de idempotência.
        isManualPending: o.status === OrderStatus.PENDING && o.paymentMethod === null,
      }));

    return { items, total: totalCount, page, pageSize };
  }

  async searchAttendees(
    currentUser: AuthenticatedUser,
    eventSlug: string,
    q: string,
  ): Promise<AttendeeSearchResponse> {
    const detail = await this.getBySlug(currentUser, eventSlug);
    const term = (q ?? '').trim();
    if (term.length < 2) return { items: [] };
    const like = `%${term}%`;

    const rows = await this.dataSource
      .getRepository(Ticket)
      .createQueryBuilder('t')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('users', 'u', 'u.id = t.userId')
      .where('t.eventId = :eventId', { eventId: detail.id })
      .andWhere(
        '(u.email ILIKE :like OR u.name ILIKE :like OR t.holderName ILIKE :like OR t.holderEmail ILIKE :like OR t.shortCode ILIKE :like)',
        { like },
      )
      .select([
        't.id AS "ticketId"',
        't.shortCode AS "shortCode"',
        't.holderName AS "holderName"',
        't.holderEmail AS "holderEmail"',
        't.status AS "status"',
        't.usedAt AS "usedAt"',
        's.name AS "sectorName"',
        'u.name AS "buyerName"',
        'u.email AS "buyerEmail"',
      ])
      .orderBy('t.createdAt', 'DESC')
      .limit(50)
      .getRawMany<{
        ticketId: string;
        shortCode: string;
        holderName: string | null;
        holderEmail: string | null;
        status: string;
        usedAt: Date | null;
        sectorName: string | null;
        buyerName: string | null;
        buyerEmail: string;
      }>();

    const items: AttendeeSearchItem[] = rows.map((r) => ({
      ticketId: r.ticketId,
      shortCode: r.shortCode,
      holderName: r.holderName,
      holderEmail: r.holderEmail,
      buyerName: r.buyerName,
      buyerEmail: r.buyerEmail,
      sectorName: r.sectorName ?? '',
      status: r.status as AttendeeSearchItem['status'],
      usedAt: r.usedAt ? r.usedAt.toISOString() : null,
    }));
    return { items };
  }

  private toSummary(
    event: Event,
    kpis: ProducerEventKpis,
  ): ProducerEventSummary {
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      artist: event.artist,
      category: event.category,
      status: event.status,
      startsAt: event.startsAt.toISOString(),
      doorsAt: event.doorsAt.toISOString(),
      posterUrl: event.posterUrl,
      paymentProvider: event.paymentProvider,
      platformFeeRate: Number(event.platformFeeRate),
      venue: {
        id: event.venue.id,
        name: event.venue.name,
        city: event.venue.city,
        state: event.venue.state,
      },
      kpis,
      featuredAt: event.featuredAt ? event.featuredAt.toISOString() : null,
    };
  }
}
