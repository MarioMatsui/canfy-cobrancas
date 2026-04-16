import { IsString, IsNumber, IsOptional, IsEnum, IsDateString, IsArray, ValidateNested, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum BillingType {
  BOLETO = 'BOLETO',
  PIX = 'PIX',
  CREDIT_CARD = 'CREDIT_CARD',
  DEBIT_CARD = 'DEBIT_CARD',
  UNDEFINED = 'UNDEFINED', // Para links de pagamento (aceita múltiplos)
}

export enum ChargeType {
  CUSTOM = 'CUSTOM',
  REUSABLE = 'REUSABLE',
}

export class SplitRecipientDto {
  @ApiProperty({ description: 'ID da subconta recebedora (médico ou fornecedor)' })
  @IsString()
  subaccountId!: string;

  @ApiProperty({ example: 70.0, description: 'Percentual do split (o restante vai para conta principal)' })
  @IsNumber()
  @Min(0.01)
  @Max(99.99)
  percentage!: number;
}

export class CreateChargeDto {
  @ApiProperty({ enum: ChargeType, default: 'CUSTOM' })
  @IsEnum(ChargeType)
  chargeType!: ChargeType;

  // Cliente (quem paga)
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  customerName!: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsString()
  @IsOptional()
  customerEmail?: string;

  @ApiPropertyOptional({ example: '12345678901' })
  @IsString()
  @IsOptional()
  customerCpfCnpj?: string;

  @ApiProperty({ enum: BillingType })
  @IsEnum(BillingType)
  billingType!: BillingType;

  @ApiProperty({ example: 300.0 })
  @IsNumber()
  @Min(0.01)
  value!: number;

  @ApiPropertyOptional({ example: '2026-04-20', description: 'Obrigatório para CUSTOM, opcional para REUSABLE' })
  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @ApiPropertyOptional({ example: 'Consulta médica' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 5, description: 'Máximo de parcelas (1-5 custom, 1-3 reusable)' })
  @IsNumber()
  @IsOptional()
  @Min(1)
  @Max(5)
  maxInstallments?: number;

  // Splits - array de destinatários (fornecedor, médico, etc.)
  // O restante automaticamente vai para a conta principal
  @ApiPropertyOptional({ type: [SplitRecipientDto], description: 'Destinatários do split. O restante vai para conta principal. Se vazio, 100% vai para conta principal.' })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => SplitRecipientDto)
  splits?: SplitRecipientDto[];
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

  @ApiPropertyOptional({ enum: ChargeType })
  @IsOptional()
  @IsEnum(ChargeType)
  chargeType?: ChargeType;

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

  @ApiPropertyOptional({ description: 'Buscar por nome do cliente' })
  @IsOptional()
  @IsString()
  search?: string;
}
