import { ApiProperty } from '@nestjs/swagger';

export class GoogleWalletSaveResponse {
  @ApiProperty({ description: 'URL "Save to Google Wallet"' })
  saveUrl: string;
}
