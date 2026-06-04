import { ApiProperty } from '@nestjs/swagger';

export class ResendEmailResponse {
  @ApiProperty({ description: 'Number of emails dispatched' })
  sent: number;
}
