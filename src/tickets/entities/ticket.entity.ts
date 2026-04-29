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
import { TicketStatus } from '../../common/enums/ticket-status.enum';
import { Order } from '../../orders/entities/order.entity';
import { User } from '../../users/entities/user.entity';

@Entity('tickets')
export class Ticket {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Index({ unique: true })
  @Column('varchar', { length: 40 })
  shortCode: string;

  @Column('varchar', { length: 32 })
  orderId: string;

  @ManyToOne(() => Order, (order) => order.tickets)
  @JoinColumn({ name: 'orderId' })
  order: Order;

  @Column('varchar', { length: 32 })
  userId: string;

  @ManyToOne(() => User, (user) => user.tickets)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('varchar', { length: 32 })
  eventId: string;

  @Column('varchar', { length: 32 })
  sectorId: string;

  @Index({ unique: true })
  @Column('text')
  qrToken: string;

  @Column({ type: 'enum', enum: TicketStatus, default: TicketStatus.VALID })
  status: TicketStatus;

  @Column('timestamptz', { nullable: true })
  usedAt: Date | null;

  @Column('varchar', { length: 32, nullable: true })
  transferredToUserId: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
