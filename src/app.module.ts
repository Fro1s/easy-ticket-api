import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { dataSourceOptions } from './common/database/data-source';
import { UserOrIpThrottlerGuard } from './common/guards/user-throttler.guard';
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
import { AdminModule } from './admin/admin.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting global: 100 req/min por IP como padrão. Rotas sensíveis
    // (auth) usam limites mais apertados via @Throttle no controller.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: 100 }]),
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
    AdminModule,
  ],
  providers: [{ provide: APP_GUARD, useClass: UserOrIpThrottlerGuard }],
})
export class AppModule {}
