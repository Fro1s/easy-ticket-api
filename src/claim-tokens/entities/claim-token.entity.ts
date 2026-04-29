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
import { ClaimTokenPurpose } from '../../common/enums/claim-token-purpose.enum';
import { User } from '../../users/entities/user.entity';

@Entity('claim_tokens')
export class ClaimToken {
  @PrimaryColumn('varchar', { length: 32 })
  id: string = createId();

  @Column('varchar', { length: 32 })
  userId: string;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Index({ unique: true })
  @Column('varchar', { length: 96 })
  token: string;

  @Column({ type: 'enum', enum: ClaimTokenPurpose })
  purpose: ClaimTokenPurpose;

  @Column('timestamptz')
  expiresAt: Date;

  @Column('timestamptz', { nullable: true })
  usedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;
}
