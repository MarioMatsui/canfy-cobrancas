import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const [
      totalCharges,
      customCharges,
      reusableCharges,
      paidCharges,
      pendingCharges,
      overdueCharges,
      totalSubaccounts,
      totalDoctors,
      totalSuppliers,
      totalSplitResults,
    ] = await Promise.all([
      this.prisma.charge.count(),
      this.prisma.charge.count({ where: { chargeType: 'CUSTOM' } }),
      this.prisma.charge.count({ where: { chargeType: 'REUSABLE' } }),
      this.prisma.charge.count({ where: { status: { in: ['CONFIRMED', 'RECEIVED'] } } }),
      this.prisma.charge.count({ where: { status: 'PENDING' } }),
      this.prisma.charge.count({ where: { status: 'OVERDUE' } }),
      this.prisma.subaccount.count({ where: { active: true } }),
      this.prisma.subaccount.count({ where: { type: 'DOCTOR', active: true } }),
      this.prisma.subaccount.count({ where: { type: 'SUPPLIER', active: true } }),
      this.prisma.splitResult.count(),
    ]);

    const totalValue = await this.prisma.charge.aggregate({ _sum: { value: true } });
    const paidValue = await this.prisma.charge.aggregate({
      where: { status: { in: ['CONFIRMED', 'RECEIVED'] } },
      _sum: { value: true },
    });

    // Receita distribuída para médicos
    const doctorRevenue = await this.prisma.splitResult.aggregate({
      where: {
        status: 'COMPLETED',
        receiverSubaccount: { type: 'DOCTOR' },
      },
      _sum: { value: true },
    });

    // Receita distribuída para fornecedores
    const supplierRevenue = await this.prisma.splitResult.aggregate({
      where: {
        status: 'COMPLETED',
        receiverSubaccount: { type: 'SUPPLIER' },
      },
      _sum: { value: true },
    });

    // Receita da conta principal = valor pago - splits reais (baseados em valor líquido)
    const totalSplitValue = await this.prisma.splitResult.aggregate({
      where: { status: 'COMPLETED' },
      _sum: { value: true },
    });
    const mainAccountRevenue = Number(paidValue._sum.value || 0) - Number(totalSplitValue._sum.value || 0);

    return {
      charges: {
        total: totalCharges,
        customCount: customCharges,
        reusableCount: reusableCharges,
        paid: paidCharges,
        pending: pendingCharges,
        overdue: overdueCharges,
        totalValue: totalValue._sum.value || 0,
        paidValue: paidValue._sum.value || 0,
      },
      subaccounts: {
        total: totalSubaccounts + totalDoctors + totalSuppliers,
        active: totalSubaccounts,
        doctorCount: totalDoctors,
        supplierCount: totalSuppliers,
      },
      revenue: {
        doctorRevenue: doctorRevenue._sum.value || 0,
        supplierRevenue: supplierRevenue._sum.value || 0,
        mainAccountRevenue,
      },
    };
  }

  async getRevenueBySubaccount(type?: string) {
    const where: Record<string, unknown> = { active: true };
    if (type) where.type = type;

    const subaccounts = await this.prisma.subaccount.findMany({
      where,
      select: {
        id: true,
        name: true,
        type: true,
        balance: true,
        createdAt: true,
        splitResults: {
          select: { value: true, status: true, createdAt: true },
        },
        _count: { select: { chargeSplits: true } },
      },
    });

    return subaccounts.map((sub) => ({
      id: sub.id,
      name: sub.name,
      type: sub.type,
      balance: sub.balance,
      createdAt: sub.createdAt,
      totalCharges: sub._count.chargeSplits,
      totalReceived: sub.splitResults
        .filter((r) => r.status === 'COMPLETED')
        .reduce((sum, r) => sum + Number(r.value), 0),
      totalPending: sub.splitResults
        .filter((r) => r.status === 'PENDING')
        .reduce((sum, r) => sum + Number(r.value), 0),
    }));
  }

  async getRecentActivity() {
    const [recentCharges, recentWebhooks] = await Promise.all([
      this.prisma.charge.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: {
          splits: {
            include: { subaccount: { select: { name: true, type: true } } },
          },
        },
      }),
      this.prisma.webhookLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { recentCharges, recentWebhooks };
  }
}
