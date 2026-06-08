import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';

export class FeatureEventDto {
  @ApiProperty({ description: 'true destaca na home, false remove o destaque' })
  @IsBoolean()
  featured: boolean;
}
