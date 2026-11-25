import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { Job } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  cancelUnpaidInstallmentGroup,
  getInstallmentMembers,
  memberPaid,
  reconcileInstallmentGroup,
} from '../public-checkout/installment-reconciliation';
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

export const WEBHOOK_LOG_STATUS = {
  RECEIVED: 'RECEIVED',
  PROCESSING: 'PROCESSING',
  PROCESSED: 'PROCESSED',
  FAILED: 'FAILED',
  /** Falhou MAX_PROCESSING_ATTEMPTS vezes; não é mais reprocessado sozinho. */
  DEAD_LETTER: 'DEAD_LETTER',
} as const;

export const MAX_PROCESSING_ATTEMPTS = 10;

/** Reivindicação PROCESSING mais antiga que isso é considerada órfã. */
export const STALE_CLAIM_MS = 10 * 60_000;

const FAILED_PREFIX = 'PROCESSING_FAILED';

/** Lê o número de tentativas falhas gravado em errorMessage. */
export function parseFailedAttempts(errorMessage: string | null | undefined): number {
  if (!errorMessage || !errorMessage.startsWith(FAILED_PREFIX)) return 0;
  const match = /#(\d+)$/.exec(errorMessage);
  // Logs antigos gravavam apenas "PROCESSING_FAILED" (uma falha).
  return match ? Number(match[1]) : 1;
}

export function formatFailedAttempts(attempts: number): string {
  return FAILED_PREFIX + '#' + attempts;
}

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
    await this.processEvent(job.data);
  }

  /**
   * Processa um evento já persistido em webhook_logs. É chamado tanto pelo
   * worker do Bull quanto pela recuperação periódica (WebhookRecoveryService),
   * que não depende do Redis. A linha do log é reivindicada de forma atômica
   * para que os dois caminhos nunca processem o mesmo evento ao mesmo tempo.
   *
   * Retorna 'skipped' quando o evento já foi processado ou está em
   * processamento por outro executor.
   */
  async processEvent(
    data: QueuedAsaasWebhookPayload,
  ): Promise<'processed' | 'skipped'> {
    const { event, webhookLogId } = data;

    const claimed = await this.claimLog(webhookLogId);
    if (!claimed) {
      this.logger.log('Webhook já processado ou em processamento: ' + event);
      return 'skipped';
    }

    this.logger.log('Processando webhook: ' + event);

    try {
      await this.dispatch(data);

      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: WEBHOOK_LOG_STATUS.PROCESSED,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
      return 'processed';
    } catch (error) {
      const attempts = parseFailedAttempts(claimed.errorMessage) + 1;
      this.logger.error(
        'Erro ao processar webhook ' + event + ' (tentativa ' + attempts + ')',
      );
      const exhausted = attempts >= MAX_PROCESSING_ATTEMPTS;
      if (exhausted) {
        this.logger.error(
          'Webhook ' + event + ' falhou ' + attempts +
            ' vezes; marcado como DEAD_LETTER para revisão manual.',
        );
      }
      await this.prisma.webhookLog.update({
        where: { id: webhookLogId },
        data: {
          status: exhausted
            ? WEBHOOK_LOG_STATUS.DEAD_LETTER
            : WEBHOOK_LOG_STATUS.FAILED,
          processedAt: null,
          errorMessage: formatFailedAttempts(attempts),
        },
      });
      throw error;
    }
  }

  /**
   * Marca a linha como PROCESSING apenas se ela ainda estiver pendente
   * (RECEIVED/FAILED) ou se uma reivindicação anterior ficou órfã (processo
   * morreu no meio). Enquanto PROCESSING, processedAt guarda o instante da
   * reivindicação; ao concluir, passa a ser o instante do processamento.
   */
  private async claimLog(
    webhookLogId: string,
  ): Promise<{ errorMessage: string | null } | null> {
    const current = await this.prisma.webhookLog.findUnique({
      where: { id: webhookLogId },
      select: { errorMessage: true },
    });
    if (!current) return null;

    const now = new Date();
    const result = await this.prisma.webhookLog.updateMany({
      where: {
        id: webhookLogId,
        OR: [
          {
            status: {
              in: [WEBHOOK_LOG_STATUS.RECEIVED, WEBHOOK_LOG_STATUS.FAILED],
            },
          },
          {
            status: WEBHOOK_LOG_STATUS.PROCESSING,
            processedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
          },
          { status: WEBHOOK_LOG_STATUS.PROCESSING, processedAt: null },
        ],
      },
      data: { status: WEBHOOK_LOG_STATUS.PROCESSING, processedAt: now },
    });

    return result.count === 1 ? current : null;
  }

  private async dispatch(data: QueuedAsaasWebhookPayload): Promise<void> {
    const { event, payment, webhookLogId } = data;

    // Events may refer to any member of the group, not only the first ID.
    // Never mark an installment sale paid from one PAYMENT_CONFIRMED.
    if (payment && [
      'PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED', 'PAYMENT_OVERDUE',
      'PAYMENT_REFUNDED', 'PAYMENT_DELETED', 'PAYMENT_RESTORED',
      'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED', 'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
      'PAYMENT_SPLIT_DONE',
    ].includes(event)) {
      const grouped = await this.prisma.payment.findFirst({
        where: {
          provider: 'ASAAS',
          OR: [
            { providerPaymentId: payment.id },
            ...(payment.installment ? [{ providerInstallmentId: payment.installment }] : []),
            { installmentPayments: { some: { providerPaymentId: payment.id } } },
          ],
          providerInstallmentId: { not: null },
        },
        select: { id: true, chargeId: true, providerInstallmentId: true },
      });
      if (grouped?.providerInstallmentId) {
        await this.attachLogToPayment(webhookLogId, grouped.id);
        const result = await reconcileInstallmentGroup(this.prisma, this.asaas, grouped.id);
        if (result === 'PAID') {
          await this.cancelAlternativePayments(grouped.chargeId, grouped.id);
        }
        return;
      }
    }

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
        providerInstallmentId: true,
        installments: true,
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

      if (alternative.providerInstallmentId) {
        const members = await getInstallmentMembers(
          this.asaas, alternative.providerInstallmentId, alternative.installments,
        );
        if (members.some((member) => memberPaid(member.status))) {
          this.logger.error(
            'Parcelamento alternativo parcialmente/totalmente confirmado. Não cancelar nem marcar venda duplicada sem conciliação.',
          );
          continue;
        }
        await cancelUnpaidInstallmentGroup(
          this.asaas, alternative.providerInstallmentId, alternative.installments,
        );
        await this.prisma.payment.update({
          where: { id: alternative.id }, data: { status: PaymentStatus.CANCELLED },
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

      if (alternative.providerInstallmentId) {
        await cancelUnpaidInstallmentGroup(
          this.asaas, alternative.providerInstallmentId, alternative.installments,
        );
      } else {
        await this.asaas.delete<void>(
          '/payments/' + encodeURIComponent(alternative.providerPaymentId),
        );
      }
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
