import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import {
  MeProfile,
  MyOrdersResponse,
  MyTicketItem,
  MyTicketsResponse,
} from './dto/me.response';
import { MyOrdersQuery, MyTicketsQuery } from './dto/me.query';

@Injectable()
export class MeService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Order) private readonly orders: Repository<Order>,
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
  ) {}

  async profile(userId: string): Promise<MeProfile> {
    const user = await this.users.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('user not found');

    const [ticketCount, orderCount] = await Promise.all([
      this.tickets.count({ where: { userId } }),
      this.orders.count({ where: { userId } }),
    ]);

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      cpf: user.cpf,
      phone: user.phone,
      role: user.role,
      referralCode: user.referralCode,
      createdAt: user.createdAt.toISOString(),
      ticketCount,
      orderCount,
    };
  }

  async listTickets(
    userId: string,
    query: MyTicketsQuery,
  ): Promise<MyTicketsResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const qb = this.tickets
      .createQueryBuilder('t')
      .leftJoin('events', 'e', 'e.id = t.eventId')
      .leftJoin('venues', 'v', 'v.id = e.venueId')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('order_items', 'oi', 'oi.orderId = t.orderId AND oi.sectorId = t.sectorId')
      .where('t.userId = :userId', { userId });

    if (query.status) {
      qb.andWhere('t.status = :status', { status: query.status });
    }

    qb.orderBy('e.startsAt', 'ASC').addOrderBy('t.createdAt', 'DESC');

    const total = await qb.getCount();

    const rows = await qb
      .select([
        't.id AS t_id',
        't.shortCode AS t_short',
        't.qrToken AS t_qr',
        't.status AS t_status',
        't.orderId AS t_order',
        't.usedAt AS t_used',
        't.createdAt AS t_created',
        'e.id AS e_id',
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
        's.id AS s_id',
        's.name AS s_name',
        's.colorHex AS s_color',
        'oi.priceCents AS oi_price',
      ])
      .skip(skip)
      .take(pageSize)
      .getRawMany();

    const items = rows.map((r) => ({
      id: r.t_id,
      shortCode: r.t_short,
      qrToken: r.t_qr,
      status: r.t_status,
      orderId: r.t_order,
      usedAt: r.t_used ? new Date(r.t_used).toISOString() : null,
      createdAt: new Date(r.t_created).toISOString(),
      event: {
        id: r.e_id,
        slug: r.e_slug,
        title: r.e_title,
        artist: r.e_artist,
        category: r.e_category,
        startsAt: new Date(r.e_starts).toISOString(),
        doorsAt: new Date(r.e_doors).toISOString(),
        posterUrl: r.e_poster,
        venueName: r.v_name,
        venueCity: r.v_city,
        venueState: r.v_state,
      },
      sector: {
        id: r.s_id,
        name: r.s_name,
        colorHex: r.s_color,
        priceCents: Number(r.oi_price ?? 0),
      },
    }));

    return { items, total, page, pageSize };
  }

  async findTicket(userId: string, ticketId: string): Promise<MyTicketItem> {
    const row = await this.tickets
      .createQueryBuilder('t')
      .leftJoin('events', 'e', 'e.id = t.eventId')
      .leftJoin('venues', 'v', 'v.id = e.venueId')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('order_items', 'oi', 'oi.orderId = t.orderId AND oi.sectorId = t.sectorId')
      .where('t.id = :ticketId', { ticketId })
      .andWhere('t.userId = :userId', { userId })
      .select([
        't.id AS t_id',
        't.shortCode AS t_short',
        't.qrToken AS t_qr',
        't.status AS t_status',
        't.orderId AS t_order',
        't.usedAt AS t_used',
        't.createdAt AS t_created',
        'e.id AS e_id',
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
        's.id AS s_id',
        's.name AS s_name',
        's.colorHex AS s_color',
        'oi.priceCents AS oi_price',
      ])
      .getRawOne();

    if (!row) throw new NotFoundException('ticket not found');

    return {
      id: row.t_id,
      shortCode: row.t_short,
      qrToken: row.t_qr,
      status: row.t_status,
      orderId: row.t_order,
      usedAt: row.t_used ? new Date(row.t_used).toISOString() : null,
      createdAt: new Date(row.t_created).toISOString(),
      event: {
        id: row.e_id,
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
        id: row.s_id,
        name: row.s_name,
        colorHex: row.s_color,
        priceCents: Number(row.oi_price ?? 0),
      },
    };
  }

  async listOrders(
    userId: string,
    query: MyOrdersQuery,
  ): Promise<MyOrdersResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const skip = (page - 1) * pageSize;

    const where = query.status
      ? { userId, status: query.status }
      : { userId };

    const [orders, total] = await this.orders.findAndCount({
      where,
      relations: {
        items: { sector: { event: { venue: true } } },
      },
      order: { createdAt: 'DESC' },
      skip,
      take: pageSize,
    });

    const items = orders.map((o) => {
      const firstItem = o.items[0];
      const event = firstItem?.sector?.event;
      const venue = event?.venue;
      return {
        id: o.id,
        status: o.status,
        subtotalCents: o.subtotalCents,
        feeCents: o.feeCents,
        discountCents: o.discountCents,
        totalCents: o.totalCents,
        createdAt: o.createdAt.toISOString(),
        paidAt: o.paidAt ? o.paidAt.toISOString() : null,
        event: event
          ? {
              id: event.id,
              slug: event.slug,
              title: event.title,
              artist: event.artist,
              startsAt: event.startsAt.toISOString(),
              posterUrl: event.posterUrl,
              venueName: venue?.name ?? '',
              venueCity: venue?.city ?? '',
            }
          : {
              id: '',
              slug: '',
              title: 'Evento removido',
              artist: '',
              startsAt: o.createdAt.toISOString(),
              posterUrl: '',
              venueName: '',
              venueCity: '',
            },
        items: o.items.map((it) => ({
          id: it.id,
          sectorId: it.sectorId,
          sectorName: it.sector?.name ?? '',
          sectorColorHex: it.sector?.colorHex ?? '#999999',
          qty: it.qty,
          priceCents: it.priceCents,
        })),
      };
    });

    return { items, total, page, pageSize };
  }
}
