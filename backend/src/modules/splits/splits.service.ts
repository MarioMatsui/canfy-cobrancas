import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class SplitsService {
  constructor(private readonly prisma: PrismaService) {}

  async getSplitsByCharge(chargeId: string) {
    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: {
        splits: {
          include: { subaccount: { select: { id: true, name: true, type: true } } },
          orderBy: { createdAt: 'asc' },
        },
        splitResults: {
          include: { receiver: { select: { id: true, name: true, type: true } } },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');

    const chargeValue = new Prisma.Decimal(charge.totalAmount ?? charge.value).toDecimalPlaces(2);
    const hasAuditableSplits = charge.splits.some((split) => split.calculatedValue !== null);

    let splitValues: Array<{ id: string; calculatedValue: Prisma.Decimal }>;
    if (hasAuditableSplits || charge.orderKind) {
      splitValues = charge.splits.map((split) => ({
        id: split.id,
        calculatedValue: new Prisma.Decimal(split.calculatedValue ?? 0).toDecimalPlaces(2),
      }));
    } else {
      // Regra histórica: valores fixos saíam primeiro e percentuais incidiam no restante.
      const totalFixed = charge.splits.reduce(
        (sum, split) => sum.plus(split.fixedValue ?? 0),
        new Prisma.Decimal(0),
      );
      const remaining = chargeValue.minus(totalFixed);
      splitValues = charge.splits.map((split) => ({
        id: split.id,
        calculatedValue: split.fixedValue
          ? new Prisma.Decimal(split.fixedValue).toDecimalPlaces(2)
          : remaining.mul(split.percentage ?? 0).div(100).toDecimalPlaces(2),
      }));
    }

    const valueBySplitId = new Map(splitValues.map((entry) => [entry.id, entry.calculatedValue]));
    const distributed = splitValues.reduce(
      (sum, entry) => sum.plus(entry.calculatedValue),
      new Prisma.Decimal(0),
    );
    const mainAccountValue = chargeValue.minus(distributed).toDecimalPlaces(2);
    const mainAccountPercent = chargeValue.gt(0)
      ? mainAccountValue.div(chargeValue).mul(100).toDecimalPlaces(2)
      : new Prisma.Decimal(0);

    return {
      chargeId: charge.id,
      chargeValue,
      orderKind: charge.orderKind,
      splits: charge.splits.map((split) => ({
        subaccountId: split.subaccountId,
        subaccountName: split.subaccount.name,
        subaccountType: split.subaccount.type,
        recipientType: split.recipientType,
        calculationType: split.calculationType,
        chargeItemId: split.chargeItemId,
        percentage: split.percentage,
        fixedValue: split.fixedValue,
        basisAmount: split.basisAmount,
        calculatedValue: valueBySplitId.get(split.id) ?? new Prisma.Decimal(0),
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
    if (subaccountId) where.receiverSubaccountId = subaccountId;

    return this.prisma.splitResult.findMany({
      where,
      include: {
        charge: {
          select: {
            asaasId: true,
            value: true,
            totalAmount: true,
            status: true,
            orderStatus: true,
            customerName: true,
            description: true,
          },
        },
        receiver: { select: { name: true, type: true } },
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
        .filter((result) => result.status === 'COMPLETED')
        .reduce((sum, result) => sum + Number(result.value), 0),
      totalPending: sub.splitResults
        .filter((result) => result.status === 'PENDING')
        .reduce((sum, result) => sum + Number(result.value), 0),
    }));
  }
}
