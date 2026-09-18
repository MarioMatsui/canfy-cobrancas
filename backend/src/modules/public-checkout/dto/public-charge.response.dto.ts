import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class PublicChargeItemDto {
  @ApiProperty({ example: 'Óleo CBDMD 5000mg' })
  name!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 500 })
  unitPrice!: number;

  @ApiProperty({ example: 500 })
  lineTotal!: number;
}

export class PublicChargeDeliveryDto {
  @ApiPropertyOptional({ example: 3 })
  minDays?: number;

  @ApiPropertyOptional({ example: 6 })
  maxDays?: number;
}

/**
 * Tudo que o pagar.canfy pode ver.
 *
 * O que NUNCA entra aqui:
 *   cpfCnpj, asaasId, customerAsaasId, walletId, apiKey,
 *   splits, margem da CanFy, netValue, o id interno da cobranca.
 *
 * Se algum campo novo precisar aparecer no checkout, ele tem que ser
 * adicionado aqui E no `select` do service. O service usa `select`
 * explicito justamente para que esquecer isso resulte em campo
 * faltando, nunca em vazamento.
 */
export class PublicChargeResponseDto {
  @ApiProperty({ example: '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248' })
  token!: string;

  @ApiProperty({ example: 'PENDING_PAYMENT' })
  status!: string;

  @ApiProperty({ example: 'Mario' })
  customerName!: string;

  @ApiPropertyOptional({ example: 'Consulta médica' })
  description?: string;

  @ApiProperty({ type: [PublicChargeItemDto] })
  items!: PublicChargeItemDto[];

  @ApiProperty({ example: 500 })
  subtotal!: number;

  @ApiProperty({ example: 50 })
  discount!: number;

  @ApiProperty({ example: 50 })
  shipping!: number;

  @ApiProperty({ example: 500 })
  total!: number;

  @ApiProperty({ example: 6 })
  maxInstallments!: number;

  @ApiPropertyOptional({ type: PublicChargeDeliveryDto })
  delivery?: PublicChargeDeliveryDto;

  @ApiPropertyOptional({ example: '2026-09-25T00:00:00.000Z' })
  expiresAt?: string;
}