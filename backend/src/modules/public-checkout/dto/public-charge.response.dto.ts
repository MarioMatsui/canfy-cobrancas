import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type PublicOrderKind = 'PRODUCT' | 'CONSULTATION';
export type PublicOrderStatus = 'READY' | 'PENDING_PAYMENT' | 'PAID';
export type PublicFulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PublicShipmentType = 'NATIONAL' | 'INTERNATIONAL';

export class PublicChargeItemDto {
  @ApiProperty({ example: 'Óleo CBDMD 5000mg' })
  name!: string;

  @ApiProperty({ example: 1 })
  quantity!: number;

  @ApiProperty({ example: 500 })
  unitPrice!: number;

  @ApiProperty({ example: 500 })
  lineTotal!: number;

  @ApiPropertyOptional({ enum: ['NATIONAL', 'INTERNATIONAL'], example: 'NATIONAL' })
  fulfillmentType?: PublicFulfillmentType;
}

export class PublicChargeShipmentDto {
  @ApiProperty({ enum: ['NATIONAL', 'INTERNATIONAL'], example: 'NATIONAL' })
  type!: PublicShipmentType;

  @ApiProperty({ example: 35 })
  shippingAmount!: number;

  @ApiPropertyOptional({ example: 3 })
  estimatedDaysMin?: number;

  @ApiPropertyOptional({ example: 6 })
  estimatedDaysMax?: number;
}

/**
 * Contrato publico consumido pelo pagar.canfy.
 *
 * O que NUNCA entra aqui:
 *   charge.id, cpfCnpj, asaasId, customerAsaasId, walletId, apiKey,
 *   subcontas, medico, fornecedor, splits, margem da CanFy, netValue.
 *
 * Campo novo de checkout precisa ser adicionado explicitamente aqui e no
 * `select` do service. Assim um campo sensivel adicionado ao banco no futuro
 * nao passa a ser exposto por acidente.
 */
export class PublicChargeResponseDto {
  @ApiProperty({ example: '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248' })
  publicToken!: string;

  @ApiProperty({ enum: ['READY', 'PENDING_PAYMENT', 'PAID'], example: 'READY' })
  orderStatus!: PublicOrderStatus;

  @ApiPropertyOptional({ enum: ['PRODUCT', 'CONSULTATION'], example: 'PRODUCT' })
  orderKind?: PublicOrderKind;

  @ApiProperty({ example: 'Mario' })
  customerName!: string;

  @ApiPropertyOptional({ example: 'Pedido de medicamentos' })
  description?: string;

  @ApiProperty({ type: [PublicChargeItemDto] })
  items!: PublicChargeItemDto[];

  @ApiProperty({ example: 500 })
  subtotal!: number;

  @ApiProperty({ example: 50 })
  discountAmount!: number;

  @ApiProperty({ example: 35 })
  shippingAmount!: number;

  @ApiProperty({ example: 485 })
  totalAmount!: number;

  @ApiProperty({ example: 6 })
  maxInstallments!: number;

  @ApiProperty({ type: [PublicChargeShipmentDto] })
  shipments!: PublicChargeShipmentDto[];

  @ApiPropertyOptional({ example: '2026-09-28T23:59:59.999Z' })
  expiresAt?: string;
}
