import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClaimToken } from './entities/claim-token.entity';
import { ClaimTokensService } from './claim-tokens.service';

@Module({
  imports: [TypeOrmModule.forFeature([ClaimToken])],
  providers: [ClaimTokensService],
  exports: [ClaimTokensService],
})
export class ClaimTokensModule {}
