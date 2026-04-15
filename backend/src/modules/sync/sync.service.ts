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

    // Sync cobranças avulsas (CUSTOM)
    const pendingCharges = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        asaasId: { not: null },
        chargeType: 'CUSTOM',
      },
    });

    let updated = 0;
    for (const charge of pendingCharges) {
      try {
        const asaasCharge = await this.asaas.get<{ status: string; value: number; netValue: number }>(`/payments/${charge.asaasId}`);
        if (asaasCharge.status !== charge.status) {
          const updateData: Record<string, unknown> = { status: asaasCharge.status };
          if (['CONFIRMED', 'RECEIVED'].includes(asaasCharge.status) && asaasCharge.netValue) {
            updateData.netValue = asaasCharge.netValue;
          }
          await this.prisma.charge.update({
            where: { id: charge.id },
            data: updateData,
          });
          updated++;

          if (['CONFIRMED', 'RECEIVED'].includes(asaasCharge.status)) {
            await this.createSplitResults(charge.id, charge.asaasId!);
          }
        }
      } catch (error) {
        this.logger.error(`Erro ao sincronizar cobrança ${charge.id}:`, error);
      }
    }

    // Sync cobranças reutilizáveis (REUSABLE) — busca pagamentos gerados pelo link
    await this.syncReusableCharges();

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

  private async createSplitResults(chargeId: string, asaasPaymentId: string) {
    // Verifica se já existem split results para esta cobrança + pagamento
    const existing = await this.prisma.splitResult.count({ where: { chargeId } });
    if (existing > 0) return;

    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { splits: { include: { subaccount: true } } },
    });

    if (!charge) return;

    // Para cobranças avulsas: busca splits reais da API do Asaas
    // Para reutilizáveis: calcula baseado no netValue (Asaas não faz split em payment links)
    let asaasSplits: Array<{ walletId: string; totalValue: number; percentualValue: number }> = [];
    if (charge.chargeType === 'CUSTOM') {
      try {
        const asaasPayment = await this.asaas.get<{ netValue: number; split: typeof asaasSplits }>(`/payments/${asaasPaymentId}`);
        asaasSplits = asaasPayment.split || [];
      } catch (error) {
        this.logger.warn(`Não foi possível buscar splits reais do Asaas para ${asaasPaymentId}, usando cálculo local`);
      }
    }

    // Busca o netValue do pagamento real para calcular splits de cobranças reutilizáveis
    let netValue = Number(charge.netValue || charge.value);
    if (charge.chargeType === 'REUSABLE') {
      try {
        const asaasPayment = await this.asaas.get<{ netValue: number }>(`/payments/${asaasPaymentId}`);
        netValue = asaasPayment.netValue;
      } catch {
        this.logger.warn(`Não foi possível buscar netValue para ${asaasPaymentId}`);
      }
    }

    for (const split of charge.splits) {
      const walletId = split.subaccount?.walletId;
      const asaasSplit = asaasSplits.find(s => s.walletId === walletId);
      const splitValue = asaasSplit
        ? asaasSplit.totalValue
        : +(netValue * Number(split.percentage) / 100).toFixed(2);

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

    // Para cobranças reutilizáveis: o split não é automático no Asaas (payment links não suportam)
    // O valor é registrado no sistema para controle, mas a distribuição fica na conta principal

    this.logger.log(`Split results criados para cobrança ${chargeId}: ${charge.splits.length} splits`);
  }

  private async syncReusableCharges() {
    const reusableCharges = await this.prisma.charge.findMany({
      where: {
        chargeType: 'REUSABLE',
        asaasId: { not: null },
        isActive: true,
      },
    });

    for (const charge of reusableCharges) {
      try {
        // Busca pagamentos recentes e filtra pelo paymentLink correto
        // (o filtro da API Asaas não funciona corretamente, então verificamos client-side)
        const payments = await this.asaas.get<{
          data: Array<{ id: string; status: string; value: number; netValue: number; paymentLink: string | null }>;
        }>(`/payments?paymentLink=${charge.asaasId}&limit=50`);

        // Filtra apenas pagamentos que realmente pertencem a este link
        const linkPayments = payments.data.filter(p => p.paymentLink === charge.asaasId);

        for (const payment of linkPayments) {
          if (!['CONFIRMED', 'RECEIVED'].includes(payment.status)) continue;

          // Verifica se já processamos este pagamento
          const alreadyProcessed = await this.prisma.splitResult.count({
            where: { chargeId: charge.id },
          });

          if (alreadyProcessed > 0) {
            // Atualiza status se necessário
            if (charge.status === 'PENDING') {
              await this.prisma.charge.update({
                where: { id: charge.id },
                data: { status: payment.status, netValue: payment.netValue },
              });
            }
            continue;
          }

          // Primeiro pagamento confirmado — atualiza charge e cria splits
          await this.prisma.charge.update({
            where: { id: charge.id },
            data: { status: payment.status, netValue: payment.netValue },
          });

          await this.createSplitResults(charge.id, payment.id);
          this.logger.log(`Pagamento ${payment.id} processado para link reutilizável ${charge.asaasId}`);
          break; // Só processa o primeiro pagamento confirmado
        }
      } catch (error) {
        this.logger.error(`Erro ao sincronizar link reutilizável ${charge.asaasId}:`, error);
      }
    }
  }


}
