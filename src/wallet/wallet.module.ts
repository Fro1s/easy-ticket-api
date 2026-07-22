import { Module } from '@nestjs/common';
import { WalletController } from './wallet.controller';
import { GoogleWalletService } from './google-wallet.service';

@Module({
  controllers: [WalletController],
  providers: [GoogleWalletService],
})
export class WalletModule {}
