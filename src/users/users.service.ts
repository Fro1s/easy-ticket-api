import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { User } from './entities/user.entity';
import { Role } from '../common/enums/role.enum';
import { normalizeEmail } from './lib/normalize-email';
import { normalizeCpf } from './lib/normalize-cpf';

export interface CreateUserInput {
  email: string;
  name: string | null;
  cpf: string | null;
  phone: string | null;
  passwordHash: string | null;
  role?: Role;
  producerId?: string | null;
  claimedAt?: Date | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly repo: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    // passwordHash é select:false; a auth precisa dele para login/claim, então
    // reselecionamos explicitamente aqui.
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.email = :email', { email: normalizeEmail(email) })
      .getOne();
  }

  findByCpf(cpf: string): Promise<User | null> {
    return this.repo.findOne({ where: { cpf: normalizeCpf(cpf) } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  /** Como findById, mas reseleciona passwordHash (fluxos de auth/claim). */
  findByIdWithSecrets(id: string): Promise<User | null> {
    return this.repo
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('u.id = :id', { id })
      .getOne();
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.repo.create({
      ...input,
      email: normalizeEmail(input.email),
      role: input.role ?? Role.BUYER,
      referralCode: createId().slice(0, 10).toUpperCase(),
    });
    return this.repo.save(user);
  }

  async update(id: string, patch: Partial<User>): Promise<User> {
    await this.repo.update(id, patch);
    const fresh = await this.findById(id);
    if (!fresh) throw new Error(`user ${id} vanished after update`);
    return fresh;
  }
}
