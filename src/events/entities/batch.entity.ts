import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Sector } from './sector.entity';

@Entity('batches')
@Index(['sectorId', 'sortOrder'])
export class Batch {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 32 })
  sectorId: string;

  @ManyToOne(() => Sector, (sector) => sector.batches, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'sectorId' })
  sector: Sector;

  @Column('varchar', { length: 80 })
  name: string;

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

  @Column('timestamptz', { nullable: true })
  startsAt: Date | null;

  @Column('timestamptz', { nullable: true })
  endsAt: Date | null;
}
