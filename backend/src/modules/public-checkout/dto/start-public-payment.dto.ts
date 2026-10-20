import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { PublicPaymentMethod } from './public-charge.response.dto';

export class StartPublicPaymentDto {
  @ApiProperty({ enum: ['PIX', 'CARD'], example: 'PIX' })
  @IsIn(['PIX', 'CARD'])
  method!: PublicPaymentMethod;

  @ApiProperty({ required: false, minimum: 1, maximum: 12, example: 4 })
  @Type(() => Number)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(12)
  installments?: number;
}
