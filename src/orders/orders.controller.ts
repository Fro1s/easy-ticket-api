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
import { OrdersService } from './orders.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { CheckoutOrderDto } from './dto/checkout-order.dto';
import {
  ConfirmedOrderResponse,
  OrderResponse,
} from './dto/order.response';

interface AuthedRequest extends Request {
  user: { id: string; email: string; role: string };
}

@ApiTags('orders')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @ApiOperation({
    summary:
      'Reserve sector stock and create a pending order (10min reservation TTL)',
  })
  @ApiResponse({ status: 201, type: OrderResponse })
  create(
    @Req() req: AuthedRequest,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.create(req.user.id, dto);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Fetch a single order owned by the current user' })
  @ApiResponse({ status: 200, type: OrderResponse })
  findOne(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<OrderResponse> {
    return this.orders.findOne(req.user.id, id);
  }

  @Post(':id/checkout')
  @ApiOperation({
    summary:
      'Choose a payment method and create the payment session (Pix QR / card token)',
  })
  @ApiResponse({ status: 200, type: OrderResponse })
  checkout(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
    @Body() dto: CheckoutOrderDto,
  ): Promise<OrderResponse> {
    return this.orders.checkout(req.user.id, id, dto);
  }

  @Post(':id/simulate-payment')
  @ApiOperation({
    summary:
      'DEV: simulate Abacate Pay webhook — marks the order as PAID and issues tickets',
  })
  @ApiResponse({ status: 200, type: ConfirmedOrderResponse })
  simulatePayment(
    @Req() req: AuthedRequest,
    @Param('id') id: string,
  ): Promise<ConfirmedOrderResponse> {
    return this.orders.simulatePayment(req.user.id, id);
  }
}
