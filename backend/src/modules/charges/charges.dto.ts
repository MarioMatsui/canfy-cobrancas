import { IsString, IsNumber, IsOptional, IsEnum, IsDateString, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum BillingType {
  BOLETO = 'BOLETO',
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
}

export class CreateChargeDto {
  @ApiProperty({ description: 'ID da subconta (local)' })
  @IsString()
  subaccountId!: string;

  @ApiProperty({ description: 'ID do tipo de serviço (define o % de split)' })
  @IsString()
  serviceTypeId!: string;

  @ApiProperty({ enum: BillingType })
  @IsEnum(BillingType)
  billingType!: BillingType;

  @ApiProperty({ example: 100.0 })
  @IsNumber()
  @Min(0.01)
  value!: number;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString()
  dueDate!: string;

  @ApiPropertyOptional({ example: 'Mensalidade Abril/2026' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 2.0, description: 'Multa em %' })
  @IsNumber()
  @IsOptional()
  fine?: number;

  @ApiPropertyOptional({ example: 1.0, description: 'Juros mensal em %' })
  @IsNumber()
  @IsOptional()
  interest?: number;

  @ApiPropertyOptional({ example: 5.0, description: 'Desconto em R$' })
  @IsNumber()
  @IsOptional()
  discount?: number;

  @ApiPropertyOptional({ example: 3, description: 'Dias antes do vencimento para desconto' })
  @IsNumber()
  @IsOptional()
  discountDueDateLimitDays?: number;
}

export class ListChargesDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  subaccountId?: string;

  @ApiPropertyOptional({ enum: BillingType })
  @IsOptional()
  @IsEnum(BillingType)
  billingType?: BillingType;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
