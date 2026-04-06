import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SplitsService {
  private readonly logger = new Logger(SplitsService.name);

  constructor(private prisma: PrismaService) {}

  async getSplitsByCharge(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        splits: {
          include: { subaccount: { select: { id: true, name: true, type: true } } },
        },
        splitResults: {
          include: { receiverSubaccount: { select: { id: true, name: true, type: true } } },
        },
      },
    });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');

    const totalSplitPercent = charge.splits.reduce((sum, s) => sum + Number(s.percentage), 0);
    const mainAccountPercent = 100 - totalSplitPercent;
    const mainAccountValue = (Number(charge.value) * mainAccountPercent) / 100;

    return {
      chargeId: charge.id,
      chargeValue: charge.value,
      splits: charge.splits.map((s) => ({
        subaccountId: s.subaccountId,
        subaccountName: s.subaccount.name,
        subaccountType: s.subaccount.type,
        percentage: s.percentage,
        calculatedValue: (Number(charge.value) * Number(s.percentage)) / 100,
      })),
      mainAccount: {
        percentage: mainAccountPercent,
        calculatedValue: mainAccountValue,
      },
      splitResults: charge.splitResults,
    };
  }

  async getSplitHistory(subaccountId?: string) {
    const where: Record<string, unknown> = {};
    if (subaccountId) {
      where.receiverSubaccountId = subaccountId;
    }

    return this.prisma.splitResult.findMany({
      where,
      include: {
        charge: { select: { asaasId: true, value: true, status: true, customerName: true, description: true } },
        receiverSubaccount: { select: { name: true, type: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getRevenueBySubaccount() {
    const subaccounts = await this.prisma.subaccount.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        type: true,
        splitResults: {
          select: { value: true, status: true },
        },
      },
    });

    return subaccounts.map((sub) => ({
      id: sub.id,
      name: sub.name,
      type: sub.type,
      totalReceived: sub.splitResults
        .filter((r) => r.status === 'COMPLETED')
        .reduce((sum, r) => sum + Number(r.value), 0),
      totalPending: sub.splitResults
        .filter((r) => r.status === 'PENDING')
        .reduce((sum, r) => sum + Number(r.value), 0),
    }));
  }
}
