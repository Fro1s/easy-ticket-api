import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { AuthService } from '../auth/auth.service';
import { AuthResponse } from '../auth/dto/auth.response';
import { MeService } from './me.service';
import {
  MeProfile,
  MyOrdersResponse,
  MyTicketItem,
  MyTicketsResponse,
} from './dto/me.response';
import { MyOrdersQuery, MyTicketsQuery } from './dto/me.query';
import { ChangePasswordDto } from '../auth/dto/change-password.dto';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('me')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('me')
export class MeController {
  constructor(
    private readonly me: MeService,
    private readonly auth: AuthService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Get the current user profile + counters' })
  @ApiResponse({ status: 200, type: MeProfile })
  profile(@Req() req: AuthedRequest): Promise<MeProfile> {
    return this.me.profile(req.user.id);
  }

  @Get('tickets')
  @ApiOperation({ summary: 'List the current user tickets (paginated)' })
  @ApiResponse({ status: 200, type: MyTicketsResponse })
  tickets(
    @Req() req: AuthedRequest,
    @Query() query: MyTicketsQuery,
  ): Promise<MyTicketsResponse> {
    return this.me.listTickets(req.user.id, query);
  }

  @Get('tickets/:id')
  @ApiOperation({ summary: 'Get a single ticket owned by the current user' })
  @ApiResponse({ status: 200, type: MyTicketItem })
  ticket(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<MyTicketItem> {
    return this.me.findTicket(req.user.id, id);
  }

  @Post('password')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @ApiOperation({
    summary:
      'Change the current user password. Requires currentPassword when the ' +
      'account already has one. Revokes other sessions and returns a new one.',
  })
  @ApiResponse({ status: 201, type: AuthResponse })
  changePassword(
    @Req() req: AuthedRequest,
    @Body() dto: ChangePasswordDto,
  ): Promise<AuthResponse> {
    return this.auth.changePassword(req.user.id, dto);
  }

  @Get('orders')
  @ApiOperation({ summary: 'List the current user orders (paginated)' })
  @ApiResponse({ status: 200, type: MyOrdersResponse })
  orders(
    @Req() req: AuthedRequest,
    @Query() query: MyOrdersQuery,
  ): Promise<MyOrdersResponse> {
    return this.me.listOrders(req.user.id, query);
  }
}
