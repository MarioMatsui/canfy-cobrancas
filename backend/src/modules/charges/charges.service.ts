import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { CreateChargeDto, ListChargesDto } from './charges.dto';

interface AsaasCharge {
  id: string;
  status: string;
  invoiceUrl: string;
  bankSlipUrl?: string;
  pixQrCode?: string;
  pixCopiaECola?: string;
}

@Injectable()
export class ChargesService {
  private readonly logger = new Logger(ChargesService.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  async create(dto: CreateChargeDto) {
    const subaccount = await this.prisma.subaccount.findUnique({
      where: { id: dto.subaccountId },
    });
    if (!subaccount) throw new NotFoundException('Subconta não encontrada');

    // Busca o tipo de serviço para obter o % de split
    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id: dto.serviceTypeId },
    });
    if (!serviceType) throw new NotFoundException('Tipo de serviço não encontrado');

    // Busca regras de split ativas para este tipo de serviço + subconta
    const splitRules = await this.prisma.splitRule.findMany({
      where: { chargeSubaccountId: subaccount.id, serviceTypeId: serviceType.id, active: true },
      include: { receiverSubaccount: true },
    });

    // Monta payload para o Asaas
    const asaasPayload: Record<string, unknown> = {
      customer: subaccount.asaasId,
      billingType: dto.billingType,
      value: dto.value,
      dueDate: dto.dueDate,
      description: dto.description,
      fine: dto.fine ? { value: dto.fine } : undefined,
      interest: dto.interest ? { value: dto.interest } : undefined,
      discount: dto.discount ? { value: dto.discount, dueDateLimitDays: dto.discountDueDateLimitDays || 0 } : undefined,
    };

    // Adiciona splits se existirem regras
    if (splitRules.length > 0) {
      asaasPayload.split = splitRules.map((rule) => ({
        walletId: rule.receiverSubaccount.walletId,
        percentualValue: rule.type === 'PERCENTAGE' ? rule.value : undefined,
        fixedValue: rule.type === 'FIXED' ? rule.value : undefined,
      }));
    }

    const asaasCharge = await this.asaas.post<AsaasCharge>('/payments', asaasPayload);

    const charge = await this.prisma.charge.create({
      data: {
        asaasId: asaasCharge.id,
        subaccountId: subaccount.id,
        serviceTypeId: serviceType.id,
        billingType: dto.billingType,
        value: dto.value,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        status: asaasCharge.status,
        splitPercentage: serviceType.splitPercentage,
        invoiceUrl: asaasCharge.invoiceUrl,
        bankSlipUrl: asaasCharge.bankSlipUrl,
        pixQrCode: asaasCharge.pixQrCode,
        pixCopiaECola: asaasCharge.pixCopiaECola,
      },
    });

    this.logger.log(`Cobrança criada: ${charge.id} (Asaas: ${asaasCharge.id})`);
    return charge;
  }

  async findAll(query: ListChargesDto) {
    const { page = 1, limit = 20, status, subaccountId, billingType, dateFrom, dateTo } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (subaccountId) where.subaccountId = subaccountId;
    if (billingType) where.billingType = billingType;
    if (dateFrom || dateTo) {
      where.dueDate = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [data, total] = await Promise.all([
      this.prisma.charge.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          subaccount: { select: { name: true } },
          serviceType: { select: { name: true, splitPercentage: true } },
        },
      }),
      this.prisma.charge.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id },
      include: {
        subaccount: true,
        serviceType: true,
        splitResults: true,
      },
    });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    return charge;
  }

  async cancel(id: string) {
    const charge = await this.findOne(id);
    if (charge.asaasId) {
      await this.asaas.delete(`/payments/${charge.asaasId}`);
    }
    return this.prisma.charge.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async resend(id: string) {
    const charge = await this.findOne(id);
    if (charge.asaasId) {
      await this.asaas.post(`/payments/${charge.asaasId}/resendNotification`, {});
    }
    return { message: 'Notificação reenviada com sucesso' };
  }
}
