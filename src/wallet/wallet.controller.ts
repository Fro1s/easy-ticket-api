import {
  Controller,
  Get,
  Header,
  Param,
  Req,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { GoogleWalletService } from './google-wallet.service';
import { AppleWalletService } from './apple-wallet.service';
import { GoogleWalletSaveResponse } from './dto/wallet.response';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me/tickets/:id/wallet')
export class WalletController {
  constructor(
    private readonly google: GoogleWalletService,
    private readonly apple: AppleWalletService,
  ) {}

  @Get('google')
  @ApiOperation({ summary: 'Save-to-Google-Wallet URL for an owned ticket' })
  @ApiResponse({ status: 200, type: GoogleWalletSaveResponse })
  googleSaveUrl(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<GoogleWalletSaveResponse> {
    return this.google.saveUrl(req.user.id, id);
  }

  @Get('apple')
  @Header('Content-Type', 'application/vnd.apple.pkpass')
  @ApiOperation({ summary: 'Apple Wallet .pkpass for an owned ticket' })
  async applePass(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<StreamableFile> {
    const { buffer, filename } = await this.apple.buildPass(
      req.user.id,
      id,
    );
    return new StreamableFile(buffer, {
      disposition: `attachment; filename="${filename}"`,
    });
  }
}
