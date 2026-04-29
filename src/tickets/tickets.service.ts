import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Ticket } from './entities/ticket.entity';
import { SharedTicketResponse } from './dto/shared-ticket.response';

@Injectable()
export class TicketsService {
  constructor(
    @InjectRepository(Ticket) private readonly tickets: Repository<Ticket>,
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

    const fullName: string = row.u_name ?? '';
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
}
