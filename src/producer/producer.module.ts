import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ManualPayment } from '../orders/entities/manual-payment.entity';
import { Event } from '../events/entities/event.entity';
import { Sector } from '../events/entities/sector.entity';
import { Batch } from '../events/entities/batch.entity';
import { Order } from '../orders/entities/order.entity';
import { Venue } from '../venues/entities/venue.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { ProducerService } from './producer.service';
import { ProducerEventsService } from './producer-events.service';
import { SellByEmailService } from './sell-by-email.service';
import { ProducerController } from './producer.controller';
import { OrdersModule } from '../orders/orders.module';
import { AuthModule } from '../auth/auth.module';
import { UsersModule } from '../users/users.module';
import { ClaimTokensModule } from '../claim-tokens/claim-tokens.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([ManualPayment, Event, Sector, Batch, Order, Venue, Ticket]),
    OrdersModule,
    AuthModule,
    UsersModule,
    ClaimTokensModule,
  ],
  controllers: [ProducerController],
  providers: [ProducerService, ProducerEventsService, SellByEmailService],
})
export class ProducerModule {}
