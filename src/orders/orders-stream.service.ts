import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Observable, Subject, finalize } from 'rxjs';
import { OrderStatus } from '../common/enums/order-status.enum';

export interface OrderStreamEvent {
  type: 'status';
  orderId: string;
  status: OrderStatus;
  paidAt?: string | null;
}

interface SseMessage {
  data: OrderStreamEvent;
}

@Injectable()
export class OrdersStreamService implements OnModuleDestroy {
  private readonly logger = new Logger(OrdersStreamService.name);
  private readonly subjects = new Map<string, Subject<SseMessage>>();
  private readonly subscribers = new Map<string, number>();

  subscribe(orderId: string): Observable<SseMessage> {
    let subject = this.subjects.get(orderId);
    if (!subject) {
      subject = new Subject<SseMessage>();
      this.subjects.set(orderId, subject);
    }
    this.subscribers.set(orderId, (this.subscribers.get(orderId) ?? 0) + 1);

    return subject.asObservable().pipe(
      finalize(() => {
        const remaining = (this.subscribers.get(orderId) ?? 1) - 1;
        if (remaining <= 0) {
          this.subscribers.delete(orderId);
          this.subjects.get(orderId)?.complete();
          this.subjects.delete(orderId);
        } else {
          this.subscribers.set(orderId, remaining);
        }
      }),
    );
  }

  notify(orderId: string, status: OrderStatus, paidAt?: Date | null): void {
    const subject = this.subjects.get(orderId);
    if (!subject) return;
    subject.next({
      data: {
        type: 'status',
        orderId,
        status,
        paidAt: paidAt ? paidAt.toISOString() : null,
      },
    });
  }

  onModuleDestroy(): void {
    for (const subject of this.subjects.values()) {
      subject.complete();
    }
    this.subjects.clear();
    this.subscribers.clear();
  }
}
