import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { ReferralStatus } from '../../common/enums/referral-status.enum';

@Entity('referrals')
export class Referral {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Index({ unique: true })
  @Column('varchar', { length: 32 })
  code: string;

  @Column('varchar', { length: 32 })
  referrerId: string;

  @Column('varchar', { length: 32, nullable: true })
  referredId: string | null;

  @Column('int', { default: 2000 })
  rewardCents: number;

  @Column({ type: 'enum', enum: ReferralStatus, default: ReferralStatus.PENDING })
  status: ReferralStatus;

  @CreateDateColumn()
  createdAt: Date;
}
