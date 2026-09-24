import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';
import { FulfillmentType } from '@prisma/client';

export enum SubaccountTypeDto {
  DOCTOR = 'DOCTOR',
  SUPPLIER = 'SUPPLIER',
  OTHER = 'OTHER',
}

// Valores aceitos pela Asaas para pessoa jurídica (reference/criar-subconta)
export enum CompanyTypeDto {
  MEI = 'MEI',
  LIMITED = 'LIMITED',
  INDIVIDUAL = 'INDIVIDUAL',
  ASSOCIATION = 'ASSOCIATION',
}

export class CreateSubaccountDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  cpfCnpj!: string;

  @ApiProperty({ enum: SubaccountTypeDto, default: 'OTHER', description: 'Tipo: DOCTOR, SUPPLIER ou OTHER' })
  @IsEnum(SubaccountTypeDto)
  type!: SubaccountTypeDto;

  @ApiPropertyOptional({
    enum: FulfillmentType,
    description: 'Metadado interno Canfy. Obrigatório quando type=SUPPLIER; não é enviado ao Asaas.',
  })
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType;

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiProperty({ example: '11999999999', description: 'Obrigatório pela Asaas para criação de subconta' })
  @IsString()
  mobilePhone!: string;

  @ApiPropertyOptional({ enum: CompanyTypeDto, description: 'Tipo societário — somente para pessoa jurídica (CNPJ)' })
  @IsEnum(CompanyTypeDto)
  @IsOptional()
  companyType?: CompanyTypeDto;

  @ApiProperty({ example: '01001000', description: 'CEP, somente dígitos' })
  @IsString()
  postalCode!: string;

  @ApiProperty({ example: 'Praça da Sé' })
  @IsString()
  address!: string;

  @ApiProperty({ example: '1' })
  @IsString()
  addressNumber!: string;

  @ApiPropertyOptional({ example: 'Apto 12' })
  @IsString()
  @IsOptional()
  complement?: string;

  @ApiProperty({ example: 'Sé', description: 'Bairro' })
  @IsString()
  province!: string;

  @ApiPropertyOptional({ example: '1985-06-15', description: 'Data de nascimento — aplicável somente a pessoa física (CPF)' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiProperty({ example: 5000, description: 'Renda/faturamento mensal — obrigatório pela Asaas' })
  @Type(() => Number)
  @IsNumber()
  incomeValue!: number;
}

export class UpdateSubaccountDto {
  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  mobilePhone?: string;
}

export class UpdateSubaccountMetadataDto {
  @ApiPropertyOptional({
    enum: SubaccountTypeDto,
    description: 'Classificação interna Canfy. Não altera dados cadastrais no Asaas.',
  })
  @IsOptional()
  @IsEnum(SubaccountTypeDto)
  type?: SubaccountTypeDto;

  @ApiPropertyOptional({
    enum: FulfillmentType,
    nullable: true,
    description:
      'Modalidade interna do fornecedor. Obrigatória para SUPPLIER e deve ser nula para DOCTOR/OTHER.',
  })
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType | null;
}

export class ListSubaccountsDto {
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
  search?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ enum: SubaccountTypeDto })
  @IsOptional()
  @IsEnum(SubaccountTypeDto)
  type?: SubaccountTypeDto;
}

export class LinkExistingSubaccountDto {
  @ApiProperty({ example: '4bfce8c3-ebfb-4a6c-955d-bc585ab4ef82', description: 'Wallet ID ou Account ID da conta Asaas existente' })
  @IsString()
  walletId!: string;

  @ApiPropertyOptional({ description: 'Nome da conta (obrigatório se conta externa)' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ description: 'CPF/CNPJ da conta (obrigatório se conta externa)' })
  @IsOptional()
  @IsString()
  cpfCnpj?: string;

  @ApiPropertyOptional({ description: 'Email da conta' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({
    enum: FulfillmentType,
    description: 'Metadado interno Canfy. Obrigatório quando type=SUPPLIER; não é enviado ao Asaas.',
  })
  @IsOptional()
  @IsEnum(FulfillmentType)
  fulfillmentType?: FulfillmentType;

  @ApiPropertyOptional({ enum: SubaccountTypeDto, default: 'OTHER', description: 'Tipo: DOCTOR, SUPPLIER ou OTHER' })
  @IsOptional()
  @IsEnum(SubaccountTypeDto)
  type?: SubaccountTypeDto;
}
