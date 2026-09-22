import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { PublicPaymentMethod } from './public-charge.response.dto';

export class StartPublicPaymentDto {
  @ApiProperty({ enum: ['PIX', 'CARD'], example: 'PIX' })
  @IsIn(['PIX', 'CARD'])
  method!: PublicPaymentMethod;
}
