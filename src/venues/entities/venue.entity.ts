import { Column, Entity, OneToMany, PrimaryColumn } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Event } from '../../events/entities/event.entity';

export interface SeatMapSector {
  id: string;
  name: string;
  polygon: Array<[number, number]>;
  colorHex: string;
}

export interface SeatMap {
  width: number;
  height: number;
  sectors: SeatMapSector[];
}

@Entity('venues')
export class Venue {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 160 })
  name: string;

  @Column('varchar', { length: 120 })
  city: string;

  @Column('varchar', { length: 2 })
  state: string;

  @Column('int')
  capacity: number;

  @Column('jsonb', { nullable: true })
  seatMap: SeatMap | null;

  @OneToMany(() => Event, (event) => event.venue)
  events: Event[];
}
