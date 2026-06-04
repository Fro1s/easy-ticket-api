import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import * as argon2 from 'argon2';
import { Producer } from '../producers/entities/producer.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import { CreateProducerDto } from './dto/create-producer.dto';
import { CreateProducerUserDto } from './dto/create-producer-user.dto';
import { ReassignEventDto } from './dto/reassign-event.dto';
import {
  AdminProducerItem,
  AdminProducersResponse,
  AdminProducerUser,
  ReassignEventResult,
} from './dto/admin-producers.response';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Producer) private readonly producers: Repository<Producer>,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersService: UsersService,
  ) {}

  async listProducers(): Promise<AdminProducersResponse> {
    const producers = await this.producers.find({ order: { name: 'ASC' } });
    const ids = producers.map((p) => p.id);

    const countByProducer = new Map<string, number>();
    const usersByProducer = new Map<string, AdminProducerUser[]>();

    if (ids.length) {
      const counts = await this.events
        .createQueryBuilder('e')
        .select('e.producerId', 'producerId')
        .addSelect('COUNT(*)', 'c')
        .where('e.producerId IN (:...ids)', { ids })
        .groupBy('e.producerId')
        .getRawMany<{ producerId: string; c: string }>();
      for (const r of counts) countByProducer.set(r.producerId, Number(r.c));

      const producerUsers = await this.users.find({
        where: ids.map((producerId) => ({ producerId, role: Role.PRODUCER })),
        order: { createdAt: 'ASC' },
      });
      for (const u of producerUsers) {
        if (!u.producerId) continue;
        const list = usersByProducer.get(u.producerId) ?? [];
        list.push({
          id: u.id,
          name: u.name,
          email: u.email,
          createdAt: u.createdAt.toISOString(),
        });
        usersByProducer.set(u.producerId, list);
      }
    }

    const items: AdminProducerItem[] = producers.map((p) => ({
      id: p.id,
      name: p.name,
      cnpj: p.cnpj,
      eventCount: countByProducer.get(p.id) ?? 0,
      users: usersByProducer.get(p.id) ?? [],
    }));
    return { items };
  }

  async createProducer(dto: CreateProducerDto): Promise<AdminProducerItem> {
    const producer = this.producers.create({
      id: createId(),
      name: dto.name,
      cnpj: dto.cnpj ?? null,
    });
    await this.producers.save(producer);
    return {
      id: producer.id,
      name: producer.name,
      cnpj: producer.cnpj,
      eventCount: 0,
      users: [],
    };
  }

  async createProducerUser(
    producerId: string,
    dto: CreateProducerUserDto,
  ): Promise<AdminProducerUser> {
    const producer = await this.producers.findOne({ where: { id: producerId } });
    if (!producer) throw new NotFoundException('producer not found');

    const existing = await this.usersService.findByEmail(dto.email);
    if (existing) throw new ConflictException('email already in use');

    const passwordHash = await argon2.hash(dto.password);
    const user = await this.usersService.create({
      email: dto.email,
      name: dto.name,
      cpf: null,
      phone: null,
      passwordHash,
      role: Role.PRODUCER,
      producerId,
      claimedAt: new Date(),
    });
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt.toISOString(),
    };
  }

  async reassignEvent(
    eventId: string,
    dto: ReassignEventDto,
  ): Promise<ReassignEventResult> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event not found');
    const producer = await this.producers.findOne({
      where: { id: dto.producerId },
    });
    if (!producer) throw new NotFoundException('producer not found');
    await this.events.update(eventId, { producerId: dto.producerId });
    return { id: eventId, producerId: dto.producerId };
  }
}
