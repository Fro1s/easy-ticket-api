import { ApiProperty } from '@nestjs/swagger';
import { EventStatus } from '../../common/enums/event-status.enum';

export class AdminEventActionResult {
  @ApiProperty() id: string;
  @ApiProperty({ enum: EventStatus }) status: EventStatus;
  @ApiProperty({ nullable: true, type: String }) featuredAt: string | null;
}
