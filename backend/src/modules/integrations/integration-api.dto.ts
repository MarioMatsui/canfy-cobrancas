import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType, ProductPriceCurrency } from '@prisma/client';
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
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import {
  DiscountTypeDto,
  OrderKindDto,
  ProductTypeDto,
} from '../charges/charges.dto';

export class IntegrationListQueryDto {
  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ description: 'Busca textual no nome e, quando aplicável, SKU.' })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  search?: string;
}

export class IntegrationPaginationDto {
  @ApiProperty()
  page!: number;

  @ApiProperty()
  limit!: number;

  @ApiProperty()
  total!: number;

  @ApiProperty()
  totalPages!: number;
}

export class IntegrationProductSupplierDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ enum: FulfillmentType })
  fulfillmentType!: FulfillmentType;
}

export class IntegrationProductDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  sku!: string | null;

  @ApiProperty({ nullable: true })
  description!: string | null;

  @ApiProperty({
    type: String,
    example: '99.90',
    description: 'Preço-base na moeda de origem indicada por priceCurrency.',
  })
  defaultPrice!: string;

  @ApiProperty({ enum: ProductPriceCurrency })
  priceCurrency!: ProductPriceCurrency;

  @ApiProperty({
    type: String,
    example: '529.47',
    description: 'Preço efetivo em BRL. Para importados, usa a cotação USD/BRL atual.',
  })
  priceBrl!: string;

  @ApiProperty({ type: String, nullable: true, example: '5.3000' })
  exchangeRate!: string | null;

  @ApiProperty({ nullable: true })
  exchangeRateQuotedAt!: Date | null;

  @ApiProperty({ enum: ProductTypeDto })
  productType!: ProductTypeDto;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ type: IntegrationProductSupplierDto, nullable: true })
  supplier!: IntegrationProductSupplierDto | null;
}

export class IntegrationSupplierDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  active!: boolean;

  @ApiProperty({ enum: FulfillmentType })
  fulfillmentType!: FulfillmentType;
}

export class IntegrationDoctorDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  name!: string;

  @ApiProperty()
  active!: boolean;
}

export class IntegrationProductListResponseDto {
  @ApiProperty({ type: [IntegrationProductDto] })
  data!: IntegrationProductDto[];

  @ApiProperty({ type: IntegrationPaginationDto })
  pagination!: IntegrationPaginationDto;
}

export class IntegrationSupplierListResponseDto {
  @ApiProperty({ type: [IntegrationSupplierDto] })
  data!: IntegrationSupplierDto[];

  @ApiProperty({ type: IntegrationPaginationDto })
  pagination!: IntegrationPaginationDto;
}

export class IntegrationDoctorListResponseDto {
  @ApiProperty({ type: [IntegrationDoctorDto] })
  data!: IntegrationDoctorDto[];

  @ApiProperty({ type: IntegrationPaginationDto })
  pagination!: IntegrationPaginationDto;
}


export class IntegrationCreateChargeItemDto {
  @ApiPropertyOptional({
    description: 'Produto do catálogo. Para pedidos de produto, prefira IDs retornados por GET /integrations/v1/products.',
  })
  @IsUUID('4')
  @IsOptional()
  productId?: string;

  @ApiPropertyOptional({
    example: 'Consulta médica',
    description: 'Nome do item avulso. Necessário quando productId não é informado.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  @IsOptional()
  productName?: string;

  @ApiPropertyOptional({
    enum: ProductTypeDto,
    description: 'Tipo comercial do item avulso. Para productId, o catálogo é a fonte de verdade.',
  })
  @IsEnum(ProductTypeDto)
  @IsOptional()
  productType?: ProductTypeDto;

  @ApiProperty({ example: 1, minimum: 1, maximum: 999 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(999)
  quantity!: number;

  @ApiPropertyOptional({
    example: 399.9,
    description: 'Preço da venda quando o fluxo atual permitir override ou item avulso. Produto de catálogo usa defaultPrice quando omitido.',
  })
  @Type(() => Number)
  @IsNumber()
  @Min(0.01)
  @IsOptional()
  unitPrice?: number;

  @ApiPropertyOptional({
    description: 'Fornecedor do item avulso. Para productId, o catálogo é a fonte de verdade.',
  })
  @IsUUID('4')
  @IsOptional()
  supplierSubaccountId?: string;
}

export class IntegrationCreateChargeDto {
  @ApiProperty({ enum: OrderKindDto })
  @IsEnum(OrderKindDto)
  orderKind!: OrderKindDto;

  @ApiProperty({ example: 'João Silva' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  customerName!: string;

  @ApiPropertyOptional({ example: 'joao@email.com' })
  @IsEmail()
  @IsOptional()
  customerEmail?: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  @MinLength(11)
  @MaxLength(30)
  customerCpfCnpj!: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsString()
  @MaxLength(30)
  @IsOptional()
  customerPhone?: string;

  @ApiProperty({ type: [IntegrationCreateChargeItemDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => IntegrationCreateChargeItemDto)
  items!: IntegrationCreateChargeItemDto[];

  @ApiPropertyOptional({ enum: DiscountTypeDto, default: DiscountTypeDto.NONE })
  @IsEnum(DiscountTypeDto)
  @IsOptional()
  discountType?: DiscountTypeDto;

  @ApiPropertyOptional({ example: 10 })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  discountValue?: number;

  @ApiPropertyOptional({ example: 35, description: 'Frete nacional manual, conforme o fluxo atual do domínio.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  nationalShippingAmount?: number;

  @ApiPropertyOptional({ example: 150, description: 'Frete internacional. O domínio usa o default configurado quando omitido.' })
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  internationalShippingAmount?: number;

  @ApiPropertyOptional({ description: 'Médico elegível retornado pela API read-only.' })
  @IsUUID('4')
  @IsOptional()
  doctorSubaccountId?: string;

  @ApiPropertyOptional({ minimum: 1, maximum: 24, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(24)
  @IsOptional()
  maxInstallments?: number;

  @ApiPropertyOptional({ example: '2026-10-15' })
  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @ApiPropertyOptional({ example: 'Pedido criado por integração' })
  @IsString()
  @MaxLength(500)
  @IsOptional()
  description?: string;

  @ApiPropertyOptional()
  @IsString()
  @MaxLength(2000)
  @IsOptional()
  notes?: string;
}

export class IntegrationChargeCustomerDto {
  @ApiProperty({ nullable: true })
  id!: string | null;

  @ApiProperty()
  name!: string;

  @ApiProperty({ nullable: true })
  email!: string | null;

  @ApiProperty({ nullable: true })
  cpfCnpj!: string | null;
}

export class IntegrationChargeTotalsDto {
  @ApiProperty({ type: String, example: '399.90' })
  subtotal!: string;

  @ApiProperty({ type: String, example: '0.00' })
  discount!: string;

  @ApiProperty({ type: String, example: '35.00' })
  shipping!: string;

  @ApiProperty({ type: String, example: '434.90' })
  total!: string;
}

export class IntegrationChargeCreateResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty({ example: 'READY' })
  status!: string;

  @ApiProperty()
  publicToken!: string;

  @ApiProperty()
  checkoutUrl!: string;

  @ApiProperty({ type: IntegrationChargeCustomerDto })
  customer!: IntegrationChargeCustomerDto;

  @ApiProperty({ type: IntegrationChargeTotalsDto })
  totals!: IntegrationChargeTotalsDto;

  @ApiProperty()
  createdAt!: Date;
}
