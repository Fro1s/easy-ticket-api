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
import { OrdersService } from '../orders/orders.service';
import { UsersService } from '../users/users.service';
import { Role } from '../common/enums/role.enum';
import { PaymentProvider } from '../common/enums/payment-provider.enum';
import { TicketStatus } from '../common/enums/ticket-status.enum';
import { ConfirmedOrderResponse } from '../orders/dto/order.response';
import { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { ValidateTicketDto, ValidateTicketResponse } from './dto/validate-ticket.dto';

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

      if (event.paymentProvider !== PaymentProvider.MANUAL_PIX) {
        throw new BadRequestException(
          'event is not configured for manual PIX',
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

  async validateTicket(
    currentUser: AuthenticatedUser,
    dto: ValidateTicketDto,
  ): Promise<ValidateTicketResponse> {
    const dbUser = await this.users.findById(currentUser.id);
    if (!dbUser) throw new ForbiddenException();

    return this.dataSource.transaction(async (mgr) => {
      const ticket = await mgr
        .getRepository(Ticket)
        .createQueryBuilder('t')
        .setLock('pessimistic_write')
        .where('t.qrToken = :token', { token: dto.qrToken })
        .getOne();

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
}
