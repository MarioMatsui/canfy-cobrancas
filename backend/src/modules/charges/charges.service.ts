import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
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
    const splits = dto.splits || [];
    // Valida que as porcentagens de split não excedem 100%
    const totalSplitPercent = splits.reduce((sum, s) => sum + s.percentage, 0);
    if (totalSplitPercent >= 100) {
      throw new BadRequestException(
        `Total de splits (${totalSplitPercent}%) deve ser menor que 100%. O restante vai para a conta principal.`,
      );
    }

    // Valida que todas as subcontas existem e têm walletId
    const subaccountIds = splits.map((s) => s.subaccountId);
    let subaccounts: { id: string; name: string; walletId: string | null }[] = [];
    if (subaccountIds.length > 0) {
      subaccounts = await this.prisma.subaccount.findMany({
        where: { id: { in: subaccountIds }, active: true },
      });

      if (subaccounts.length !== subaccountIds.length) {
        throw new BadRequestException('Uma ou mais subcontas não encontradas ou inativas');
      }

      const missingWallet = subaccounts.find((s) => !s.walletId);
      if (missingWallet) {
        throw new BadRequestException(`Subconta "${missingWallet.name}" não possui walletId do Asaas`);
      }
    }

    // Monta payload para o Asaas
    const asaasSplits = subaccounts.map((sub) => {
      const splitDto = splits.find((s) => s.subaccountId === sub.id)!;
      return {
        walletId: sub.walletId,
        percentualValue: splitDto.percentage,
      };
    });

    let charge;

    // Cobrança avulsa/personalizada
    if (!dto.dueDate) {
      throw new BadRequestException('Data de vencimento é obrigatória para cobranças avulsas');
    }

    // Busca ou cria customer no Asaas
    const customerId = await this.findOrCreateCustomer(dto);

    const asaasPayload: Record<string, unknown> = {
      customer: customerId,
      billingType: dto.billingType,
      value: dto.value,
      dueDate: dto.dueDate,
      description: dto.description,
      notificationDisabled: true,
      ...(asaasSplits.length > 0 && { split: asaasSplits }),
    };

    if (dto.maxInstallments && dto.maxInstallments > 1) {
      asaasPayload.installmentCount = dto.maxInstallments;
      asaasPayload.installmentValue = +(dto.value / dto.maxInstallments).toFixed(2);
    }

    const asaasCharge = await this.asaas.post<AsaasCharge>('/payments', asaasPayload);

    // Buscar PIX QR Code se billing type for PIX
    if (dto.billingType === 'PIX' && asaasCharge.id) {
      try {
        const pixData = await this.asaas.get<{ encodedImage: string; payload: string }>(
          `/payments/${asaasCharge.id}/pixQrCode`,
        );
        asaasCharge.pixQrCode = pixData.encodedImage;
        asaasCharge.pixCopiaECola = pixData.payload;
      } catch (e) {
        this.logger.warn(`Não foi possível buscar PIX QR Code para ${asaasCharge.id}`);
      }
    }

    charge = await this.prisma.charge.create({
      data: {
        asaasId: asaasCharge.id,
        chargeType: 'CUSTOM',
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        customerCpfCnpj: dto.customerCpfCnpj,
        customerAsaasId: customerId,
        billingType: dto.billingType,
        value: dto.value,
        dueDate: new Date(dto.dueDate),
        description: dto.description,
        status: asaasCharge.status,
        maxInstallments: dto.maxInstallments || 1,
        invoiceUrl: asaasCharge.invoiceUrl,
        bankSlipUrl: asaasCharge.bankSlipUrl,
        pixQrCode: asaasCharge.pixQrCode,
        pixCopiaECola: asaasCharge.pixCopiaECola,
        splits: {
          create: splits.map((s) => ({
            subaccountId: s.subaccountId,
            percentage: s.percentage,
          })),
        },
      },
      include: { splits: { include: { subaccount: { select: { name: true, type: true } } } } },
    });

    const mainAccountPercent = 100 - totalSplitPercent;
    this.logger.log(
      `Cobrança criada: ${charge.id} | R$${dto.value} | Splits: ${splits.length} dest. + ${mainAccountPercent}% conta principal`,
    );

    return { ...charge, mainAccountPercentage: mainAccountPercent };
  }

  async findAll(query: ListChargesDto) {
    const { page = 1, limit = 20, status, chargeType, billingType, dateFrom, dateTo, search } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (chargeType) where.chargeType = chargeType;
    if (billingType) where.billingType = billingType;
    if (search) {
      where.customerName = { contains: search, mode: 'insensitive' };
    }
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
          splits: {
            include: { subaccount: { select: { name: true, type: true } } },
          },
        },
      }),
      this.prisma.charge.count({ where }),
    ]);

    // Calcula % da conta principal para cada cobrança
    const dataWithMain = data.map((charge) => {
      const totalSplit = charge.splits.reduce((sum, s) => sum + Number(s.percentage), 0);
      return { ...charge, mainAccountPercentage: 100 - totalSplit };
    });

    return { data: dataWithMain, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id },
      include: {
        splits: {
          include: { subaccount: { select: { id: true, name: true, type: true, walletId: true } } },
        },
        splitResults: {
          include: { receiverSubaccount: { select: { name: true, type: true } } },
        },
      },
    });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');

    const totalSplit = charge.splits.reduce((sum, s) => sum + Number(s.percentage), 0);
    return { ...charge, mainAccountPercentage: 100 - totalSplit };
  }

  async cancel(id: string) {
    const charge = await this.findOne(id);
    if (charge.asaasId) {
      await this.asaas.delete(`/payments/${charge.asaasId}`);
    }
    return this.prisma.charge.update({
      where: { id },
      data: { status: 'CANCELLED', isActive: false },
    });
  }

  async toggleActive(id: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    if (charge.chargeType !== 'REUSABLE') {
      throw new BadRequestException('Apenas cobranças reutilizáveis podem ser ativadas/desativadas');
    }
    return this.prisma.charge.update({
      where: { id },
      data: { isActive: !charge.isActive },
    });
  }

  async getReusableCharges() {
    const charges = await this.prisma.charge.findMany({
      where: { chargeType: 'REUSABLE' },
      include: {
        splits: {
          include: { subaccount: { select: { name: true, type: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return charges.map((charge) => {
      const totalSplit = charge.splits.reduce((sum, s) => sum + Number(s.percentage), 0);
      return { ...charge, mainAccountPercentage: 100 - totalSplit };
    });
  }

  private async findOrCreateCustomer(dto: CreateChargeDto): Promise<string> {
    // Tenta buscar cliente existente por CPF/CNPJ
    if (dto.customerCpfCnpj) {
      const existing = await this.asaas.get<{ data: Array<{ id: string }> }>(
        `/customers?cpfCnpj=${dto.customerCpfCnpj}`,
      );
      if (existing.data.length > 0) {
        return existing.data[0].id;
      }
    }

    // Cria novo customer no Asaas
    const customer = await this.asaas.post<{ id: string }>('/customers', {
      name: dto.customerName,
      email: dto.customerEmail,
      cpfCnpj: dto.customerCpfCnpj,
      notificationDisabled: true,
    });

    this.logger.log(`Customer criado no Asaas: ${customer.id} (${dto.customerName})`);
    return customer.id;
  }
}
