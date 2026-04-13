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

  @Cron(CronExpression.EVERY_5_MINUTES)
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
        const asaasCharge = await this.asaas.get<{ status: string; value: number }>(`/payments/${charge.asaasId}`);
        if (asaasCharge.status !== charge.status) {
          await this.prisma.charge.update({
            where: { id: charge.id },
            data: { status: asaasCharge.status },
          });
          updated++;

          // Se pagamento confirmado/recebido, criar split results
          if (['CONFIRMED', 'RECEIVED'].includes(asaasCharge.status)) {
            await this.createSplitResults(charge.id, asaasCharge.value || Number(charge.value));
          }
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

  private async createSplitResults(chargeId: string, paymentValue: number) {
    // Verifica se já existem split results para esta cobrança
    const existing = await this.prisma.splitResult.count({ where: { chargeId } });
    if (existing > 0) return;

    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { splits: { include: { subaccount: true } } },
    });

    if (!charge) return;

    for (const split of charge.splits) {
      const splitValue = (Number(split.percentage) / 100) * paymentValue;
      await this.prisma.splitResult.create({
        data: {
          chargeId: charge.id,
          receiverSubaccountId: split.subaccountId,
          value: splitValue,
          percentage: split.percentage,
          status: 'COMPLETED',
        },
      });
    }

    this.logger.log(`Split results criados para cobrança ${chargeId}: ${charge.splits.length} splits`);
  }
}
