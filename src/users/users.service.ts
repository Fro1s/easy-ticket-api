import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { User } from './entities/user.entity';
import { Role } from '../common/enums/role.enum';

export interface CreateUserInput {
  email: string;
  name: string | null;
  cpf: string | null;
  phone: string | null;
  passwordHash: string | null;
  role?: Role;
}

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private readonly repo: Repository<User>) {}

  findByEmail(email: string): Promise<User | null> {
    return this.repo.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.repo.findOne({ where: { id } });
  }

  async create(input: CreateUserInput): Promise<User> {
    const user = this.repo.create({
      ...input,
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
