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
import {
  ValidateTicketDto,
  ValidateTicketResponse,
} from './dto/validate-ticket.dto';
import { AttendeeSearchResponse } from './dto/attendee-search.response';
import { UpdateEventDto } from './dto/update-event.dto';
import { CreateEventDto } from './dto/create-event.dto';
import { ListProducerOrdersQuery } from './dto/list-orders.query';
import { SearchAttendeesQuery } from './dto/search-attendees.query';
import { ProducerOrdersResponse } from './dto/producer-order.response';
import {
  ProducerDashboardResponse,
  ProducerEventDetail,
  ProducerEventListResponse,
} from './dto/producer-event.response';
import { ConfirmedOrderResponse } from '../orders/dto/order.response';
import { ResendEmailResponse } from './dto/resend-email.response';
import { PortariaManifestResponse } from './dto/portaria-manifest.response';
import {
  ValidateTicketsBatchDto,
  ValidateTicketsBatchResponse,
} from './dto/validate-tickets-batch.dto';

@ApiTags('producer')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('producer')
export class ProducerController {
  constructor(
    private readonly producer: ProducerService,
    private readonly events: ProducerEventsService,
    private readonly sellByEmail: SellByEmailService,
    private readonly batchesSvc: ProducerBatchesService,
  ) {}

  @Get('me/dashboard')
  @Roles(Role.PRODUCER, Role.ADMIN)
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
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
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
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a draft event' })
  @ApiResponse({ status: 201, type: ProducerEventDetail })
  createEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateEventDto,
  ): Promise<ProducerEventDetail> {
    return this.events.create(user, dto);
  }

  @Get('events/:slug')
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
  @ApiOperation({ summary: 'Get a single event by slug (producer-scoped)' })
  @ApiResponse({ status: 200, type: ProducerEventDetail })
  getEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<ProducerEventDetail> {
    return this.events.getBySlug(user, slug);
  }

  @Patch('events/:id')
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a DRAFT event (producer-scoped)' })
  @ApiResponse({ status: 200, type: ProducerEventDetail })
  updateEvent(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateEventDto,
  ): Promise<ProducerEventDetail> {
    return this.events.updateEvent(user, id, dto);
  }

  @Post('events/:id/publish')
  @Roles(Role.PRODUCER, Role.ADMIN)
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
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
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

  @Get('events/:slug/attendees')
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary: 'Search attendees by buyer email/name, holder, or ticket code',
  })
  @ApiResponse({ status: 200, type: AttendeeSearchResponse })
  searchAttendees(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
    @Query() query: SearchAttendeesQuery,
  ): Promise<AttendeeSearchResponse> {
    return this.events.searchAttendees(user, slug, query);
  }

  @Get('events/:slug/portaria-manifest')
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Ticket manifest for offline gate validation — sha256 hashes, never raw QR tokens',
  })
  @ApiResponse({ status: 200, type: PortariaManifestResponse })
  portariaManifest(
    @CurrentUser() user: AuthenticatedUser,
    @Param('slug') slug: string,
  ): Promise<PortariaManifestResponse> {
    return this.producer.portariaManifest(user, slug);
  }

  @Post('events/:id/sell-by-email')
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
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
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
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

  @Post('tickets/validate-batch')
  @Roles(Role.PRODUCER, Role.ADMIN, Role.STAFF)
  @ApiOperation({
    summary:
      'Sync offline gate validations — marks each VALID ticket as USED, reports conflicts per item',
  })
  @ApiResponse({ status: 200, type: ValidateTicketsBatchResponse })
  validateTicketsBatch(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ValidateTicketsBatchDto,
  ): Promise<ValidateTicketsBatchResponse> {
    return this.producer.validateTicketsBatch(user, dto);
  }

  @Post('orders/:id/confirm-manual-payment')
  @Roles(Role.PRODUCER, Role.ADMIN)
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

  @Post('orders/:id/resend-email')
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Resend the ticket email(s) for a paid order' })
  @ApiResponse({ status: 200, type: ResendEmailResponse })
  resendEmail(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
  ): Promise<ResendEmailResponse> {
    return this.producer.resendEmail(user, id);
  }

  @Post('orders/:id/cancel')
  @Roles(Role.PRODUCER, Role.ADMIN)
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
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'List batches for a sector' })
  @ApiResponse({ status: 200, type: BatchListResponse })
  listBatches(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
  ) {
    return this.batchesSvc.list(u, eventId, sectorId);
  }

  @Post('events/:eventId/sectors/:sectorId/batches')
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Create a batch in a sector' })
  @ApiResponse({ status: 201, type: BatchResponse })
  createBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Body() dto: CreateBatchDto,
  ) {
    return this.batchesSvc.create(u, eventId, sectorId, dto);
  }

  @Patch('events/:eventId/sectors/:sectorId/batches/:batchId')
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Update a batch' })
  @ApiResponse({ status: 200, type: BatchResponse })
  updateBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Param('batchId') batchId: string,
    @Body() dto: UpdateBatchDto,
  ) {
    return this.batchesSvc.update(u, eventId, sectorId, batchId, dto);
  }

  @Delete('events/:eventId/sectors/:sectorId/batches/:batchId')
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiOperation({ summary: 'Delete a batch (only if no tickets sold)' })
  @ApiResponse({ status: 204 })
  removeBatch(
    @CurrentUser() u: AuthenticatedUser,
    @Param('eventId') eventId: string,
    @Param('sectorId') sectorId: string,
    @Param('batchId') batchId: string,
  ) {
    return this.batchesSvc.remove(u, eventId, sectorId, batchId);
  }
}
