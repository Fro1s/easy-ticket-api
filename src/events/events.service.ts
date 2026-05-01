import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { Event } from './entities/event.entity';
import { Sector } from './entities/sector.entity';
import { Batch } from './entities/batch.entity';
import { EventStatus } from '../common/enums/event-status.enum';
import {
  AvailabilityResponse,
  EventDetail,
  EventListResponse,
  EventSummary,
} from './dto/event.response';
import { ListEventsQuery } from './dto/list-events.query';
import { resolveActiveBatch, BatchSnapshot } from './lib/active-batch';

function toBatchSnapshot(b: Batch): BatchSnapshot {
  return {
    id: b.id,
    name: b.name,
    priceCents: b.priceCents,
    capacity: b.capacity,
    sold: b.sold,
    reserved: b.reserved,
    sortOrder: b.sortOrder,
    startsAt: b.startsAt,
    endsAt: b.endsAt,
  };
}

@Injectable()
export class EventsService {
  constructor(
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(Sector) private readonly sectors: Repository<Sector>,
  ) {}

  async list(query: ListEventsQuery): Promise<EventListResponse> {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const qb = this.events
      .createQueryBuilder('event')
      .leftJoinAndSelect('event.venue', 'venue')
      .leftJoinAndSelect('event.sectors', 'sector')
      .leftJoinAndSelect('sector.batches', 'batch')
      .where('event.status = :status', { status: EventStatus.PUBLISHED });

    if (query.category) {
      qb.andWhere('event.category = :category', { category: query.category });
    }
    if (query.city) {
      qb.andWhere('venue.city ILIKE :city', { city: `%${query.city}%` });
    }
    if (query.date) {
      qb.andWhere('event.startsAt >= :date', { date: new Date(query.date) });
    }
    if (query.q) {
      qb.andWhere(
        new Brackets((b) =>
          b
            .where('event.title ILIKE :q', { q: `%${query.q}%` })
            .orWhere('event.artist ILIKE :q', { q: `%${query.q}%` }),
        ),
      );
    }

    qb.orderBy('event.startsAt', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    const [events, total] = await qb.getManyAndCount();

    return {
      items: events.map((e) => this.toSummary(e)),
      total,
      page,
      pageSize,
    };
  }

  async findBySlug(slug: string): Promise<EventDetail> {
    const event = await this.events.findOne({
      where: { slug, status: EventStatus.PUBLISHED },
      relations: ['venue', 'sectors', 'sectors.batches'],
    });
    if (!event) throw new NotFoundException(`event ${slug} not found`);
    return this.toDetail(event);
  }

  async availability(slug: string): Promise<AvailabilityResponse> {
    const event = await this.events.findOne({
      where: { slug, status: EventStatus.PUBLISHED },
      relations: ['sectors', 'sectors.batches'],
    });
    if (!event) throw new NotFoundException(`event ${slug} not found`);

    const now = new Date();
    return {
      eventId: event.id,
      sectors: event.sectors
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => {
          const { active } = resolveActiveBatch(
            (s.batches ?? []).map(toBatchSnapshot),
            now,
          );
          const available = active
            ? Math.max(0, active.capacity - active.sold - active.reserved)
            : 0;
          return {
            id: s.id,
            name: s.name,
            capacity: s.capacity,
            sold: s.sold,
            reserved: s.reserved,
            available,
          };
        }),
      fetchedAt: now.toISOString(),
    };
  }

  private toSummary(event: Event): EventSummary {
    const now = new Date();
    const activeBatchPrices: number[] = [];
    for (const s of event.sectors ?? []) {
      const { active } = resolveActiveBatch(
        (s.batches ?? []).map(toBatchSnapshot),
        now,
      );
      if (active) activeBatchPrices.push(active.priceCents);
    }
    const priceFromCents = activeBatchPrices.length
      ? Math.min(...activeBatchPrices)
      : 0;
    return {
      id: event.id,
      slug: event.slug,
      title: event.title,
      artist: event.artist,
      category: event.category,
      startsAt: event.startsAt.toISOString(),
      doorsAt: event.doorsAt.toISOString(),
      posterUrl: event.posterUrl,
      status: event.status,
      priceFromCents,
      venue: {
        id: event.venue.id,
        name: event.venue.name,
        city: event.venue.city,
        state: event.venue.state,
        capacity: event.venue.capacity,
      },
    };
  }

  private toDetail(event: Event): EventDetail {
    const now = new Date();
    return {
      ...this.toSummary(event),
      description: event.description,
      ageRating: event.ageRating,
      platformFeeRate: Number(event.platformFeeRate),
      sectors: event.sectors
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((s) => {
          const { active, next } = resolveActiveBatch(
            (s.batches ?? []).map(toBatchSnapshot),
            now,
          );
          return {
            id: s.id,
            name: s.name,
            colorHex: s.colorHex,
            capacity: s.capacity,
            sold: s.sold,
            reserved: s.reserved,
            sortOrder: s.sortOrder,
            activeBatch: active
              ? {
                  id: active.id,
                  name: active.name,
                  priceCents: active.priceCents,
                  startsAt: active.startsAt?.toISOString() ?? null,
                  endsAt: active.endsAt?.toISOString() ?? null,
                }
              : null,
            nextBatch: next
              ? {
                  id: next.id,
                  name: next.name,
                  priceCents: next.priceCents,
                  startsAt: next.startsAt?.toISOString() ?? null,
                  endsAt: next.endsAt?.toISOString() ?? null,
                }
              : null,
          };
        }),
    };
  }
}
