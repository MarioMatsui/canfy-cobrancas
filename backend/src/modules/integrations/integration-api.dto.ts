import { Transform, Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FulfillmentType } from '@prisma/client';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';

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
    example: '399.90',
    description: 'Preço padrão em formato decimal string para preservar precisão monetária.',
  })
  defaultPrice!: string;

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
