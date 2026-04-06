import { IsString, IsEmail, IsOptional, IsBoolean, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type, Transform } from 'class-transformer';

export class CreateSubaccountDto {
  @ApiProperty({ example: 'João Silva' })
  @IsString()
  name!: string;

  @ApiProperty({ example: '12345678901' })
  @IsString()
  cpfCnpj!: string;

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
}
