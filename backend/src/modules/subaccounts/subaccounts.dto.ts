import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

export enum SubaccountTypeDto {
  DOCTOR = 'DOCTOR',
  SUPPLIER = 'SUPPLIER',
  OTHER = 'OTHER',
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

  @ApiProperty({ example: 'joao@email.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ example: '11999999999' })
  @IsString()
  @IsOptional()
  mobilePhone?: string;

  @ApiPropertyOptional({ example: 'MEI' })
  @IsString()
  @IsOptional()
  companyType?: string;

  @ApiPropertyOptional({ example: '01001000' })
  @IsString()
  @IsOptional()
  postalCode?: string;

  @ApiPropertyOptional({ example: 'Praça da Sé' })
  @IsString()
  @IsOptional()
  address?: string;

  @ApiPropertyOptional({ example: '1' })
  @IsString()
  @IsOptional()
  addressNumber?: string;

  @ApiPropertyOptional({ example: 'Sé' })
  @IsString()
  @IsOptional()
  province?: string;

  @ApiPropertyOptional({ example: '1985-06-15', description: 'Data de nascimento (obrigatório para pessoa física)' })
  @IsString()
  @IsOptional()
  birthDate?: string;

  @ApiPropertyOptional({ example: 5000, description: 'Renda/faturamento mensal (obrigatório para abertura de conta)' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  incomeValue?: number;
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
