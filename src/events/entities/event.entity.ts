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
import { Category } from '../../common/enums/category.enum';
import { EventStatus } from '../../common/enums/event-status.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PixKeyType } from '../../common/enums/pix-key-type.enum';
import { Venue } from '../../venues/entities/venue.entity';
import { Producer } from '../../producers/entities/producer.entity';
import { Sector } from './sector.entity';

const decimalTransformer = {
  to: (value?: number | null) => value,
  from: (value?: string | null) => (value == null ? value : Number(value)),
};

@Entity('events')
@Index(['startsAt', 'status'])
export class Event {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Index({ unique: true })
  @Column('varchar', { length: 200 })
  slug: string;

  @Column('varchar', { length: 200 })
  title: string;

  @Column('varchar', { length: 200 })
  artist: string;

  @Column({ type: 'enum', enum: Category })
  category: Category;

  @Column('timestamptz')
  startsAt: Date;

  @Column('timestamptz')
  doorsAt: Date;

  @Column('int', { default: 0 })
  ageRating: number;

  @Column('varchar', { length: 500 })
  posterUrl: string;

  @Column('text')
  description: string;

  @Column('varchar', { length: 32 })
  venueId: string;

  @ManyToOne(() => Venue, (venue) => venue.events, { eager: false })
  @JoinColumn({ name: 'venueId' })
  venue: Venue;

  @Column('varchar', { length: 32 })
  producerId: string;

  @ManyToOne(() => Producer, (producer) => producer.events, { eager: false })
  @JoinColumn({ name: 'producerId' })
  producer: Producer;

  @Column({ type: 'enum', enum: EventStatus, default: EventStatus.DRAFT })
  status: EventStatus;

  @Column({
    type: 'enum',
    enum: PaymentProvider,
    default: PaymentProvider.MANUAL_PIX,
  })
  paymentProvider: PaymentProvider;

  @Column('varchar', { length: 140, nullable: true })
  pixKey: string | null;

  @Column({ type: 'enum', enum: PixKeyType, nullable: true })
  pixKeyType: PixKeyType | null;

  @Column('varchar', { length: 160, nullable: true })
  pixHolderName: string | null;

  @Column('decimal', {
    precision: 5,
    scale: 4,
    default: 0.025,
    transformer: decimalTransformer,
  })
  platformFeeRate: number;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Sector, (sector) => sector.event, { cascade: true })
  sectors: Sector[];
}
