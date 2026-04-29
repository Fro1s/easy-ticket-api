import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Order } from './order.entity';
import { User } from '../../users/entities/user.entity';

@Entity('manual_payments')
export class ManualPayment {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Index({ unique: true })
  @Column('varchar', { length: 32 })
  orderId: string;

  @ManyToOne(() => Order, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('varchar', { length: 32 })
  confirmedByUserId: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'confirmedByUserId' })
  confirmedBy: User;

  @Column('varchar', { length: 200, nullable: true })
  reference: string | null;

  @Column('timestamptz', { default: () => 'now()' })
  confirmedAt: Date;

  @CreateDateColumn()
  createdAt: Date;
}
