import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Event } from './event.entity';

@Entity('sectors')
export class Sector {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 32 })
  eventId: string;

  @ManyToOne(() => Event, (event) => event.sectors, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'eventId' })
  event: Event;

  @Column('varchar', { length: 80 })
  name: string;

  @Column('varchar', { length: 9 })
  colorHex: string;

  @Column('int')
  priceCents: number;

  @Column('int')
  capacity: number;

  @Column('int', { default: 0 })
  sold: number;

  @Column('int', { default: 0 })
  reserved: number;

  @Column('int', { default: 0 })
  sortOrder: number;
}
