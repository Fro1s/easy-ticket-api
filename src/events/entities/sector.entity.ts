import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Event } from './event.entity';
import { Batch } from './batch.entity';

@Entity('sectors')
// Sectors are always loaded by their event (event page, availability, checkout).
@Index('IDX_sectors_eventId', ['eventId'])
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
  capacity: number;

  @Column('int', { default: 0 })
  sold: number;

  @Column('int', { default: 0 })
  reserved: number;

  @Column('int', { default: 0 })
  sortOrder: number;

  @OneToMany(() => Batch, (batch) => batch.sector, { cascade: true })
  batches: Batch[];
}
