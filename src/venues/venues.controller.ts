import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
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
import { VenuesService } from './venues.service';
import { VenueResponse } from './dto/venue.response';
import { CreateVenueDto } from './dto/create-venue.dto';

@ApiTags('venues')
@Controller('venues')
export class VenuesController {
  constructor(private readonly venues: VenuesService) {}

  @Get()
  @ApiOperation({ summary: 'List all venues' })
  @ApiResponse({ status: 200, type: [VenueResponse] })
  list(): Promise<VenueResponse[]> {
    return this.venues.list();
  }

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.PRODUCER, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a new venue (producer/admin only)' })
  @ApiResponse({ status: 201, type: VenueResponse })
  create(@Body() dto: CreateVenueDto): Promise<VenueResponse> {
    return this.venues.create(dto);
  }
}
