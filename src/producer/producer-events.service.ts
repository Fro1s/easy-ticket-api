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
import { Order } from '../orders/entities/order.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Producer } from '../producers/entities/producer.entity';
import { OrderStatus } from '../common/enums/order-status.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { Role } from '../common/enums/role.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateEventDto } from './dto/create-event.dto';
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
      .leftJoinAndSelect('event.sectors', 'sector');
    if (producerId) {
      qb.where('event.producerId = :producerId', { producerId });
    }
    qb.orderBy('event.startsAt', 'DESC');

    const events = await qb.getMany();
    const items = await Promise.all(
      events.map(async (e) =>
        this.toSummary(e, await this.computeKpis(e)),
      ),
    );
    return { items };
  }

  async dashboard(
    currentUser: AuthenticatedUser,
  ): Promise<ProducerDashboardResponse> {
    const { items } = await this.list(currentUser);
    return {
      events: items,
      totalTicketsSold: items.reduce((s, e) => s + e.kpis.ticketsSold, 0),
      totalGrossRevenueCents: items.reduce(
        (s, e) => s + e.kpis.grossRevenueCents,
        0,
      ),
      totalPlatformFeeCents: items.reduce(
        (s, e) => s + e.kpis.platformFeeCents,
        0,
      ),
      totalNetCents: items.reduce((s, e) => s + e.kpis.netCents, 0),
      totalPendingManualOrders: items.reduce(
        (s, e) => s + e.kpis.pendingManualOrdersCount,
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
      relations: { venue: true, sectors: true },
    });
    if (!event) throw new NotFoundException('event not found');
    if (producerId && event.producerId !== producerId) {
      throw new ForbiddenException('not your event');
    }
    const kpis = await this.computeKpis(event);
    const summary = this.toSummary(event, kpis);
    return {
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
          priceCents: s.priceCents,
          capacity: s.capacity,
          sold: s.sold,
          reserved: s.reserved,
          sortOrder: s.sortOrder,
        })),
    };
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
    const ticketsSold = event.sectors.reduce((sum, s) => sum + s.sold, 0);
    const grossRevenueCents = event.sectors.reduce(
      (sum, s) => sum + s.sold * s.priceCents,
      0,
    );
    const platformFeeCents = Math.round(
      grossRevenueCents * Number(event.platformFeeRate),
    );
    const netCents = grossRevenueCents - platformFeeCents;

    let pendingManualOrdersCount = 0;
    if (event.paymentProvider === PaymentProvider.MANUAL_PIX) {
      pendingManualOrdersCount = await this.orders
        .createQueryBuilder('o')
        .innerJoin('o.items', 'oi')
        .innerJoin('oi.sector', 's')
        .where('s.eventId = :eventId', { eventId: event.id })
        .andWhere('o.status = :status', { status: OrderStatus.PENDING })
        .andWhere('o.reservedUntil > NOW()')
        .getCount();
    }
    return {
      ticketsSold,
      grossRevenueCents,
      platformFeeCents,
      netCents,
      pendingManualOrdersCount,
    };
  }

  async create(
    currentUser: AuthenticatedUser,
    dto: CreateEventDto,
  ): Promise<ProducerEventDetail> {
    let producerId: string | null;
    if (currentUser.role === Role.ADMIN) {
      const dbUser = await this.users.findById(currentUser.id);
      producerId = dbUser?.producerId ?? null;
      if (!producerId) {
        const anyProducer = await this.dataSource
          .getRepository(Producer)
          .createQueryBuilder('p')
          .select('p.id', 'id')
          .limit(1)
          .getRawOne<{ id: string }>();
        if (!anyProducer) {
          throw new BadRequestException('no producer exists yet');
        }
        producerId = anyProducer.id;
      }
    } else {
      producerId = await this.resolveScope(currentUser);
    }

    const venue = await this.venues.findOne({ where: { id: dto.venueId } });
    if (!venue) throw new BadRequestException('venue not found');

    if (new Date(dto.doorsAt) > new Date(dto.startsAt)) {
      throw new BadRequestException('doorsAt must be <= startsAt');
    }

    const totalCapacity = dto.sectors.reduce((s, c) => s + c.capacity, 0);
    if (totalCapacity > venue.capacity) {
      throw new BadRequestException(
        `total sector capacity (${totalCapacity}) exceeds venue capacity (${venue.capacity})`,
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
        producerId: producerId!,
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
          priceCents: s.priceCents,
          capacity: s.capacity,
          sortOrder: s.sortOrder,
          sold: 0,
          reserved: 0,
        }),
      );
      await mgr.getRepository(Sector).save(sectors);
    });

    return this.getById(currentUser, eventId);
  }

  async updateDraft(
    currentUser: AuthenticatedUser,
    eventId: string,
    dto: import('./dto/update-event.dto').UpdateEventDto,
  ): Promise<ProducerEventDetail> {
    const detail = await this.getById(currentUser, eventId);
    if (detail.status !== EventStatus.DRAFT) {
      throw new BadRequestException(
        'apenas eventos em rascunho podem ser editados',
      );
    }

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
        subtotalCents: o.subtotalCents,
        feeCents: o.feeCents,
        totalCents: o.totalCents,
        paymentMethod: o.paymentMethod,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        reservedUntil: o.reservedUntil.toISOString(),
        isManualPending:
          o.status === OrderStatus.PENDING &&
          detail.paymentProvider === PaymentProvider.MANUAL_PIX,
      }));

    return { items, total: totalCount, page, pageSize };
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
    };
  }
}
