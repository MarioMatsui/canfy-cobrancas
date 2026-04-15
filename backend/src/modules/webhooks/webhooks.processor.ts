import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { AsaasWebhookPayload } from './webhooks.service';

@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  @Process('process')
  async handleWebhookEvent(job: Job<AsaasWebhookPayload>) {
    const { event, payment } = job.data;

    this.logger.log(`Processando webhook: ${event}`);

    try {
      switch (event) {
        case 'PAYMENT_CONFIRMED':
        case 'PAYMENT_RECEIVED':
          await this.handlePaymentConfirmed(payment);
          break;
        case 'PAYMENT_OVERDUE':
          await this.handlePaymentOverdue(payment);
          break;
        case 'PAYMENT_REFUNDED':
        case 'PAYMENT_CHARGEBACK':
          await this.handlePaymentRefunded(payment);
          break;
        default:
          this.logger.warn(`Evento não tratado: ${event}`);
      }

      // Atualiza log como processado
      await this.prisma.webhookLog.updateMany({
        where: { event, status: 'RECEIVED' },
        data: { status: 'PROCESSED' },
      });
    } catch (error) {
      this.logger.error(`Erro ao processar webhook ${event}:`, error);
      await this.prisma.webhookLog.updateMany({
        where: { event, status: 'RECEIVED' },
        data: { status: 'FAILED' },
      });
      throw error; // Bull vai fazer retry
    }
  }

  private async handlePaymentConfirmed(payment: AsaasWebhookPayload['payment']) {
    if (!payment) return;

    const status = payment.status === 'RECEIVED' ? 'RECEIVED' : 'CONFIRMED';

    // Busca detalhes completos do pagamento (netValue, paymentLink, split)
    let netValue: number | undefined;
    let paymentLinkId: string | undefined;
    let asaasSplits: Array<{ walletId: string; totalValue: number; percentualValue: number }> = [];
    try {
      const asaasPayment = await this.asaas.get<{
        netValue: number;
        paymentLink: string | null;
        split: typeof asaasSplits;
      }>(`/payments/${payment.id}`);
      netValue = asaasPayment.netValue;
      paymentLinkId = asaasPayment.paymentLink || undefined;
      asaasSplits = asaasPayment.split || [];
    } catch {
      this.logger.warn(`Não foi possível buscar detalhes do pagamento ${payment.id}`);
    }

    // Tenta encontrar a charge por asaasId direto (cobranças avulsas)
    let charge = await this.prisma.charge.findFirst({
      where: { asaasId: payment.id },
      include: { splits: { include: { subaccount: true } } },
    });

    // Se não encontrou, tenta pelo paymentLink (cobranças reutilizáveis)
    if (!charge && paymentLinkId) {
      charge = await this.prisma.charge.findFirst({
        where: { asaasId: paymentLinkId, chargeType: 'REUSABLE' },
        include: { splits: { include: { subaccount: true } } },
      });
    }

    if (!charge) {
      this.logger.warn(`Charge não encontrada para payment ${payment.id} (paymentLink: ${paymentLinkId})`);
      return;
    }

    // Atualiza status e netValue
    await this.prisma.charge.update({
      where: { id: charge.id },
      data: { status, ...(netValue !== undefined && { netValue }) },
    });

    // Cria split results se ainda não existem
    const existingSplits = await this.prisma.splitResult.count({ where: { chargeId: charge.id } });
    if (existingSplits === 0 && charge.splits.length > 0) {
      const paymentNetValue = netValue || Number(charge.value);

      for (const split of charge.splits) {
        const walletId = split.subaccount?.walletId;
        const asaasSplit = asaasSplits.find(s => s.walletId === walletId);
        const splitValue = asaasSplit
          ? asaasSplit.totalValue
          : +(paymentNetValue * Number(split.percentage) / 100).toFixed(2);

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

    }

    this.logger.log(`Pagamento confirmado: ${payment.id}`);
  }

  private async handlePaymentOverdue(payment: AsaasWebhookPayload['payment']) {
    if (!payment) return;
    await this.prisma.charge.updateMany({
      where: { asaasId: payment.id },
      data: { status: 'OVERDUE' },
    });
    this.logger.log(`Pagamento atrasado: ${payment.id}`);
  }

  private async handlePaymentRefunded(payment: AsaasWebhookPayload['payment']) {
    if (!payment) return;
    await this.prisma.charge.updateMany({
      where: { asaasId: payment.id },
      data: { status: 'REFUNDED' },
    });
    this.logger.log(`Pagamento estornado: ${payment.id}`);
  }
}
