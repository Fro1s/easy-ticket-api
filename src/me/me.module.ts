import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../users/entities/user.entity';
import { Order } from '../orders/entities/order.entity';
import { Ticket } from '../tickets/entities/ticket.entity';
import { MeController } from './me.controller';
import { MeService } from './me.service';

@Module({
  imports: [TypeOrmModule.forFeature([User, Order, Ticket])],
  controllers: [MeController],
  providers: [MeService],
})
export class MeModule {}
