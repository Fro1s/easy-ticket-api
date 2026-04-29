import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EventsService } from './events.service';
import { ListEventsQuery } from './dto/list-events.query';
import {
  AvailabilityResponse,
  EventDetail,
  EventListResponse,
} from './dto/event.response';

@ApiTags('events')
@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Get()
  @ApiOperation({ summary: 'List published events (paginated)' })
  @ApiResponse({ status: 200, type: EventListResponse })
  list(@Query() query: ListEventsQuery): Promise<EventListResponse> {
    return this.events.list(query);
  }

  @Get(':slug')
  @ApiOperation({ summary: 'Get a single published event by slug' })
  @ApiResponse({ status: 200, type: EventDetail })
  findBySlug(@Param('slug') slug: string): Promise<EventDetail> {
    return this.events.findBySlug(slug);
  }

  @Get(':slug/availability')
  @ApiOperation({ summary: 'Live sector counts for a published event' })
  @ApiResponse({ status: 200, type: AvailabilityResponse })
  availability(@Param('slug') slug: string): Promise<AvailabilityResponse> {
    return this.events.availability(slug);
  }
}
