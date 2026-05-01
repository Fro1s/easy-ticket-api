import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Order } from './order.entity';
import { Sector } from '../../events/entities/sector.entity';
import { Batch } from '../../events/entities/batch.entity';

@Entity('order_items')
export class OrderItem {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 32 })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.items, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('varchar', { length: 32 })
  sectorId: string;

  @ManyToOne(() => Sector, { eager: false })
  @JoinColumn({ name: 'sectorId' })
  sector: Sector;

  @Column('varchar', { length: 32 })
  batchId: string;

  @ManyToOne(() => Batch, { eager: false })
  @JoinColumn({ name: 'batchId' })
  batch: Batch;

  @Column('int')
  qty: number;

  @Column('int')
  priceCents: number;
}
