import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { ClaimToken } from './entities/claim-token.entity';
import { ClaimTokenPurpose } from '../common/enums/claim-token-purpose.enum';

@Injectable()
export class ClaimTokensService {
  constructor(
    @InjectRepository(ClaimToken)
    private readonly repo: Repository<ClaimToken>,
  ) {}

  async issue(
    userId: string,
    purpose: ClaimTokenPurpose,
    ttlMs: number,
  ): Promise<ClaimToken> {
    const token = randomBytes(32).toString('base64url');
    const claim = this.repo.create({
      userId,
      token,
      purpose,
      expiresAt: new Date(Date.now() + ttlMs),
      usedAt: null,
    });
    return this.repo.save(claim);
  }

  /** Renews an existing CLAIM token if still unused; returns the live token. */
  async upsertClaim(userId: string, ttlMs: number): Promise<ClaimToken> {
    const existing = await this.repo.findOne({
      where: {
        userId,
        purpose: ClaimTokenPurpose.CLAIM,
        usedAt: IsNull(),
      },
      order: { createdAt: 'DESC' },
    });
    if (existing && existing.expiresAt.getTime() > Date.now()) {
      return existing;
    }
    return this.issue(userId, ClaimTokenPurpose.CLAIM, ttlMs);
  }

  async consume(
    token: string,
    purpose: ClaimTokenPurpose,
  ): Promise<ClaimToken> {
    const found = await this.repo.findOne({ where: { token } });
    if (!found || found.purpose !== purpose) {
      throw new BadRequestException('invalid token');
    }
    if (found.usedAt) throw new BadRequestException('token already used');
    if (found.expiresAt.getTime() < Date.now()) {
      throw new BadRequestException('token expired');
    }
    found.usedAt = new Date();
    await this.repo.save(found);
    return found;
  }

  async peek(
    token: string,
    purpose: ClaimTokenPurpose,
  ): Promise<ClaimToken | null> {
    const found = await this.repo.findOne({ where: { token } });
    if (!found || found.purpose !== purpose) return null;
    if (found.usedAt || found.expiresAt.getTime() < Date.now()) return null;
    return found;
  }
}
