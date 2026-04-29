import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Role } from '../../common/enums/role.enum';
import { Order } from '../../orders/entities/order.entity';
import { Ticket } from '../../tickets/entities/ticket.entity';
import { Producer } from '../../producers/entities/producer.entity';

@Entity('users')
export class User {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Index({ unique: true })
  @Column('varchar', { length: 160 })
  email: string;

  @Index({ unique: true })
  @Column('varchar', { length: 14, nullable: true })
  cpf: string | null;

  @Column('varchar', { length: 160, nullable: true })
  name: string | null;

  @Column('varchar', { length: 32, nullable: true })
  phone: string | null;

  @Column('varchar', { length: 200, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.BUYER })
  role: Role;

  @Column('varchar', { length: 32, nullable: true })
  producerId: string | null;

  @ManyToOne(() => Producer, { eager: false, nullable: true })
  @JoinColumn({ name: 'producerId' })
  producer: Producer | null;

  @Column('timestamptz', { nullable: true })
  claimedAt: Date | null;

  @Index({ unique: true })
  @Column('varchar', { length: 32 })
  referralCode: string;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Order, (order) => order.user)
  orders: Order[];

  @OneToMany(() => Ticket, (ticket) => ticket.user)
  tickets: Ticket[];
}
