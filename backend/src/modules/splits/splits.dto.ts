import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ListSplitsDto {
  @ApiPropertyOptional({ description: 'Filtrar por subconta recebedora' })
  @IsOptional()
  @IsString()
  subaccountId?: string;
}
