import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpsertSettingDto {
  @ApiProperty({ example: 'default_doctor_percentage', description: 'Chave da configuração' })
  @IsString()
  key!: string;

  @ApiProperty({ example: '15', description: 'Valor da configuração' })
  @IsString()
  value!: string;

  @ApiPropertyOptional({ example: 'Percentual padrão para médicos' })
  @IsString()
  @IsOptional()
  description?: string;
}
