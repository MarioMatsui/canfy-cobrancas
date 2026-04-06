import { IsString, IsNumber, IsOptional, IsEnum, IsBoolean, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';

export enum SplitType {
  PERCENTAGE = 'PERCENTAGE',
  FIXED = 'FIXED',
}

export class CreateSplitRuleDto {
  @ApiProperty({ description: 'ID da subconta de cobrança (pagador)' })
  @IsString()
  chargeSubaccountId!: string;

  @ApiProperty({ description: 'ID da subconta recebedora do split' })
  @IsString()
  receiverSubaccountId!: string;

  @ApiProperty({ enum: SplitType })
  @IsEnum(SplitType)
  type!: SplitType;

  @ApiProperty({ example: 10.0, description: 'Valor em % ou R$' })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  value!: number;

  @ApiPropertyOptional({ example: 'Comissão parceiro' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class ListSplitRulesDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  chargeSubaccountId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  active?: boolean;
}
