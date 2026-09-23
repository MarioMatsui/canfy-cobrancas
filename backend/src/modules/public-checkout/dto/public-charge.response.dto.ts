import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export type PublicOrderKind = 'PRODUCT' | 'CONSULTATION';
export type PublicOrderStatus = 'READY' | 'PENDING_PAYMENT' | 'PAID';
export type PublicFulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PublicProductType = 'OIL' | 'GUMMY' | 'CAPSULE' | 'CREAM' | 'NASAL_SPRAY';
export type PublicShipmentType = 'NATIONAL' | 'INTERNATIONAL';
export type PublicPaymentMethod = 'PIX' | 'CARD';
export type PublicPaymentStatus = 'PENDING' | 'CONFIRMED' | 'RECEIVED' | 'OVERDUE';

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

  @ApiPropertyOptional({
    enum: ['OIL', 'GUMMY', 'CAPSULE', 'CREAM', 'NASAL_SPRAY'],
    example: 'OIL',
  })
  productType?: PublicProductType;
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

export class PublicActivePaymentDto {
  @ApiProperty({ enum: ['PIX', 'CARD'], example: 'PIX' })
  method!: PublicPaymentMethod;

  @ApiProperty({ enum: ['PENDING', 'CONFIRMED', 'RECEIVED', 'OVERDUE'], example: 'PENDING' })
  status!: PublicPaymentStatus;

  @ApiProperty({ example: 485 })
  amount!: number;

  @ApiPropertyOptional({ example: 'https://www.asaas.com/i/...' })
  invoiceUrl?: string;

  @ApiPropertyOptional({ description: 'Imagem PNG do QR Code em Base64' })
  pixQrCode?: string;

  @ApiPropertyOptional({ description: 'Payload Pix Copia e Cola' })
  pixCopyPaste?: string;

  @ApiPropertyOptional({ example: '2026-09-22T03:15:00.000Z' })
  pixExpirationDate?: string;
}

/**
 * Contrato publico consumido pelo pagar.canfy.
 *
 * O que NUNCA entra aqui:
 *   charge.id, cpfCnpj, asaasId, providerPaymentId, customerAsaasId, walletId,
 *   apiKey, subcontas, medico, fornecedor, splits, margem da CanFy, netValue.
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

  @ApiProperty({ type: [PublicActivePaymentDto] })
  availablePayments!: PublicActivePaymentDto[];

  // Compatibilidade com clientes anteriores. O checkout novo seleciona
  // explicitamente a tentativa em availablePayments.
  @ApiPropertyOptional({ type: PublicActivePaymentDto })
  activePayment?: PublicActivePaymentDto;
}

export class PublicPaymentStartResponseDto {
  @ApiProperty({ enum: ['PENDING_PAYMENT', 'PAID'] })
  orderStatus!: 'PENDING_PAYMENT' | 'PAID';

  @ApiPropertyOptional({ type: PublicActivePaymentDto })
  activePayment?: PublicActivePaymentDto;
}
