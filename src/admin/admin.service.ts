import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import * as argon2 from 'argon2';
import { Producer } from '../producers/entities/producer.entity';
import { Event } from '../events/entities/event.entity';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import { EventStatus } from '../common/enums/event-status.enum';
import { CreateProducerDto } from './dto/create-producer.dto';
import { CreateProducerUserDto } from './dto/create-producer-user.dto';
import { ReassignEventDto } from './dto/reassign-event.dto';
import {
  AdminProducerItem,
  AdminProducersResponse,
  AdminProducerUser,
  ReassignEventResult,
} from './dto/admin-producers.response';
import { resolveFeatureToggle } from './lib/resolve-feature-toggle';
import { AdminEventActionResult } from './dto/admin-event-action.response';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Producer)
    private readonly producers: Repository<Producer>,
    @InjectRepository(Event) private readonly events: Repository<Event>,
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly usersService: UsersService,
    @InjectDataSource() private readonly dataSource: DataSource,
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
    const producer = await this.producers.findOne({
      where: { id: producerId },
    });
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

  private toActionResult(e: Event): AdminEventActionResult {
    return {
      id: e.id,
      status: e.status,
      featuredAt: e.featuredAt ? e.featuredAt.toISOString() : null,
    };
  }

  async archiveEvent(eventId: string): Promise<AdminEventActionResult> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event not found');
    if (event.status !== EventStatus.PUBLISHED) {
      throw new BadRequestException(
        'só é possível desativar um evento publicado',
      );
    }
    event.status = EventStatus.ARCHIVED;
    event.featuredAt = null; // evento fora do site não pode ser destaque
    await this.events.save(event);
    return this.toActionResult(event);
  }

  async unarchiveEvent(eventId: string): Promise<AdminEventActionResult> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event not found');
    if (event.status !== EventStatus.ARCHIVED) {
      throw new BadRequestException(
        'só é possível reativar um evento arquivado',
      );
    }
    event.status = EventStatus.PUBLISHED;
    await this.events.save(event);
    return this.toActionResult(event);
  }

  async featureEvent(
    eventId: string,
    featured: boolean,
  ): Promise<AdminEventActionResult> {
    const event = await this.events.findOne({ where: { id: eventId } });
    if (!event) throw new NotFoundException('event not found');
    const effect = resolveFeatureToggle({ status: event.status, featured });
    await this.dataSource.transaction(async (mgr) => {
      const repo = mgr.getRepository(Event);
      if (effect.clearOthers) {
        await repo
          .createQueryBuilder()
          .update(Event)
          .set({ featuredAt: null })
          .where('"featuredAt" IS NOT NULL')
          .execute();
      }
      event.featuredAt = effect.setTarget ? new Date() : null;
      await repo.save(event);
    });
    return this.toActionResult(event);
  }
}
