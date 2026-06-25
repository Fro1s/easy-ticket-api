import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
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
import { Role } from '../common/enums/role.enum';
import { AdminService } from './admin.service';
import { CreateProducerDto } from './dto/create-producer.dto';
import { CreateProducerUserDto } from './dto/create-producer-user.dto';
import { ReassignEventDto } from './dto/reassign-event.dto';
import {
  AdminProducerItem,
  AdminProducersResponse,
  AdminProducerUser,
  ReassignEventResult,
} from './dto/admin-producers.response';
import { FeatureEventDto } from './dto/feature-event.dto';
import { AdminEventActionResult } from './dto/admin-event-action.response';

@ApiTags('admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('producers')
  @ApiOperation({
    summary: 'List organizations with their logins and event counts',
  })
  @ApiResponse({ status: 200, type: AdminProducersResponse })
  listProducers(): Promise<AdminProducersResponse> {
    return this.admin.listProducers();
  }

  @Post('producers')
  @ApiOperation({ summary: 'Create an organization (Producer)' })
  @ApiResponse({ status: 201, type: AdminProducerItem })
  createProducer(@Body() dto: CreateProducerDto): Promise<AdminProducerItem> {
    return this.admin.createProducer(dto);
  }

  @Post('producers/:producerId/users')
  @ApiOperation({ summary: 'Create a PRODUCER login under an organization' })
  @ApiResponse({ status: 201, type: AdminProducerUser })
  createProducerUser(
    @Param('producerId') producerId: string,
    @Body() dto: CreateProducerUserDto,
  ): Promise<AdminProducerUser> {
    return this.admin.createProducerUser(producerId, dto);
  }

  @Patch('events/:eventId/producer')
  @ApiOperation({ summary: 'Reassign an event to an organization' })
  @ApiResponse({ status: 200, type: ReassignEventResult })
  reassignEvent(
    @Param('eventId') eventId: string,
    @Body() dto: ReassignEventDto,
  ): Promise<ReassignEventResult> {
    return this.admin.reassignEvent(eventId, dto);
  }

  @Patch('events/:id/archive')
  @ApiOperation({ summary: 'Desativa um evento (some do site, painel mantém)' })
  @ApiResponse({ status: 200, type: AdminEventActionResult })
  archiveEvent(@Param('id') id: string): Promise<AdminEventActionResult> {
    return this.admin.archiveEvent(id);
  }

  @Patch('events/:id/unarchive')
  @ApiOperation({ summary: 'Reativa um evento arquivado' })
  @ApiResponse({ status: 200, type: AdminEventActionResult })
  unarchiveEvent(@Param('id') id: string): Promise<AdminEventActionResult> {
    return this.admin.unarchiveEvent(id);
  }

  @Patch('events/:id/feature')
  @ApiOperation({ summary: 'Destaca/remove destaque do evento na home' })
  @ApiResponse({ status: 200, type: AdminEventActionResult })
  featureEvent(
    @Param('id') id: string,
    @Body() dto: FeatureEventDto,
  ): Promise<AdminEventActionResult> {
    return this.admin.featureEvent(id, dto.featured);
  }
}
