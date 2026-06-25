import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Req,
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
import { TicketsService } from './tickets.service';
import { SharedTicketResponse } from './dto/shared-ticket.response';
import {
  TransferTicketDto,
  TransferTicketResponse,
} from './dto/transfer-ticket.dto';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('tickets')
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Get('share/:shortCode')
  @ApiOperation({
    summary:
      'Public lookup for a ticket by its shortCode. Returns event/sector info but NEVER the qrToken.',
  })
  @ApiResponse({ status: 200, type: SharedTicketResponse })
  share(@Param('shortCode') shortCode: string): Promise<SharedTicketResponse> {
    return this.tickets.findShared(shortCode);
  }

  @Post(':id/transfer')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary:
      'Transfere o ticket (do usuário logado) para outro usuário já cadastrado, por email ou CPF.',
  })
  @ApiResponse({ status: 201, type: TransferTicketResponse })
  transfer(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: TransferTicketDto,
  ): Promise<TransferTicketResponse> {
    return this.tickets.transfer(req.user.id, id, dto);
  }
}
