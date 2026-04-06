import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';

@Injectable()
export class SyncService {
  private readonly logger = new Logger(SyncService.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  @Cron(CronExpression.EVERY_HOUR)
  async syncChargeStatuses() {
    this.logger.log('Iniciando sincronização de status de cobranças...');

    const pendingCharges = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        asaasId: { not: null },
      },
    });

    let updated = 0;
    for (const charge of pendingCharges) {
      try {
        const asaasCharge = await this.asaas.get<{ status: string }>(`/payments/${charge.asaasId}`);
        if (asaasCharge.status !== charge.status) {
          await this.prisma.charge.update({
            where: { id: charge.id },
            data: { status: asaasCharge.status },
          });
          updated++;
        }
      } catch (error) {
        this.logger.error(`Erro ao sincronizar cobrança ${charge.id}:`, error);
      }
    }

    this.logger.log(`Sincronização concluída: ${updated} cobranças atualizadas de ${pendingCharges.length} verificadas`);
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async syncSubaccountBalances() {
    this.logger.log('Sincronizando saldos de subcontas...');

    const subaccounts = await this.prisma.subaccount.findMany({
      where: { active: true, walletId: { not: null } },
    });

    for (const sub of subaccounts) {
      try {
        const balance = await this.asaas.get<{ balance: number }>(`/finance/balance?walletId=${sub.walletId}`);
        await this.prisma.subaccount.update({
          where: { id: sub.id },
          data: { balance: balance.balance },
        });
      } catch (error) {
        this.logger.error(`Erro ao sincronizar saldo da subconta ${sub.id}:`, error);
      }
    }

    this.logger.log(`Saldos sincronizados para ${subaccounts.length} subcontas`);
  }
}
