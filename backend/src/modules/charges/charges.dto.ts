import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export enum OrderKindDto {
  PRODUCT = 'PRODUCT',
  CONSULTATION = 'CONSULTATION',
}

export enum DiscountTypeDto {
  NONE = 'NONE',
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum FulfillmentTypeDto {
  NATIONAL = 'NATIONAL',
  INTERNATIONAL = 'INTERNATIONAL',
}

export enum ProductTypeDto {
  OIL = 'OIL',
  GUMMY = 'GUMMY',
  CAPSULE = 'CAPSULE',
  CREAM = 'CREAM',
  NASAL_SPRAY = 'NASAL_SPRAY',
}

export enum SplitCalculationTypeDto {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export enum OrderStatusDto {
  DRAFT = 'DRAFT',
  READY = 'READY',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  EXPIRED = 'EXPIRED',
  CANCELLED = 'CANCELLED',
  REFUNDED = 'REFUNDED',
}

export class CreateChargeItemDto {
  @ApiPropertyOptional({ description: 'Produto do catálogo. Vazio = item avulso.' })
  @IsUUID('4')
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({ example: 'Óleo CBD 3000mg', description: 'Obrigatório para item avulso.' })
  @IsString()
  @IsOptional()
  productName?: string;

  @ApiPropertyOptional({
    enum: ProductTypeDto,
    description: 'Tipo comercial do produto. Obrigatório em novas cobranças de produto e ausente em consultas.',
  })
  @IsEnum(ProductTypeDto)
  @IsOptional()
  productType?: ProductTypeDto;

  @ApiProperty({ example: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @ApiPropertyOptional({ example: 250, description: 'Preço usado nesta venda. Para produto do catálogo, vazio usa o preço padrão.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({ description: 'Fornecedor. Obrigatório em item avulso de pedido de produto.' })
  @IsUUID('4')
  @IsOptional()
  supplierSubaccountId?: string;

  @ApiPropertyOptional({ enum: FulfillmentTypeDto, description: 'Obrigatório em item avulso de pedido de produto.' })
  @IsEnum(FulfillmentTypeDto)
  @IsOptional()
  fulfillmentType?: FulfillmentTypeDto;
}

export class ChargeSplitRuleDto {
  @ApiProperty({ description: 'Subconta que receberá o repasse nesta cobrança.' })
  @IsUUID('4')
  subaccountId!: string;

  @ApiProperty({ enum: SplitCalculationTypeDto, description: 'Se o repasse desta cobrança é percentual ou valor fixo.' })
  @IsEnum(SplitCalculationTypeDto)
  calculationType!: SplitCalculationTypeDto;

  @ApiProperty({ example: 70, description: 'Percentual (0-100) ou valor fixo em R$, conforme calculationType.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  value!: number;
}

export class CreateChargeDto {
  @ApiProperty({ enum: OrderKindDto })
  @IsEnum(OrderKindDto)
  orderKind!: OrderKindDto;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  customerName!: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  customerCpfCnpj!: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsString()
  @IsOptional()
  customerPhone?: string;

  @ApiProperty({ type: [CreateChargeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateChargeItemDto)
  items!: CreateChargeItemDto[];

  @ApiPropertyOptional({
    type: [ChargeSplitRuleDto],
    description:
      'Repasses específicos desta cobrança. Se um destinatário esperado for omitido, usa-se apenas o percentual padrão como valor inicial/fallback.',
  })
  @IsArray()
  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => ChargeSplitRuleDto)
  splits?: ChargeSplitRuleDto[];

  @ApiPropertyOptional({ enum: DiscountTypeDto, default: DiscountTypeDto.NONE })
  @IsEnum(DiscountTypeDto)
  @IsOptional()
  discountType?: DiscountTypeDto;

  @ApiPropertyOptional({ example: 10, description: 'Percentual ou valor em R$, conforme discountType.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional({ example: 35, description: 'Frete nacional digitado manualmente.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  nationalShippingAmount?: number;

  @ApiPropertyOptional({ example: 150, description: 'Frete internacional. Vazio usa international_shipping_default.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  internationalShippingAmount?: number;

  @ApiPropertyOptional({
    description: 'Médico opcional associado ao pedido. Se omitido, a cobrança não terá split médico.',
  })
  @IsUUID('4')
  @IsOptional()
  doctorSubaccountId?: string;

  @ApiPropertyOptional({ example: 4, description: 'Máximo de parcelas permitido no checkout (1-24).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  maxInstallments?: number;

  @ApiPropertyOptional({ example: '2026-09-28', description: 'Validade do link. Vazio usa charge_link_expiration_days.' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Pedido de medicamentos' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  notes?: string;
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

  @ApiPropertyOptional({ enum: OrderStatusDto })
  @IsOptional()
  @IsEnum(OrderStatusDto)
  orderStatus?: OrderStatusDto;

  @ApiPropertyOptional({ description: 'Filtro legado de status do Asaas.' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: OrderKindDto })
  @IsOptional()
  @IsEnum(OrderKindDto)
  orderKind?: OrderKindDto;

  @ApiPropertyOptional({ description: 'Buscar por nome ou CPF/CNPJ do cliente.' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateFrom?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  dateTo?: string;
}
