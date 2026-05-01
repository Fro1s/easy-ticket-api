import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Order } from './entities/order.entity';
import { OrderItem } from './entities/order-item.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { Event } from '../events/entities/event.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { OrdersService } from './orders.service';
import { OrdersStreamService } from './orders-stream.service';
import { OrdersController } from './orders.controller';
import { OrdersStreamController } from './orders-stream.controller';
import { PaymentsModule } from '../payments/payments.module';
import { UsersModule } from '../users/users.module';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Order, OrderItem, Sector, Batch, Event, Ticket]),
    forwardRef(() => PaymentsModule),
    UsersModule,
    EmailModule,
  ],
  controllers: [OrdersController, OrdersStreamController],
  providers: [OrdersService, OrdersStreamService],
  exports: [OrdersService, OrdersStreamService],
})
export class OrdersModule {}
