import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { Job } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasApiException, AsaasService } from '../../asaas/asaas.service';
import {
  AsaasWebhookPayload,
  QueuedAsaasWebhookPayload,
} from './webhooks.service';

type AsaasSplitDetail = {
  walletId?: string;
  totalValue?: number;
  percentualValue?: number;
  fixedValue?: number;
  status?: string;
};

type AsaasPaymentDetail = {
  netValue?: number;
  paymentLink?: string | null;
  split?: AsaasSplitDetail[];
};

@Processor('webhooks')
export class WebhooksProcessor {
  private readonly logger = new Logger(WebhooksProcessor.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  @Process('process')
  async handleWebhookEvent(job: Job<QueuedAsaasWebhookPayload>) {
    const { event, payment, webhookLogId } = job.data;

    this.logger.log('Processando webhook: ' + event);

    try {
      switch (event) {
        case 'PAYMENT_CONFIRMED':
        case 'PAYMENT_RECEIVED':
          await this.handlePaymentConfirmed(event, payment, webhookLogId);
          break;
        case 'PAYMENT_OVERDUE':
          await this.handlePaymentOverdue(payment, webhookLogId);
          break;
        case 'PAYMENT_REFUNDED':
          await this.handlePaymentRefunded(payment, webhookLogId);
          break;
        case 'PAYMENT_CHARGEBACK_REQUESTED':
        case 'PAYMENT_CHARGEBACK_DISPUTE':
        case 'PAYMENT_AWAITING_CHARGEBACK_REVERSAL':
          await this.handleChargebackProgress(payment, webhookLogId);
          break;
        case 'PAYMENT_DELETED':
          await this.handlePaymentTerminal(payment, webhookLogId, PaymentStatus.CANCELLED);
          break;
        case 'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED':
        case 'PAYMENT_REPROVED_BY_RISK_ANALYSIS':
          await this.handlePaymentTerminal(payment, webhookLogId, PaymentStatus.FAILED);
          break;
        case 'PAYMENT_RESTORED':
          await this.handlePaymentRestored(payment, webhookLogId);
          break;
        default:
          this.logger.warn('Evento não tratado: ' + event);
      }

      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'PROCESSED',
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      this.logger.error('Erro ao processar webhook ' + event);
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: 'FAILED',
          errorMessage: 'PROCESSING_FAILED',
        },
      });
      throw error;
    }
  }

  private async handlePaymentConfirmed(
    event: string,
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
  ) {
    if (!payment) return;

    const localPayment = await this.findPayment(payment.id);
    if (!localPayment) {
      await this.handleLegacyPaymentConfirmed(payment);
      return;
    }

    await this.attachLogToPayment(webhookLogId, localPayment.id);

    let details: AsaasPaymentDetail = {};
    try {
      details = await this.asaas.get<AsaasPaymentDetail>(
        '/payments/' + encodeURIComponent(payment.id),
      );
    } catch {
      this.logger.warn('Não foi possível buscar os detalhes financeiros do pagamento.');
    }

    const status =
      event === 'PAYMENT_RECEIVED' || payment.status === 'RECEIVED'
        ? PaymentStatus.RECEIVED
        : PaymentStatus.CONFIRMED;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: localPayment.id },
        data: {
          status,
          ...(details.netValue !== undefined ? { netValue: details.netValue } : {}),
          paidAt: localPayment.paidAt ?? new Date(),
          failureReason: null,
        },
      }),
      this.prisma.charge.update({
        where: { id: localPayment.chargeId },
        data: {
          orderStatus: 'PAID',
          status,
          ...(details.netValue !== undefined ? { netValue: details.netValue } : {}),
        },
      }),
    ]);

    await this.cancelAlternativePayments(localPayment.chargeId, localPayment.id);
    await this.syncSplitResults(localPayment, details.split ?? []);
    this.logger.log('Pagamento novo confirmado via Payment.');
  }

  private async cancelAlternativePayments(
    chargeId: string,
    winnerPaymentId: string,
  ): Promise<void> {
    const alternatives = await this.prisma.payment.findMany({
      where: {
        chargeId,
        id: { not: winnerPaymentId },
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
        },
      },
      select: {
        id: true,
        providerPaymentId: true,
      },
    });

    for (const alternative of alternatives) {
      if (!alternative.providerPaymentId) {
        await this.prisma.payment.update({
          where: { id: alternative.id },
          data: { status: PaymentStatus.CANCELLED },
        });
        continue;
      }

      let remote: { status?: string };
      try {
        remote = await this.asaas.get<{ status?: string }>(
          '/payments/' + encodeURIComponent(alternative.providerPaymentId),
        );
      } catch (error) {
        if (error instanceof AsaasApiException && error.providerStatus === 404) {
          await this.prisma.payment.update({
            where: { id: alternative.id },
            data: { status: PaymentStatus.CANCELLED },
          });
          continue;
        }
        throw error;
      }

      if (remote.status === 'CONFIRMED' || remote.status === 'RECEIVED') {
        await this.prisma.payment.update({
          where: { id: alternative.id },
          data: {
            status:
              remote.status === 'RECEIVED'
                ? PaymentStatus.RECEIVED
                : PaymentStatus.CONFIRMED,
            paidAt: new Date(),
          },
        });
        this.logger.error(
          'Mais de um método da mesma cobrança foi pago antes da conciliação.',
        );
        continue;
      }

      if (remote.status === 'REFUNDED') {
        await this.prisma.payment.update({
          where: { id: alternative.id },
          data: { status: PaymentStatus.REFUNDED },
        });
        continue;
      }

      await this.asaas.delete<void>(
        '/payments/' + encodeURIComponent(alternative.providerPaymentId),
      );
      await this.prisma.payment.update({
        where: { id: alternative.id },
        data: { status: PaymentStatus.CANCELLED },
      });
    }
  }

  private async handlePaymentOverdue(
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
  ) {
    if (!payment) return;
    const localPayment = await this.findPayment(payment.id);
    if (!localPayment) {
      await this.prisma.charge.updateMany({
        where: { asaasId: payment.id },
        data: { status: 'OVERDUE' },
      });
      return;
    }

    await this.attachLogToPayment(webhookLogId, localPayment.id);
    await this.prisma.payment.update({
      where: { id: localPayment.id },
      data: { status: 'OVERDUE' },
    });
    if (localPayment.charge.orderStatus !== 'PAID') {
      await this.prisma.charge.update({
        where: { id: localPayment.chargeId },
        data: { orderStatus: 'PENDING_PAYMENT', status: 'OVERDUE' },
      });
    }
  }

  private async handlePaymentRefunded(
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
  ) {
    if (!payment) return;
    const localPayment = await this.findPayment(payment.id);
    if (!localPayment) {
      await this.prisma.charge.updateMany({
        where: { asaasId: payment.id },
        data: { orderStatus: 'REFUNDED', status: 'REFUNDED' },
      });
      return;
    }

    await this.attachLogToPayment(webhookLogId, localPayment.id);
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: localPayment.id },
        data: { status: 'REFUNDED' },
      }),
      this.prisma.charge.update({
        where: { id: localPayment.chargeId },
        data: { orderStatus: 'REFUNDED', status: 'REFUNDED' },
      }),
    ]);
  }

  private async handleChargebackProgress(
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
  ) {
    if (!payment) return;

    const localPayment = await this.findPayment(payment.id);
    if (localPayment) {
      await this.attachLogToPayment(webhookLogId, localPayment.id);
    }

    // Chargeback solicitado/em disputa ainda não é reembolso definitivo.
    // A documentação do Asaas prevê tanto reversão para CONFIRMED/RECEIVED
    // quanto evolução posterior para PAYMENT_REFUNDED. Mantemos o estado
    // financeiro atual e deixamos o evento final decidir a transição.
    this.logger.warn(
      'Chargeback em andamento; estado do pagamento preservado até evento conclusivo.',
    );
  }

  private async handlePaymentTerminal(
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
    status: PaymentStatus,
  ) {
    if (!payment) return;
    const localPayment = await this.findPayment(payment.id);
    if (!localPayment) return;

    await this.attachLogToPayment(webhookLogId, localPayment.id);
    await this.prisma.payment.update({
      where: { id: localPayment.id },
      data: {
        status,
        ...(status === PaymentStatus.FAILED
          ? { failureReason: 'PROVIDER_PAYMENT_FAILED' }
          : {}),
      },
    });

    if (localPayment.charge.orderStatus === 'PAID') return;

    const anotherActive = await this.prisma.payment.count({
      where: {
        chargeId: localPayment.chargeId,
        id: { not: localPayment.id },
        status: {
          in: [
            PaymentStatus.PENDING,
            PaymentStatus.OVERDUE,
            PaymentStatus.CONFIRMED,
            PaymentStatus.RECEIVED,
          ],
        },
      },
    });

    await this.prisma.charge.update({
      where: { id: localPayment.chargeId },
      data: {
        orderStatus: anotherActive > 0 ? 'PENDING_PAYMENT' : 'READY',
        status: status,
      },
    });
  }

  private async handlePaymentRestored(
    payment: AsaasWebhookPayload['payment'],
    webhookLogId: string,
  ) {
    if (!payment) return;
    const localPayment = await this.findPayment(payment.id);
    if (!localPayment) return;
    await this.attachLogToPayment(webhookLogId, localPayment.id);
    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: localPayment.id },
        data: { status: 'PENDING', failureReason: null },
      }),
      this.prisma.charge.update({
        where: { id: localPayment.chargeId },
        data: { orderStatus: 'PENDING_PAYMENT', status: 'PENDING' },
      }),
    ]);
  }

  private findPayment(providerPaymentId: string) {
    return this.prisma.payment.findFirst({
      where: {
        provider: 'ASAAS',
        providerPaymentId,
      },
      include: {
        charge: {
          include: {
            splits: {
              include: {
                subaccount: true,
              },
              orderBy: { createdAt: 'asc' },
            },
          },
        },
      },
    });
  }

  private async attachLogToPayment(webhookLogId: string, paymentId: string) {
    await this.prisma.webhookLog.update({
      where: { id: webhookLogId },
      data: { paymentId },
    });
  }

  private async syncSplitResults(
    payment: NonNullable<Awaited<ReturnType<WebhooksProcessor['findPayment']>>>,
    asaasSplits: AsaasSplitDetail[],
  ) {
    for (const split of payment.charge.splits) {
      const providerSplit = split.subaccount.walletId
        ? asaasSplits.find((item) => item.walletId === split.subaccount.walletId)
        : undefined;
      const lockedValue =
        split.calculatedValue != null
          ? Number(split.calculatedValue)
          : split.fixedValue != null
            ? Number(split.fixedValue)
            : 0;
      const value =
        typeof providerSplit?.totalValue === 'number'
          ? providerSplit.totalValue
          : lockedValue;

      const data = {
        chargeId: payment.chargeId,
        paymentId: payment.id,
        receiverSubaccountId: split.subaccountId,
        value,
        percentage:
          typeof providerSplit?.percentualValue === 'number'
            ? providerSplit.percentualValue
            : split.percentage,
        fixedValue:
          typeof providerSplit?.fixedValue === 'number'
            ? providerSplit.fixedValue
            : split.calculatedValue ?? split.fixedValue,
        status: providerSplit?.status || 'COMPLETED',
      };

      await this.prisma.splitResult.upsert({
        where: {
          paymentId_receiverSubaccountId: {
            paymentId: payment.id,
            receiverSubaccountId: split.subaccountId,
          },
        },
        create: data,
        update: data,
      });
    }
  }

  private async handleLegacyPaymentConfirmed(
    payment: NonNullable<AsaasWebhookPayload['payment']>,
  ) {
    let details: AsaasPaymentDetail = {};
    try {
      details = await this.asaas.get<AsaasPaymentDetail>(
        '/payments/' + encodeURIComponent(payment.id),
      );
    } catch {
      this.logger.warn('Não foi possível buscar detalhes do pagamento legado.');
    }

    let charge = await this.prisma.charge.findFirst({
      where: { asaasId: payment.id },
      include: { splits: { include: { subaccount: true } } },
    });

    if (!charge && details.paymentLink) {
      charge = await this.prisma.charge.findFirst({
        where: { asaasId: details.paymentLink, chargeType: 'REUSABLE' },
        include: { splits: { include: { subaccount: true } } },
      });
    }

    if (!charge) {
      this.logger.warn('Pagamento sem Payment novo e sem Charge legada correspondente.');
      return;
    }

    const status = payment.status === 'RECEIVED' ? 'RECEIVED' : 'CONFIRMED';
    await this.prisma.charge.update({
      where: { id: charge.id },
      data: {
        orderStatus: 'PAID',
        status,
        ...(details.netValue !== undefined ? { netValue: details.netValue } : {}),
      },
    });

    const existingSplits = await this.prisma.splitResult.count({
      where: { chargeId: charge.id, paymentId: null },
    });
    if (existingSplits > 0) return;

    for (const split of charge.splits) {
      const providerSplit = split.subaccount.walletId
        ? details.split?.find((item) => item.walletId === split.subaccount.walletId)
        : undefined;
      const fallback =
        split.calculatedValue != null
          ? Number(split.calculatedValue)
          : split.fixedValue != null
            ? Number(split.fixedValue)
            : 0;
      await this.prisma.splitResult.create({
        data: {
          chargeId: charge.id,
          paymentId: null,
          receiverSubaccountId: split.subaccountId,
          value:
            typeof providerSplit?.totalValue === 'number'
              ? providerSplit.totalValue
              : fallback,
          percentage: split.percentage,
          fixedValue: split.fixedValue,
          status: providerSplit?.status || 'COMPLETED',
        },
      });
    }
  }
}
