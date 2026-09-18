import { Injectable, Logger, NotFoundException, GoneException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicChargeResponseDto,
  PublicChargeItemDto,
} from './dto/public-charge.response.dto';

/**
 * Estados em que a cobranca NAO deve ser exibida no checkout publico.
 *
 * DRAFT fica de fora de proposito: enquanto o atendente esta montando,
 * preco e split ainda podem mudar. O link so vale a partir de READY.
 */
const NAO_EXIBIVEL = ['DRAFT', 'CANCELLED', 'EXPIRED', 'REFUNDED'];

@Injectable()
export class PublicCheckoutService {
  private readonly logger = new Logger(PublicCheckoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  async findByToken(token: string): Promise<PublicChargeResponseDto> {
    // `select` explicito, nunca `include`. Campo que nao esta listado
    // aqui nao sai do banco — nem por acidente, nem se alguem adicionar
    // uma coluna sensivel em charges depois.
    const charge = await this.prisma.charge.findUnique({
      where: { publicToken: token },
      select: {
        publicToken: true,
        orderStatus: true,
        customerName: true,
        description: true,
        subtotal: true,
        discountAmount: true,
        shippingAmount: true,
        totalAmount: true,
        maxInstallments: true,
        expiresAt: true,
        isActive: true,
        // legado: usado so como fallback de exibicao quando a cobranca
        // antiga nao tem charge_items
        value: true,
        items: {
          select: {
            productName: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
          },
          orderBy: { createdAt: 'asc' },
        },
        shipments: {
          select: {
            estimatedDaysMin: true,
            estimatedDaysMax: true,
          },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
      },
    });

    // Token inexistente e token invalido devolvem a mesma coisa.
    // Nao damos pistas para quem estiver varrendo tokens.
    if (!charge || !charge.isActive) {
      throw new NotFoundException('Cobrança não encontrada');
    }

    if (NAO_EXIBIVEL.includes(charge.orderStatus)) {
      throw new GoneException('Esta cobrança não está mais disponível');
    }

    if (charge.expiresAt && charge.expiresAt.getTime() < Date.now()) {
      throw new GoneException('Este link de pagamento expirou');
    }

    return this.toResponse(charge);
  }

  private toResponse(charge: any): PublicChargeResponseDto {
    const n = (v: Prisma.Decimal | null | undefined): number =>
      v ? Number(v.toString()) : 0;

    let items: PublicChargeItemDto[] = charge.items.map((i: any) => ({
      name: i.productName,
      quantity: i.quantity,
      unitPrice: n(i.unitPrice),
      lineTotal: n(i.lineTotal),
    }));

    // Cobrancas criadas antes da migration nao tem charge_items.
    // Em vez de mostrar um checkout vazio, monta uma linha unica a
    // partir da descricao e do total.
    if (items.length === 0) {
      items = [
        {
          name: charge.description?.trim() || 'Pagamento',
          quantity: 1,
          unitPrice: n(charge.totalAmount ?? charge.value),
          lineTotal: n(charge.totalAmount ?? charge.value),
        },
      ];
    }

    const shipment = charge.shipments?.[0];

    return {
      token: charge.publicToken,
      status: charge.orderStatus,
      customerName: charge.customerName,
      description: charge.description ?? undefined,
      items,
      subtotal: n(charge.subtotal),
      discount: n(charge.discountAmount),
      shipping: n(charge.shippingAmount),
      total: n(charge.totalAmount),
      maxInstallments: charge.maxInstallments,
      delivery:
        shipment?.estimatedDaysMin != null || shipment?.estimatedDaysMax != null
          ? {
              minDays: shipment.estimatedDaysMin ?? undefined,
              maxDays: shipment.estimatedDaysMax ?? undefined,
            }
          : undefined,
      expiresAt: charge.expiresAt?.toISOString(),
    };
  }
}
