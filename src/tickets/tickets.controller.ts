import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { TicketsService } from './tickets.service';
import { SharedTicketResponse } from './dto/shared-ticket.response';

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
}
