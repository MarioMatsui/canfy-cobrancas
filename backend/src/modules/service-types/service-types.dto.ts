import { IsString, IsNumber, IsOptional, Min, Max } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateServiceTypeDto {
  @ApiProperty({ example: 'Atendimento Médico' })
  @IsString()
  name!: string;

  @ApiPropertyOptional({ example: 'Consultas e atendimentos médicos' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 15.0, description: '% que vai para o prestador/fornecedor' })
  @IsNumber()
  @Min(0.01)
  @Max(100)
  splitPercentage!: number;
}

export class UpdateServiceTypeDto {
  @ApiPropertyOptional({ example: 'Atendimento Médico' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional()
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 20.0, description: '% que vai para o prestador/fornecedor' })
  @IsNumber()
  @IsOptional()
  @Min(0.01)
  @Max(100)
  splitPercentage?: number;
}
