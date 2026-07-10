import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'node:crypto';
import { IsNull, Repository } from 'typeorm';
import { ClaimToken } from './entities/claim-token.entity';
import { ClaimTokenPurpose } from '../common/enums/claim-token-purpose.enum';

/**
 * Hash de repouso do token: guardamos apenas o SHA-256, nunca o valor cru.
 * Um vazamento de leitura do banco não expõe links de login/claim utilizáveis.
 */
function hashToken(raw: string): string {
  return createHash('sha256').update(raw).digest('hex');
}

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
    const rawToken = randomBytes(32).toString('base64url');
    const claim = this.repo.create({
      userId,
      token: hashToken(rawToken),
      purpose,
      expiresAt: new Date(Date.now() + ttlMs),
      usedAt: null,
    });
    const saved = await this.repo.save(claim);
    // Devolve o token cru (apenas em memória) para montar a URL do e-mail;
    // o que fica persistido é o hash.
    saved.token = rawToken;
    return saved;
  }

  /**
   * Emite um novo token CLAIM e invalida os anteriores ainda não usados do
   * mesmo usuário. Antes reaproveitava o token existente, mas como agora só o
   * hash é persistido o valor cru não é recuperável — então sempre reemitimos
   * e revogamos os pendentes para não deixar links órfãos válidos.
   */
  async upsertClaim(userId: string, ttlMs: number): Promise<ClaimToken> {
    await this.repo.update(
      { userId, purpose: ClaimTokenPurpose.CLAIM, usedAt: IsNull() },
      { usedAt: new Date() },
    );
    return this.issue(userId, ClaimTokenPurpose.CLAIM, ttlMs);
  }

  async consume(
    token: string,
    purpose: ClaimTokenPurpose,
  ): Promise<ClaimToken> {
    const tokenHash = hashToken(token);
    // Consumo atômico: marca usedAt em um único UPDATE condicional, evitando
    // que duas requisições concorrentes com o mesmo token gerem duas sessões.
    const now = new Date();
    const result = await this.repo
      .createQueryBuilder()
      .update(ClaimToken)
      .set({ usedAt: now })
      .where('token = :tokenHash', { tokenHash })
      .andWhere('purpose = :purpose', { purpose })
      .andWhere('usedAt IS NULL')
      .andWhere('expiresAt > :now', { now })
      .returning('*')
      .execute();

    const affected = result.affected ?? 0;
    if (affected === 0) {
      // Distingue "não existe / propósito errado" de "já usado / expirado" só
      // o suficiente para não vazar validade do token.
      const exists = await this.repo.findOne({ where: { token: tokenHash } });
      if (!exists || exists.purpose !== purpose) {
        throw new BadRequestException('invalid token');
      }
      if (exists.usedAt) throw new BadRequestException('token already used');
      throw new BadRequestException('token expired');
    }

    const rows = (result.raw ?? []) as ClaimToken[];
    if (rows.length > 0) return rows[0];
    // Fallback caso o driver não retorne a linha.
    return this.repo.findOneOrFail({ where: { token: tokenHash } });
  }

  async peek(
    token: string,
    purpose: ClaimTokenPurpose,
  ): Promise<ClaimToken | null> {
    const found = await this.repo.findOne({
      where: { token: hashToken(token) },
    });
    if (!found || found.purpose !== purpose) return null;
    if (found.usedAt || found.expiresAt.getTime() < Date.now()) return null;
    return found;
  }
}
