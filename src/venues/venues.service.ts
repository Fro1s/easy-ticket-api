import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Venue } from './entities/venue.entity';
import { VenueResponse } from './dto/venue.response';
import { CreateVenueDto } from './dto/create-venue.dto';

@Injectable()
export class VenuesService {
  constructor(
    @InjectRepository(Venue) private readonly venues: Repository<Venue>,
  ) {}

  async list(): Promise<VenueResponse[]> {
    const all = await this.venues.find({ order: { name: 'ASC' } });
    return all.map((v) => ({
      id: v.id,
      name: v.name,
      city: v.city,
      state: v.state,
      capacity: v.capacity,
    }));
  }

  async create(dto: CreateVenueDto): Promise<VenueResponse> {
    const venue = this.venues.create({
      name: dto.name.trim(),
      city: dto.city.trim(),
      state: dto.state.trim().toUpperCase(),
      capacity: dto.capacity,
    });
    const saved = await this.venues.save(venue);
    return {
      id: saved.id,
      name: saved.name,
      city: saved.city,
      state: saved.state,
      capacity: saved.capacity,
    };
  }
}
