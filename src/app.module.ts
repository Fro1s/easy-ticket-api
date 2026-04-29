import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './common/database/data-source';
import { UsersModule } from './users/users.module';
import { ProducersModule } from './producers/producers.module';
import { VenuesModule } from './venues/venues.module';
import { EventsModule } from './events/events.module';
import { AuthModule } from './auth/auth.module';
import { MeModule } from './me/me.module';
import { OrdersModule } from './orders/orders.module';
import { ProducerModule } from './producer/producer.module';
import { TicketsModule } from './tickets/tickets.module';
import { EmailModule } from './email/email.module';
import { ClaimTokensModule } from './claim-tokens/claim-tokens.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRoot({ ...dataSourceOptions, autoLoadEntities: true }),
    UsersModule,
    ProducersModule,
    VenuesModule,
    EventsModule,
    AuthModule,
    MeModule,
    OrdersModule,
    ProducerModule,
    TicketsModule,
    EmailModule,
    ClaimTokensModule,
  ],
})
export class AppModule {}
