import { ApiProperty } from '@nestjs/swagger';

export class VenueResponse {
  @ApiProperty() id: string;
  @ApiProperty() name: string;
  @ApiProperty() city: string;
  @ApiProperty() state: string;
  @ApiProperty() capacity: number;
}
