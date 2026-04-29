import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { Category } from '../../common/enums/category.enum';
import { PaymentProvider } from '../../common/enums/payment-provider.enum';
import { PixKeyType } from '../../common/enums/pix-key-type.enum';

export class UpdateEventDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 200)
  artist?: string;

  @ApiPropertyOptional({ enum: Category })
  @IsOptional()
  @IsEnum(Category)
  category?: Category;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  doorsAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(21)
  ageRating?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 500)
  posterUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 5000)
  description?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  venueId?: string;

  @ApiPropertyOptional({ enum: PaymentProvider })
  @IsOptional()
  @IsEnum(PaymentProvider)
  paymentProvider?: PaymentProvider;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 255)
  pixKey?: string;

  @ApiPropertyOptional({ enum: PixKeyType })
  @IsOptional()
  @IsEnum(PixKeyType)
  pixKeyType?: PixKeyType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(1, 160)
  pixHolderName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(0.5)
  platformFeeRate?: number;
}
