import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { Role } from '../common/enums/role.enum';
import { UsersService } from '../users/users.service';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchListResponse, BatchResponse } from './dto/batch.response';

@Injectable()
export class ProducerBatchesService {
  constructor(
    @InjectRepository(Sector) private readonly sectors: Repository<Sector>,
    @InjectRepository(Batch) private readonly batches: Repository<Batch>,
    private readonly users: UsersService,
  ) {}

  private async ownership(
    user: AuthenticatedUser, eventId: string, sectorId: string,
  ): Promise<{ sector: Sector }> {
    const sector = await this.sectors.findOne({
      where: { id: sectorId },
      relations: { event: true },
    });
    if (!sector || sector.eventId !== eventId) {
      throw new NotFoundException('sector not found');
    }
    if (user.role !== Role.ADMIN) {
      const me = await this.users.findById(user.id);
      if (!me?.producerId || me.producerId !== sector.event.producerId) {
        throw new ForbiddenException('not your event');
      }
    }
    return { sector };
  }

  private toResponse(b: Batch): BatchResponse {
    return {
      id: b.id, sectorId: b.sectorId, name: b.name,
      priceCents: b.priceCents, capacity: b.capacity,
      sold: b.sold, reserved: b.reserved, sortOrder: b.sortOrder,
      producerOnly: b.producerOnly,
      startsAt: b.startsAt?.toISOString() ?? null,
      endsAt: b.endsAt?.toISOString() ?? null,
    };
  }

  async list(
    user: AuthenticatedUser, eventId: string, sectorId: string,
  ): Promise<BatchListResponse> {
    await this.ownership(user, eventId, sectorId);
    const items = await this.batches.find({
      where: { sectorId },
      order: { sortOrder: 'ASC' },
    });
    return { items: items.map((b) => this.toResponse(b)) };
  }

  async create(
    user: AuthenticatedUser, eventId: string, sectorId: string, dto: CreateBatchDto,
  ): Promise<BatchResponse> {
    const { sector } = await this.ownership(user, eventId, sectorId);
    const batch = this.batches.create({
      sectorId,
      name: dto.name,
      priceCents: dto.priceCents,
      capacity: dto.capacity,
      sortOrder: dto.sortOrder,
      producerOnly: dto.producerOnly ?? false,
      startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
    });
    await this.batches.save(batch);
    await this.recomputeSectorCapacity(sector);
    return this.toResponse(batch);
  }

  async update(
    user: AuthenticatedUser, eventId: string, sectorId: string,
    batchId: string, dto: UpdateBatchDto,
  ): Promise<BatchResponse> {
    const { sector } = await this.ownership(user, eventId, sectorId);
    const batch = await this.batches.findOne({ where: { id: batchId, sectorId } });
    if (!batch) throw new NotFoundException('batch not found');
    if (dto.name !== undefined) batch.name = dto.name;
    if (dto.priceCents !== undefined) batch.priceCents = dto.priceCents;
    if (dto.sortOrder !== undefined) batch.sortOrder = dto.sortOrder;
    if (dto.producerOnly !== undefined) batch.producerOnly = dto.producerOnly;
    if (dto.startsAt !== undefined) {
      batch.startsAt = dto.startsAt === null ? null : new Date(dto.startsAt);
    }
    if (dto.endsAt !== undefined) {
      batch.endsAt = dto.endsAt === null ? null : new Date(dto.endsAt);
    }
    if (dto.capacity !== undefined) {
      if (dto.capacity < batch.sold) {
        throw new BadRequestException(
          `capacidade não pode ser menor que ${batch.sold} (já vendidos)`,
        );
      }
      batch.capacity = dto.capacity;
    }
    await this.batches.save(batch);
    await this.recomputeSectorCapacity(sector);
    return this.toResponse(batch);
  }

  async remove(
    user: AuthenticatedUser, eventId: string, sectorId: string, batchId: string,
  ): Promise<void> {
    const { sector } = await this.ownership(user, eventId, sectorId);
    const batch = await this.batches.findOne({ where: { id: batchId, sectorId } });
    if (!batch) throw new NotFoundException('batch not found');
    if (batch.sold > 0) {
      throw new BadRequestException(
        'não é possível remover um lote com ingressos vendidos',
      );
    }
    await this.batches.delete(batch.id);
    await this.recomputeSectorCapacity(sector);
  }

  private async recomputeSectorCapacity(sector: Sector): Promise<void> {
    const all = await this.batches.find({ where: { sectorId: sector.id } });
    sector.capacity = all.reduce((s, b) => s + b.capacity, 0);
    sector.sold = all.reduce((s, b) => s + b.sold, 0);
    sector.reserved = all.reduce((s, b) => s + b.reserved, 0);
    await this.sectors.save(sector);
  }
}
