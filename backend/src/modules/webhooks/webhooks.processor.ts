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

    await this.prisma.charge.updateMany({
      where: { asaasId: payment.id },
      data: { status },
    });

    // Registra os split results baseado nos ChargeSplits
    const charge = await this.prisma.charge.findFirst({
      where: { asaasId: payment.id },
      include: {
        splits: {
          include: { subaccount: true },
        },
      },
    });

    if (charge) {
      // Busca os valores reais dos splits da API do Asaas (calcula sobre valor líquido)
      let asaasSplits: Array<{ walletId: string; totalValue: number; percentualValue: number }> = [];
      try {
        const asaasPayment = await this.asaas.get<{ netValue: number; split: typeof asaasSplits }>(`/payments/${payment.id}`);
        asaasSplits = asaasPayment.split || [];
      } catch (error) {
        this.logger.warn(`Não foi possível buscar splits reais do Asaas para ${payment.id}`);
      }

      for (const split of charge.splits) {
        const walletId = split.subaccount?.walletId;
        const asaasSplit = asaasSplits.find(s => s.walletId === walletId);
        const splitValue = asaasSplit ? asaasSplit.totalValue : (Number(split.percentage) / 100) * payment.value;

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
