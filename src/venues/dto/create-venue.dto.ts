import { ApiProperty } from '@nestjs/swagger';
import {
  IsInt,
  IsNotEmpty,
  IsString,
  Length,
  Min,
} from 'class-validator';

export class CreateVenueDto {
  @ApiProperty({ description: 'Nome do local' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 160)
  name: string;

  @ApiProperty({ description: 'Cidade' })
  @IsString()
  @IsNotEmpty()
  @Length(2, 120)
  city: string;

  @ApiProperty({ description: 'UF (2 letras)' })
  @IsString()
  @Length(2, 2)
  state: string;

  @ApiProperty({ description: 'Capacidade total' })
  @IsInt()
  @Min(1)
  capacity: number;
}
