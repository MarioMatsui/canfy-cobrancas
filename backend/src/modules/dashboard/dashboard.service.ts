import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getOverview() {
    const [
      totalCharges,
      paidCharges,
      pendingCharges,
      overdueCharges,
      totalSubaccounts,
      activeSubaccounts,
      totalSplits,
    ] = await Promise.all([
      this.prisma.charge.count(),
      this.prisma.charge.count({ where: { status: 'CONFIRMED' } }),
      this.prisma.charge.count({ where: { status: 'PENDING' } }),
      this.prisma.charge.count({ where: { status: 'OVERDUE' } }),
      this.prisma.subaccount.count(),
      this.prisma.subaccount.count({ where: { active: true } }),
      this.prisma.splitResult.count(),
    ]);

    const totalValue = await this.prisma.charge.aggregate({ _sum: { value: true } });
    const paidValue = await this.prisma.charge.aggregate({
      where: { status: 'CONFIRMED' },
      _sum: { value: true },
    });

    return {
      charges: {
        total: totalCharges,
        paid: paidCharges,
        pending: pendingCharges,
        overdue: overdueCharges,
        totalValue: totalValue._sum.value || 0,
        paidValue: paidValue._sum.value || 0,
      },
      subaccounts: {
        total: totalSubaccounts,
        active: activeSubaccounts,
      },
      splits: {
        total: totalSplits,
      },
    };
  }

  async getVolumeBySubaccount() {
    const subaccounts = await this.prisma.subaccount.findMany({
      where: { active: true },
      select: {
        id: true,
        name: true,
        balance: true,
        _count: { select: { charges: true } },
        charges: {
          select: { value: true, status: true },
        },
      },
    });

    return subaccounts.map((sub) => ({
      id: sub.id,
      name: sub.name,
      balance: sub.balance,
      totalCharges: sub._count.charges,
      totalValue: sub.charges.reduce((sum, c) => sum + Number(c.value), 0),
      paidValue: sub.charges
        .filter((c) => c.status === 'CONFIRMED')
        .reduce((sum, c) => sum + Number(c.value), 0),
    }));
  }

  async getRecentActivity() {
    const [recentCharges, recentWebhooks] = await Promise.all([
      this.prisma.charge.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
        include: { subaccount: { select: { name: true } } },
      }),
      this.prisma.webhookLog.findMany({
        take: 10,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return { recentCharges, recentWebhooks };
  }
}
