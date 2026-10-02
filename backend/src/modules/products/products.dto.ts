import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
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
} from 'class-validator';

export enum ProductTypeDto {
  OIL = 'OIL',
  GUMMY = 'GUMMY',
  CAPSULE = 'CAPSULE',
  CREAM = 'CREAM',
  NASAL_SPRAY = 'NASAL_SPRAY',
}

export enum ProductFulfillmentTypeDto {
  NATIONAL = 'NATIONAL',
  INTERNATIONAL = 'INTERNATIONAL',
}

export enum ProductAdminStatusDto {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

const optionalTrimmed = ({ value }: { value: unknown }) => {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : undefined;
};

export class ListProductsDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 20, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({
    description: 'Quando true, retorna apenas produtos realmente utilizáveis em uma nova cobrança.',
  })
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  eligible?: boolean;

  @ApiPropertyOptional({ enum: ProductAdminStatusDto })
  @IsOptional()
  @IsEnum(ProductAdminStatusDto)
  status?: ProductAdminStatusDto;

  @ApiPropertyOptional({ enum: ProductTypeDto })
  @IsOptional()
  @IsEnum(ProductTypeDto)
  productType?: ProductTypeDto;

  @ApiPropertyOptional({
    enum: ProductFulfillmentTypeDto,
    description: 'Filtra pela modalidade atual do fornecedor, não pelo campo legado do Product.',
  })
  @IsOptional()
  @IsEnum(ProductFulfillmentTypeDto)
  fulfillmentType?: ProductFulfillmentTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  supplierSubaccountId?: string;
}

export class CreateProductDto {
  @ApiProperty({ example: 'Óleo CBD 3000mg' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiPropertyOptional({ example: 'CBD-3000' })
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(100)
  sku?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(optionalTrimmed)
  @IsString()
  @MaxLength(2000)
  description?: string;

  @ApiProperty({ enum: ProductTypeDto })
  @IsEnum(ProductTypeDto)
  productType!: ProductTypeDto;

  @ApiProperty({ example: 399.9 })
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  defaultPrice!: number;

  @ApiProperty()
  @IsUUID('4')
  supplierSubaccountId!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ example: 0.25 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.001)
  weightKg?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  heightCm?: number;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  widthCm?: number;

  @ApiPropertyOptional({ example: 15 })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  lengthCm?: number;
}

export class UpdateProductDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  })
  @IsString()
  @MaxLength(100)
  sku?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => {
    if (value === null) return null;
    if (typeof value !== 'string') return value;
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  })
  @IsString()
  @MaxLength(2000)
  description?: string | null;

  @ApiPropertyOptional({ enum: ProductTypeDto })
  @IsOptional()
  @IsEnum(ProductTypeDto)
  productType?: ProductTypeDto;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  defaultPrice?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  supplierSubaccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.001)
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  heightCm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  widthCm?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0.01)
  lengthCm?: number;
}
