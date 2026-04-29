import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  OneToMany,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Event } from '../../events/entities/event.entity';

@Entity('producers')
export class Producer {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 160 })
  name: string;

  @Index({ unique: true })
  @Column('varchar', { length: 18, nullable: true })
  cnpj: string | null;

  @Column('boolean', { default: false })
  absorbFee: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @OneToMany(() => Event, (event) => event.producer)
  events: Event[];
}
