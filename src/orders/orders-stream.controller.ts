import { Controller, NotFoundException, Param, Sse } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { Observable, merge, of, timer, map, takeUntil, filter } from 'rxjs';
import { Order } from './entities/order.entity';
import { OrdersStreamService } from './orders-stream.service';
import { OrderStatus } from '../common/enums/order-status.enum';

@ApiTags('orders')
@Controller('orders')
export class OrdersStreamController {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly stream: OrdersStreamService,
  ) {}

  /**
   * Server-Sent Events stream for order status transitions. Public on purpose:
   * orderId is a cuid (unguessable) and only status/paidAt is emitted, no PII.
   * Client (EventSource) cannot send Authorization headers, so we trust the id.
   */
  @Sse(':id/events')
  @ApiOperation({
    summary: 'Server-Sent Events stream for order status changes',
  })
  async events(@Param('id') id: string): Promise<Observable<{ data: unknown }>> {
    const order = await this.dataSource
      .getRepository(Order)
      .findOne({ where: { id }, select: { id: true, status: true, paidAt: true } });
    if (!order) throw new NotFoundException('order not found');

    const initial = of({
      data: {
        type: 'status' as const,
        orderId: order.id,
        status: order.status,
        paidAt: order.paidAt ? order.paidAt.toISOString() : null,
      },
    });

    // Keep-alive heartbeat every 25s — proxies kill idle connections at 30s.
    const heartbeat = timer(25_000, 25_000).pipe(map(() => ({ data: { type: 'ping' as const } })));

    const live = this.stream.subscribe(id);

    // Stop the stream once the order is in a terminal state (PAID / EXPIRED / CANCELLED).
    const terminal = live.pipe(
      filter((m) => {
        const s = (m.data as { status?: OrderStatus }).status;
        return s === OrderStatus.PAID || s === OrderStatus.EXPIRED || s === OrderStatus.CANCELLED;
      }),
    );

    if (
      order.status === OrderStatus.PAID ||
      order.status === OrderStatus.EXPIRED ||
      order.status === OrderStatus.CANCELLED
    ) {
      // Already terminal — emit once and complete.
      return initial;
    }

    return merge(initial, heartbeat, live).pipe(takeUntil(terminal));
  }
}
