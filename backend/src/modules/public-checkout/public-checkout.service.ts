import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicChargeItemDto,
  PublicChargeResponseDto,
  PublicChargeShipmentDto,
  PublicFulfillmentType,
  PublicOrderKind,
  PublicOrderStatus,
  PublicShipmentType,
} from './dto/public-charge.response.dto';

const PUBLIC_TOKEN_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Allowlist proposital: status novo no futuro nao fica publico automaticamente.
const EXIBIVEL = new Set<PublicOrderStatus>(['READY', 'PENDING_PAYMENT', 'PAID']);

@Injectable()
export class PublicCheckoutService {
  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string): Promise<PublicChargeResponseDto> {
    // Token malformado e token inexistente devolvem a mesma resposta publica.
    // Evita diferenciar casos durante tentativa de enumeracao de links.
    if (!PUBLIC_TOKEN_V4.test(token)) {
      throw new NotFoundException('Cobrança não encontrada');
    }

    // `select` explicito, nunca `include`: somente dados necessarios para a
    // tela publica saem do banco. Split, CPF, IDs internos e dados do Asaas
    // nao sao carregados por esta consulta.
    const charge = await this.prisma.charge.findUnique({
      where: { publicToken: token },
      select: {
        publicToken: true,
        orderStatus: true,
        orderKind: true,
        customerName: true,
        description: true,
        subtotal: true,
        discountAmount: true,
        shippingAmount: true,
        totalAmount: true,
        maxInstallments: true,
        expiresAt: true,
        isActive: true,
        // Legado: usado apenas no fallback de cobrancas antigas sem charge_items.
        value: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            fulfillmentType: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          select: {
            type: true,
            shippingAmount: true,
            estimatedDaysMin: true,
            estimatedDaysMax: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

    if (!charge || !charge.isActive) {
      throw new NotFoundException('Cobrança não encontrada');
    }

    if (!EXIBIVEL.has(charge.orderStatus as PublicOrderStatus)) {
      throw new GoneException('Esta cobrança não está mais disponível');
    }

    if (charge.expiresAt && charge.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este link de pagamento expirou');
    }

    return this.toResponse(charge);
  }

  private toResponse(charge: any): PublicChargeResponseDto {
    const n = (value: Prisma.Decimal | number | null | undefined): number =>
      value == null ? 0 : Number(value.toString());

    let items: PublicChargeItemDto[] = charge.items.map((item: any) => ({
      name: item.productName,
      quantity: item.quantity,
      unitPrice: n(item.unitPrice),
      lineTotal: n(item.lineTotal),
      ...(charge.orderKind === 'PRODUCT'
        ? { fulfillmentType: item.fulfillmentType as PublicFulfillmentType }
        : {}),
    }));

    // Cobrancas historicas nao possuem charge_items. Mantemos esses links
    // legados legiveis sem expor ou inventar classificacoes de produto.
    if (items.length === 0) {
      const legacyTotal = n(charge.totalAmount ?? charge.value);
      items = [
        {
          name: charge.description?.trim() || 'Pagamento',
          quantity: 1,
          unitPrice: legacyTotal,
          lineTotal: legacyTotal,
        },
      ];
    }

    const shipments: PublicChargeShipmentDto[] = charge.shipments.map((shipment: any) => ({
      type: shipment.type as PublicShipmentType,
      shippingAmount: n(shipment.shippingAmount),
      ...(shipment.estimatedDaysMin != null
        ? { estimatedDaysMin: shipment.estimatedDaysMin }
        : {}),
      ...(shipment.estimatedDaysMax != null
        ? { estimatedDaysMax: shipment.estimatedDaysMax }
        : {}),
    }));

    return {
      publicToken: charge.publicToken,
      orderStatus: charge.orderStatus as PublicOrderStatus,
      ...(charge.orderKind ? { orderKind: charge.orderKind as PublicOrderKind } : {}),
      customerName: charge.customerName,
      description: charge.description ?? undefined,
      items,
      subtotal: n(charge.subtotal),
      discountAmount: n(charge.discountAmount),
      shippingAmount: n(charge.shippingAmount),
      totalAmount: n(charge.totalAmount),
      maxInstallments: charge.maxInstallments,
      shipments,
      expiresAt: charge.expiresAt?.toISOString(),
    };
  }
}
