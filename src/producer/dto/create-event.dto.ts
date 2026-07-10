import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { Category } from '../../common/enums/category.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PixKeyType } from '../../common/enums/pix-key-type.enum';
import { CreateBatchDto } from './create-batch.dto';

export class CreateEventSectorDto {
  @ApiProperty()
  @IsString()
  @Length(1, 80)
  name: string;

  @ApiProperty({ example: '#D1FF4D' })
  @IsString()
  @Matches(/^#[0-9A-Fa-f]{6,8}$/)
  colorHex: string;

  @ApiProperty()
  @IsInt()
  @Min(1)
  capacity: number;

  @ApiProperty()
  @IsInt()
  @Min(0)
  sortOrder: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  producerOnly?: boolean;

  @ApiProperty({ type: [CreateBatchDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => CreateBatchDto)
  batches: CreateBatchDto[];
}

export class CreateEventDto {
  @ApiProperty()
  @IsString()
  @Length(1, 200)
  title: string;

  @ApiProperty()
  @IsString()
  @Length(1, 200)
  artist: string;

  @ApiProperty({ enum: Category })
  @IsEnum(Category)
  category: Category;

  @ApiProperty()
  @IsDateString()
  startsAt: string;

  @ApiProperty()
  @IsDateString()
  doorsAt: string;

  @ApiProperty()
  @IsInt()
  @Min(0)
  @Max(21)
  ageRating: number;

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  posterUrl: string;

  @ApiProperty()
  @IsString()
  @MaxLength(5000)
  description: string;

  @ApiProperty()
  @IsString()
  @Length(1, 32)
  venueId: string;

  @ApiProperty({ enum: PaymentProvider, default: PaymentProvider.MANUAL_PIX })
  @IsEnum(PaymentProvider)
  paymentProvider: PaymentProvider;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: CreateEventDto) => o.paymentProvider === PaymentProvider.MANUAL_PIX,
  )
  @IsString()
  @Length(1, 255)
  pixKey?: string;

  @ApiPropertyOptional({ enum: PixKeyType })
  @ValidateIf(
    (o: CreateEventDto) => o.paymentProvider === PaymentProvider.MANUAL_PIX,
  )
  @IsEnum(PixKeyType)
  pixKeyType?: PixKeyType;

  @ApiPropertyOptional()
  @ValidateIf(
    (o: CreateEventDto) => o.paymentProvider === PaymentProvider.MANUAL_PIX,
  )
  @IsString()
  @Length(1, 160)
  pixHolderName?: string;

  @ApiPropertyOptional({
    example: 0.025,
    minimum: 0,
    maximum: 0.5,
    description:
      'Taxa da plataforma. Apenas ADMIN pode informar; para PRODUCER o valor é ignorado e o padrão do servidor é aplicado.',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(0.5)
  platformFeeRate?: number;

  @ApiPropertyOptional({
    description:
      'Produtor dono do evento. Apenas ADMIN pode informar; PRODUCER usa sempre o próprio vínculo.',
  })
  @IsOptional()
  @IsString()
  @Length(1, 32)
  producerId?: string;

  @ApiProperty({ type: [CreateEventSectorDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => CreateEventSectorDto)
  sectors: CreateEventSectorDto[];
}
