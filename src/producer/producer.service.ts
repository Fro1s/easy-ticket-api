import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryFailedError } from 'typeorm';
import { createId } from '@paralleldrive/cuid2';
import { Order } from '../orders/entities/order.entity';
import { ManualPayment } from '../orders/entities/manual-payment.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { OrderStatus } from '../common/enums/order-status.enum';
import { ConfirmedOrderResponse } from '../orders/dto/order.response';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import {
  ValidateTicketDto,
  ValidateTicketResponse,
} from './dto/validate-ticket.dto';
import { CancelOrderResponse } from './dto/cancel-order.response';
import {
  PortariaManifestResponse,
  PortariaManifestTicket,
} from './dto/portaria-manifest.response';
import { hashQrToken, holderFirstName } from './lib/portaria-manifest';
import {
  BatchValidationItemDto,
  BatchValidationResultItem,
  ValidateTicketsBatchDto,
  ValidateTicketsBatchResponse,
} from './dto/validate-tickets-batch.dto';
import { clampValidatedAt } from './lib/clamp-validated-at';

@Injectable()
export class ProducerService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly orders: OrdersService,
    private readonly users: UsersService,
  ) {}

  async confirmManualPayment(
    currentUser: AuthenticatedUser,
    orderId: string,
    reference: string | null,
  ): Promise<ConfirmedOrderResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    return this.dataSource.transaction(async (mgr) => {
      const order = await mgr.getRepository(Order).findOne({
        where: { id: orderId },
        relations: { items: { sector: { event: { venue: true } } } },
      });
      if (!order) throw new NotFoundException('order not found');

      const event = order.items[0]?.sector?.event;
      if (!event) throw new NotFoundException('order has no event');

      // Manual confirmation aplica a pedidos sem charge no gateway. paymentId
      // prefixado com `sbm:` é chave de idempotência da venda por email, e
      // `manual_` é marca de confirmação manual anterior — nenhum dos dois
      // indica charge no gateway, então não devem bloquear esta confirmação.
      const isGatewayCharge =
        !!order.paymentId &&
        !order.paymentId.startsWith('sbm:') &&
        !order.paymentId.startsWith('manual_');
      if (isGatewayCharge) {
        throw new BadRequestException(
          'this order is processed by the payment gateway and cannot be manually confirmed',
        );
      }

      if (
        currentUser.role !== Role.ADMIN &&
        dbUser.producerId !== event.producerId
      ) {
        throw new ForbiddenException(
          'producer can only confirm payments for their own events',
        );
      }

      try {
        await mgr.getRepository(ManualPayment).insert({
          id: createId(),
          orderId: order.id,
          confirmedByUserId: currentUser.id,
          reference: reference ?? null,
          confirmedAt: new Date(),
        });
      } catch (err) {
        if (
          err instanceof QueryFailedError &&
          /duplicate key|unique/i.test(err.message)
        ) {
          throw new ConflictException('order already manually confirmed');
        }
        throw err;
      }

      return this.orders.markOrderPaid(mgr, order, {
        allowMissingPaymentMethod: true,
        sendEmail: true,
      });
    });
  }

  async cancelPendingOrder(
    currentUser: AuthenticatedUser,
    orderId: string,
  ): Promise<CancelOrderResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    return this.dataSource.transaction(async (mgr) => {
      const order = await mgr
        .getRepository(Order)
        .createQueryBuilder('o')
        .setLock('pessimistic_write')
        .where('o.id = :orderId', { orderId })
        .getOne();

      if (!order) throw new NotFoundException('order not found');

      const fullOrder = await mgr.getRepository(Order).findOne({
        where: { id: order.id },
        relations: { items: { sector: { event: true } } },
      });
      if (!fullOrder) throw new NotFoundException('order not found');
      order.items = fullOrder.items;

      const event = order.items[0]?.sector?.event;
      if (!event) throw new NotFoundException('order has no event');

      if (
        currentUser.role !== Role.ADMIN &&
        dbUser.producerId !== event.producerId
      ) {
        throw new ForbiddenException(
          'producer can only cancel orders for their own events',
        );
      }

      if (
        order.status === OrderStatus.CANCELLED ||
        order.status === OrderStatus.EXPIRED
      ) {
        return { orderId: order.id, status: order.status, releasedQty: 0 };
      }
      if (order.status !== OrderStatus.PENDING) {
        throw new BadRequestException(
          'only pending unpaid orders can be cancelled here',
        );
      }

      const sectorIds = order.items.map((item) => item.sectorId);
      const batchIds = order.items.map((item) => item.batchId);

      const sectors = await mgr
        .getRepository(Sector)
        .createQueryBuilder('s')
        .setLock('pessimistic_write')
        .where('s.id IN (:...ids)', { ids: sectorIds })
        .getMany();
      const batches = await mgr
        .getRepository(Batch)
        .createQueryBuilder('b')
        .setLock('pessimistic_write')
        .where('b.id IN (:...ids)', { ids: batchIds })
        .getMany();

      const sectorsById = new Map(sectors.map((sector) => [sector.id, sector]));
      const batchesById = new Map(batches.map((batch) => [batch.id, batch]));
      let releasedQty = 0;

      for (const item of order.items) {
        const sector = sectorsById.get(item.sectorId);
        if (sector) {
          sector.reserved = Math.max(0, sector.reserved - item.qty);
        }
        const batch = batchesById.get(item.batchId);
        if (batch) {
          batch.reserved = Math.max(0, batch.reserved - item.qty);
        }
        releasedQty += item.qty;
      }

      await mgr.getRepository(Sector).save(sectors);
      await mgr.getRepository(Batch).save(batches);

      order.status = OrderStatus.CANCELLED;
      order.reservedUntil = new Date();
      await mgr.getRepository(Order).save(order);

      return { orderId: order.id, status: order.status, releasedQty };
    });
  }

  async validateTicket(
    currentUser: AuthenticatedUser,
    dto: ValidateTicketDto,
  ): Promise<ValidateTicketResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    return this.dataSource.transaction(async (mgr) => {
      const qb = mgr
        .getRepository(Ticket)
        .createQueryBuilder('t')
        .setLock('pessimistic_write');
      if (dto.ticketId) {
        qb.where('t.id = :id', { id: dto.ticketId });
      } else if (dto.shortCode) {
        qb.where('UPPER(t.shortCode) = UPPER(:code)', { code: dto.shortCode });
      } else {
        qb.where('t.qrToken = :token', { token: dto.qrToken });
      }
      const ticket = await qb.getOne();

      if (!ticket) {
        throw new NotFoundException({ ok: false, reason: 'NOT_FOUND' });
      }

      const event = await mgr.findOne(Event, {
        where: { id: ticket.eventId },
      });

      if (
        currentUser.role !== Role.ADMIN &&
        dbUser.producerId !== event?.producerId
      ) {
        throw new ForbiddenException({ ok: false, reason: 'WRONG_EVENT' });
      }

      if (ticket.status === TicketStatus.USED) {
        throw new HttpException(
          { ok: false, reason: 'ALREADY_USED', usedAt: ticket.usedAt },
          HttpStatus.CONFLICT,
        );
      }

      if (ticket.status !== TicketStatus.VALID) {
        throw new HttpException(
          { ok: false, reason: ticket.status },
          HttpStatus.GONE,
        );
      }

      ticket.status = TicketStatus.USED;
      ticket.usedAt = new Date();
      await mgr.save(ticket);

      const row = await mgr
        .getRepository(Ticket)
        .createQueryBuilder('t')
        .leftJoin('sectors', 's', 's.id = t.sectorId')
        .leftJoin('users', 'u', 'u.id = t.userId')
        .where('t.id = :id', { id: ticket.id })
        .select([
          't.shortCode AS t_short',
          's.name AS s_name',
          's.colorHex AS s_color',
          'u.name AS u_name',
        ])
        .getRawOne();

      const holderFullName: string = row?.u_name ?? '';
      const holderFirstName = holderFullName.trim().split(/\s+/)[0] ?? '';

      return {
        ok: true,
        ticket: {
          shortCode: row?.t_short ?? ticket.shortCode,
          sectorName: row?.s_name ?? '',
          sectorColor: row?.s_color ?? '#888888',
          holderFirstName,
          validatedAt: ticket.usedAt.toISOString(),
        },
      };
    });
  }

  async portariaManifest(
    currentUser: AuthenticatedUser,
    slug: string,
  ): Promise<PortariaManifestResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    const event = await this.dataSource
      .getRepository(Event)
      .findOne({ where: { slug } });
    if (!event) throw new NotFoundException('event not found');
    if (
      currentUser.role !== Role.ADMIN &&
      dbUser.producerId !== event.producerId
    ) {
      throw new ForbiddenException(
        'producer can only load manifests for their own events',
      );
    }

    const rows: Array<{
      t_id: string;
      t_qr: string;
      t_short: string;
      t_status: string;
      t_used: Date | null;
      t_holder: string | null;
      s_name: string | null;
      s_color: string | null;
      b_name: string | null;
      u_name: string | null;
    }> = await this.dataSource
      .getRepository(Ticket)
      .createQueryBuilder('t')
      .leftJoin('sectors', 's', 's.id = t.sectorId')
      .leftJoin('batches', 'b', 'b.id = t.batchId')
      .leftJoin('users', 'u', 'u.id = t.userId')
      .where('t.eventId = :eventId', { eventId: event.id })
      .select([
        't.id AS t_id',
        't.qrToken AS t_qr',
        't.shortCode AS t_short',
        't.status AS t_status',
        't.usedAt AS t_used',
        't.holderName AS t_holder',
        's.name AS s_name',
        's.colorHex AS s_color',
        'b.name AS b_name',
        'u.name AS u_name',
      ])
      .getRawMany();

    const tickets: PortariaManifestTicket[] = rows.map((r) => ({
      ticketId: r.t_id,
      qrTokenHash: hashQrToken(r.t_qr),
      shortCode: r.t_short,
      sectorName: r.s_name ?? '',
      batchName: r.b_name ?? null,
      sectorColor: r.s_color ?? '#888888',
      holderFirstName: holderFirstName(r.t_holder, r.u_name),
      status: r.t_status,
      usedAt: r.t_used ? new Date(r.t_used).toISOString() : null,
    }));

    return {
      eventId: event.id,
      generatedAt: new Date().toISOString(),
      tickets,
    };
  }

  async validateTicketsBatch(
    currentUser: AuthenticatedUser,
    dto: ValidateTicketsBatchDto,
  ): Promise<ValidateTicketsBatchResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    const event = await this.dataSource
      .getRepository(Event)
      .findOne({ where: { id: dto.eventId } });
    if (!event) throw new NotFoundException('event not found');
    if (
      currentUser.role !== Role.ADMIN &&
      dbUser.producerId !== event.producerId
    ) {
      throw new ForbiddenException(
        'producer can only validate tickets for their own events',
      );
    }

    const results: BatchValidationResultItem[] = [];
    // Uma transação por item: um conflito não pode derrubar o lote inteiro,
    // e o lock pessimista fica curto (mesma garantia do validateTicket unitário).
    for (const item of dto.items) {
      results.push(await this.validateOneForBatch(event.id, item));
    }
    return { results };
  }

  private async validateOneForBatch(
    eventId: string,
    item: BatchValidationItemDto,
  ): Promise<BatchValidationResultItem> {
    return this.dataSource.transaction(async (mgr) => {
      const ticket = await mgr
        .getRepository(Ticket)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.id = :id', { id: item.ticketId })
        .getOne();

      if (!ticket) {
        return { ticketId: item.ticketId, ok: false, reason: 'NOT_FOUND' };
      }
      if (ticket.eventId !== eventId) {
        return { ticketId: item.ticketId, ok: false, reason: 'WRONG_EVENT' };
      }
      if (ticket.status === TicketStatus.USED) {
        return {
          ticketId: item.ticketId,
          ok: false,
          reason: 'ALREADY_USED',
          usedAt: ticket.usedAt?.toISOString(),
        };
      }
      if (ticket.status !== TicketStatus.VALID) {
        return { ticketId: item.ticketId, ok: false, reason: ticket.status };
      }

      ticket.status = TicketStatus.USED;
      ticket.usedAt = clampValidatedAt(item.validatedAt);
      await mgr.save(ticket);
      return {
        ticketId: item.ticketId,
        ok: true,
        usedAt: ticket.usedAt.toISOString(),
      };
    });
  }

  async resendEmail(
    currentUser: AuthenticatedUser,
    orderId: string,
  ): Promise<{ sent: number }> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    const order = await this.dataSource.getRepository(Order).findOne({
      where: { id: orderId },
      relations: { items: { sector: { event: true } } },
    });
    if (!order) throw new NotFoundException('order not found');
    const event = order.items[0]?.sector?.event;
    if (!event) throw new NotFoundException('order has no event');
    if (
      currentUser.role !== Role.ADMIN &&
      dbUser.producerId !== event.producerId
    ) {
      throw new ForbiddenException(
        'producer can only resend emails for their own events',
      );
    }
    const sent = await this.orders.resendTicketsForOrder(orderId);
    return { sent };
  }
}
