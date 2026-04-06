import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { Job } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasWebhookPayload } from './webhooks.service';

@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(private prisma: PrismaService) {}

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

    await this.prisma.charge.updateMany({
      where: { asaasId: payment.id },
      data: { status: 'CONFIRMED' },
    });

    // Registra os split results
    const charge = await this.prisma.charge.findFirst({
      where: { asaasId: payment.id },
      include: { subaccount: true },
    });

    if (charge) {
      const rules = await this.prisma.splitRule.findMany({
        where: { chargeSubaccountId: charge.subaccountId, active: true },
      });

      for (const rule of rules) {
        const splitValue =
          rule.type === 'PERCENTAGE'
            ? (Number(rule.value) / 100) * payment.value
            : Number(rule.value);

        await this.prisma.splitResult.create({
          data: {
            chargeId: charge.id,
            receiverSubaccountId: rule.receiverSubaccountId,
            value: splitValue,
            type: rule.type,
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
