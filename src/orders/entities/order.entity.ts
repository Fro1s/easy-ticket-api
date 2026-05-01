import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { PaymentMethod } from '../../common/enums/payment-method.enum';
import { User } from '../../users/entities/user.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { OrderItem } from './order-item.entity';

@Entity('orders')
export class Order {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 32 })
  userId: string;

  @ManyToOne(() => User, (user) => user.orders)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: OrderStatus, default: OrderStatus.PENDING })
  status: OrderStatus;

  @Column('int')
  subtotalCents: number;

  @Column('int')
  feeCents: number;

  @Column({ type: 'int', default: 0 })
  processingFeeCents!: number;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  processingFeeMethod!: PaymentMethod | null;

  @Column('int', { default: 0 })
  discountCents: number;

  @Column('int')
  totalCents: number;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true })
  paymentMethod: PaymentMethod | null;

  @Column('varchar', { length: 200, nullable: true })
  paymentId: string | null;

  @Column('timestamptz')
  reservedUntil: Date;

  @CreateDateColumn()
  createdAt: Date;

  @Column('timestamptz', { nullable: true })
  paidAt: Date | null;

  @OneToMany(() => OrderItem, (item) => item.order, { cascade: true })
  items: OrderItem[];

  @OneToMany(() => Ticket, (ticket) => ticket.order)
  tickets: Ticket[];
}
