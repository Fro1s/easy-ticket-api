import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../auth/decorators/current-user.decorator';
import { Role } from '../common/enums/role.enum';
import { ProducerService } from './producer.service';
import { ProducerEventsService } from './producer-events.service';
import { ProducerBatchesService } from './producer-batches.service';
import { SellByEmailService } from './sell-by-email.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { UpdateBatchDto } from './dto/update-batch.dto';
import { BatchListResponse, BatchResponse } from './dto/batch.response';
import { CancelOrderResponse } from './dto/cancel-order.response';
import { ConfirmManualPaymentDto } from './dto/confirm-manual-payment.dto';
import { SellByEmailDto, SellByEmailResponse } from './dto/sell-by-email.dto';
import { ValidateTicketDto, ValidateTicketResponse } from './dto/validate-ticket.dto';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { ListProducerOrdersQuery } from './dto/list-orders.query';
import { ProducerOrdersResponse } from './dto/producer-order.response';
import {
  ProducerDashboardResponse,
  ProducerEventDetail,
  ProducerEventListResponse,
} from './dto/producer-event.response';
import { ConfirmedOrderResponse } from '../orders/dto/order.response';

@ApiTags('producer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.PRODUCER, Role.ADMIN)
@Controller('producer')
export class ProducerController {
  constructor(
    private readonly producer: ProducerService,
    private readonly events: ProducerEventsService,
    private readonly sellByEmail: SellByEmailService,
    private readonly batchesSvc: ProducerBatchesService,
  ) {}

  @Get('me/dashboard')
  @ApiOperation({
    summary: 'Aggregated KPIs for the producer (admin sees all events)',
  })
  @ApiResponse({ status: 200, type: ProducerDashboardResponse })
  dashboard(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProducerDashboardResponse> {
    return this.events.dashboard(user);
  }

  @Get('events')
  @ApiOperation({
    summary: 'List events scoped to the current producer (admin sees all)',
  })
  @ApiResponse({ status: 200, type: ProducerEventListResponse })
  listEvents(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ProducerEventListResponse> {
    return this.events.list(user);
  }

  @Post('events')
  @ApiOperation({ summary: 'Create a draft event' })
  @ApiResponse({ status: 201, type: ProducerEventDetail })
  createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ): Promise<ProducerEventDetail> {
    return this.events.create(user, dto);
  }

  @Get('events/:slug')
  @ApiOperation({ summary: 'Get a single event by slug (producer-scoped)' })
  @ApiResponse({ status: 200, type: ProducerEventDetail })
  getEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<ProducerEventDetail> {
    return this.events.getBySlug(user, slug);
  }

  @Patch('events/:id')
  @ApiOperation({ summary: 'Update a DRAFT event (producer-scoped)' })
  @ApiResponse({ status: 200, type: ProducerEventDetail })
  updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<ProducerEventDetail> {
    return this.events.updateDraft(user, id, dto);
  }

  @Post('events/:id/publish')
  @ApiOperation({
    summary: 'Publish a draft event (validates capacity + dates)',
  })
  @ApiResponse({ status: 200, type: ProducerEventDetail })
  publishEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ProducerEventDetail> {
    return this.events.publish(user, id);
  }

  @Get('events/:slug/orders')
  @ApiOperation({
    summary: 'List orders for an event (filterable + paginated)',
  })
  @ApiResponse({ status: 200, type: ProducerOrdersResponse })
  listOrders(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Query() query: ListProducerOrdersQuery,
  ): Promise<ProducerOrdersResponse> {
    return this.events.listOrders(user, slug, query);
  }

  @Post('events/:id/sell-by-email')
  @ApiOperation({
    summary:
      'Sell tickets directly by email — creates ghost user if needed, emits tickets, sends email with QR + claim link.',
  })
  @ApiResponse({ status: 201, type: SellByEmailResponse })
  sell(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: SellByEmailDto,
  ): Promise<SellByEmailResponse> {
    return this.sellByEmail.sell(user, id, dto);
  }

  @Post('tickets/validate')
  @ApiOperation({
    summary:
      'Validate a QR ticket at the venue gate — flips status to USED (pessimistic lock, idempotent on 409)',
  })
  @ApiResponse({ status: 200, type: ValidateTicketResponse })
  validateTicket(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateTicketDto,
  ): Promise<ValidateTicketResponse> {
    return this.producer.validateTicket(user, dto);
  }

  @Post('orders/:id/confirm-manual-payment')
  @ApiOperation({
    summary:
      'Manually confirm a Manual-PIX order (producer/admin reconciles payment offline)',
  })
  @ApiResponse({ status: 200, type: ConfirmedOrderResponse })
  confirmManualPayment(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ConfirmManualPaymentDto,
  ): Promise<ConfirmedOrderResponse> {
    return this.producer.confirmManualPayment(user, id, dto.reference ?? null);
  }

  @Post('orders/:id/cancel')
  @ApiOperation({
    summary:
      'Cancel a pending unpaid order and release its reserved ticket stock',
  })
  @ApiResponse({ status: 200, type: CancelOrderResponse })
  cancelPendingOrder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<CancelOrderResponse> {
    return this.producer.cancelPendingOrder(user, id);
  }

  @Get('events/:eventId/sectors/:sectorId/batches')
  @ApiOperation({ summary: 'List batches for a sector' })
  @ApiResponse({ status: 200, type: BatchListResponse })
  listBatches(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
  ) { return this.batchesSvc.list(u, eventId, sectorId); }

  @Post('events/:eventId/sectors/:sectorId/batches')
  @ApiOperation({ summary: 'Create a batch in a sector' })
  @ApiResponse({ status: 201, type: BatchResponse })
  createBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Body() dto: CreateBatchDto,
  ) { return this.batchesSvc.create(u, eventId, sectorId, dto); }

  @Patch('events/:eventId/sectors/:sectorId/batches/:batchId')
  @ApiOperation({ summary: 'Update a batch' })
  @ApiResponse({ status: 200, type: BatchResponse })
  updateBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Param('batchId') batchId: string,
    @Body() dto: UpdateBatchDto,
  ) { return this.batchesSvc.update(u, eventId, sectorId, batchId, dto); }

  @Delete('events/:eventId/sectors/:sectorId/batches/:batchId')
  @ApiOperation({ summary: 'Delete a batch (only if no tickets sold)' })
  @ApiResponse({ status: 204 })
  removeBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Param('batchId') batchId: string,
  ) { return this.batchesSvc.remove(u, eventId, sectorId, batchId); }
}
