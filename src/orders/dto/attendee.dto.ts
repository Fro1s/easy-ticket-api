import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class AttendeeDto {
  @ApiProperty({ minLength: 2, maxLength: 120 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  @IsOptional()
  @IsEmail()
  email?: string | null;
}

export class OrderItemAttendeesDto {
  @ApiProperty()
  @IsString()
  orderItemId: string;

  @ApiProperty({ type: [AttendeeDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AttendeeDto)
  attendees: AttendeeDto[];
}

export class UpdateOrderAttendeesDto {
  @ApiProperty({ type: [OrderItemAttendeesDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemAttendeesDto)
  items: OrderItemAttendeesDto[];
}
