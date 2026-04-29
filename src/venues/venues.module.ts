import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Venue } from './entities/venue.entity';
import { VenuesController } from './venues.controller';
import { VenuesService } from './venues.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [TypeOrmModule.forFeature([Venue]), AuthModule],
  controllers: [VenuesController],
  providers: [VenuesService],
})
export class VenuesModule {}
