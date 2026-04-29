import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Producer } from './entities/producer.entity';

@Module({ imports: [TypeOrmModule.forFeature([Producer])] })
export class ProducersModule {}
