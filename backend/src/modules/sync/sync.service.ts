import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  AsaasApiException,
  AsaasService,
} from '../../asaas/asaas.service';

type AsaasSplitDetail = {
  walletId?: string;
  totalValue?: number;
  percentualValue?: number;
  fixedValue?: number;
  status?: string;
};

type AsaasPaymentDetail = {
  status?: string;
  netValue?: number;
  split?: AsaasSplitDetail[];
};

const NEW_PAYMENT_INCLUDE = {
  charge: {
    include: {
      splits: {
        include: {
          subaccount: true,
        },
        orderBy: { createdAt: 'asc' as const },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

type NewPaymentRecord = Prisma.PaymentGetPayload<{
  include: typeof NEW_PAYMENT_INCLUDE;
}>;

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

    const newPaymentsUpdated = await this.syncNewPayments();

    // Fallback legado para cobranças criadas antes do modelo Payment.
    const pendingCharges = await this.prisma.charge.findMany({
      where: {
        status: { in: ['PENDING', 'OVERDUE'] },
        asaasId: { not: null },
        chargeType: 'CUSTOM',
      },
    });

    let legacyUpdated = 0;
    for (const charge of pendingCharges) {
      try {
        const asaasCharge = await this.asaas.get<{
          status: string;
          value: number;
          netValue: number;
        }>(`/payments/${charge.asaasId}`);

        if (asaasCharge.status !== charge.status) {
          const paid = this.isProviderPaid(asaasCharge.status);
          const updateData: Prisma.ChargeUpdateInput = {
            status: asaasCharge.status,
            ...(paid ? { orderStatus: 'PAID' } : {}),
          };

          if (paid && asaasCharge.netValue !== undefined) {
            updateData.netValue = asaasCharge.netValue;
          }

          await this.prisma.charge.update({
            where: { id: charge.id },
            data: updateData,
          });
          legacyUpdated++;

          if (paid) {
            await this.createLegacySplitResults(charge.id, charge.asaasId!);
          }
        }
      } catch (error) {
        this.logger.error(
          `Erro ao sincronizar cobrança legada ${charge.id}:`,
          error,
        );
      }
    }

    await this.syncReusableCharges();

    this.logger.log(
      `Sincronização concluída: ${newPaymentsUpdated} Payments novos reconciliados e ${legacyUpdated} cobranças legadas atualizadas.`,
    );
  }

  /**
   * Fallback do fluxo novo. Webhook continua sendo o caminho primário, mas
   * qualquer Payment PENDING/OVERDUE é conferido diretamente no Asaas a cada
   * cinco minutos. Assim uma entrega perdida não deixa a Charge presa.
   */
  async syncNewPayments(): Promise<number> {
    const payments = await this.prisma.payment.findMany({
      where: {
        provider: 'ASAAS',
        providerPaymentId: { not: null },
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
        },
      },
      include: NEW_PAYMENT_INCLUDE,
      orderBy: { updatedAt: 'asc' },
      take: 200,
    });

    let updated = 0;

    for (const payment of payments) {
      if (!payment.providerPaymentId) continue;

      try {
        const remote = await this.asaas.get<AsaasPaymentDetail>(
          '/payments/' + encodeURIComponent(payment.providerPaymentId),
        );

        if (payment.charge.orderStatus === 'PAID') {
          await this.reconcileAlternativeOfPaidCharge(payment, remote);
          updated++;
          continue;
        }

        if (this.isProviderPaid(remote.status)) {
          await this.settleNewPayment(payment, remote);
          updated++;
          continue;
        }

        if (remote.status === 'REFUNDED') {
          await this.markNewPaymentRefunded(payment);
          updated++;
          continue;
        }

        if (remote.status === 'OVERDUE') {
          if (payment.status !== PaymentStatus.OVERDUE) {
            await this.prisma.$transaction([
              this.prisma.payment.update({
                where: { id: payment.id },
                data: { status: PaymentStatus.OVERDUE },
              }),
              this.prisma.charge.update({
                where: { id: payment.chargeId },
                data: {
                  orderStatus: 'PENDING_PAYMENT',
                  status: 'OVERDUE',
                },
              }),
            ]);
            updated++;
          }
          continue;
        }

        if (
          remote.status === 'PENDING' &&
          payment.status === PaymentStatus.OVERDUE
        ) {
          await this.prisma.$transaction([
            this.prisma.payment.update({
              where: { id: payment.id },
              data: { status: PaymentStatus.PENDING },
            }),
            this.prisma.charge.update({
              where: { id: payment.chargeId },
              data: {
                orderStatus: 'PENDING_PAYMENT',
                status: 'PENDING',
              },
            }),
          ]);
          updated++;
        }
      } catch (error) {
        if (error instanceof AsaasApiException && error.providerStatus === 404) {
          await this.closeMissingProviderPayment(payment);
          updated++;
          continue;
        }

        this.logger.error(
          `Erro ao reconciliar Payment ${payment.id} com o Asaas.`,
        );
      }
    }

    return updated;
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async syncSubaccountBalances() {
    this.logger.log('Sincronizando saldos de subcontas...');

    const subaccounts = await this.prisma.subaccount.findMany({
      where: { active: true, walletId: { not: null } },
    });

    for (const sub of subaccounts) {
      try {
        const balance = await this.asaas.get<{ balance: number }>(
          `/finance/balance?walletId=${sub.walletId}`,
        );
        await this.prisma.subaccount.update({
          where: { id: sub.id },
          data: { balance: balance.balance },
        });
      } catch (error) {
        this.logger.error(
          `Erro ao sincronizar saldo da subconta ${sub.id}:`,
          error,
        );
      }
    }

    this.logger.log(
      `Saldos sincronizados para ${subaccounts.length} subcontas`,
    );
  }

  private async settleNewPayment(
    payment: NewPaymentRecord,
    remote: AsaasPaymentDetail,
  ): Promise<void> {
    const status =
      remote.status === 'RECEIVED'
        ? PaymentStatus.RECEIVED
        : PaymentStatus.CONFIRMED;

    await this.prisma.$transaction([
      this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          ...(remote.netValue !== undefined
            ? { netValue: remote.netValue }
            : {}),
          paidAt: payment.paidAt ?? new Date(),
          failureReason: null,
        },
      }),
      this.prisma.charge.update({
        where: { id: payment.chargeId },
        data: {
          orderStatus: 'PAID',
          status,
          ...(remote.netValue !== undefined
            ? { netValue: remote.netValue }
            : {}),
        },
      }),
    ]);

    await this.cancelAlternativeNewPayments(payment.chargeId, payment.id);
    await this.syncNewSplitResults(payment, remote.split ?? []);

    this.logger.log(
      `Payment ${payment.id} reconciliado como ${status}; Charge marcada como PAID.`,
    );
  }

  private async reconcileAlternativeOfPaidCharge(
    payment: NewPaymentRecord,
    remote: AsaasPaymentDetail,
  ): Promise<void> {
    if (this.isProviderPaid(remote.status)) {
      const status =
        remote.status === 'RECEIVED'
          ? PaymentStatus.RECEIVED
          : PaymentStatus.CONFIRMED;

      await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          status,
          ...(remote.netValue !== undefined
            ? { netValue: remote.netValue }
            : {}),
          paidAt: payment.paidAt ?? new Date(),
          failureReason: null,
        },
      });
      await this.syncNewSplitResults(payment, remote.split ?? []);
      this.logger.error(
        `Mais de um método da Charge ${payment.chargeId} foi pago antes da conciliação.`,
      );
      return;
    }

    if (remote.status === 'REFUNDED') {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.REFUNDED },
      });
      return;
    }

    await this.cancelProviderPaymentBestEffort(payment);
  }

  private async cancelAlternativeNewPayments(
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
      include: NEW_PAYMENT_INCLUDE,
    });

    for (const alternative of alternatives) {
      if (!alternative.providerPaymentId) {
        await this.prisma.payment.update({
          where: { id: alternative.id },
          data: { status: PaymentStatus.CANCELLED },
        });
        continue;
      }

      let remote: AsaasPaymentDetail;
      try {
        remote = await this.asaas.get<AsaasPaymentDetail>(
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

        this.logger.warn(
          `Não foi possível consultar o método alternativo ${alternative.id}; ele será revisto no próximo sync.`,
        );
        continue;
      }

      if (this.isProviderPaid(remote.status)) {
        const status =
          remote.status === 'RECEIVED'
            ? PaymentStatus.RECEIVED
            : PaymentStatus.CONFIRMED;
        await this.prisma.payment.update({
          where: { id: alternative.id },
          data: {
            status,
            ...(remote.netValue !== undefined
              ? { netValue: remote.netValue }
              : {}),
            paidAt: alternative.paidAt ?? new Date(),
          },
        });
        await this.syncNewSplitResults(alternative, remote.split ?? []);
        this.logger.error(
          `Mais de um método da Charge ${chargeId} foi pago antes da conciliação.`,
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

      await this.cancelProviderPaymentBestEffort(alternative);
    }
  }

  private async cancelProviderPaymentBestEffort(
    payment: Pick<NewPaymentRecord, 'id' | 'providerPaymentId'>,
  ): Promise<void> {
    if (!payment.providerPaymentId) {
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CANCELLED },
      });
      return;
    }

    try {
      await this.asaas.delete<void>(
        '/payments/' + encodeURIComponent(payment.providerPaymentId),
      );
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: PaymentStatus.CANCELLED },
      });
    } catch (error) {
      if (error instanceof AsaasApiException && error.providerStatus === 404) {
        await this.prisma.payment.update({
          where: { id: payment.id },
          data: { status: PaymentStatus.CANCELLED },
        });
        return;
      }

      this.logger.warn(
        `Não foi possível cancelar o método alternativo ${payment.id}; o próximo sync tentará novamente.`,
      );
    }
  }

  private async markNewPaymentRefunded(
    payment: NewPaymentRecord,
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: PaymentStatus.REFUNDED },
    });

    const currentCharge = await this.prisma.charge.findUnique({
      where: { id: payment.chargeId },
      select: { orderStatus: true },
    });
    if (currentCharge?.orderStatus === 'PAID') return;

    const [paidCount, activeCount] = await Promise.all([
      this.prisma.payment.count({
        where: {
          chargeId: payment.chargeId,
          id: { not: payment.id },
          status: {
            in: [PaymentStatus.CONFIRMED, PaymentStatus.RECEIVED],
          },
        },
      }),
      this.prisma.payment.count({
        where: {
          chargeId: payment.chargeId,
          id: { not: payment.id },
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
          },
        },
      }),
    ]);

    await this.prisma.charge.update({
      where: { id: payment.chargeId },
      data:
        paidCount > 0
          ? { orderStatus: 'PAID' }
          : activeCount > 0
            ? { orderStatus: 'PENDING_PAYMENT' }
            : { orderStatus: 'REFUNDED', status: 'REFUNDED' },
    });
  }

  private async closeMissingProviderPayment(
    payment: NewPaymentRecord,
  ): Promise<void> {
    await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: 'PROVIDER_PAYMENT_NOT_FOUND',
      },
    });

    const currentCharge = await this.prisma.charge.findUnique({
      where: { id: payment.chargeId },
      select: { orderStatus: true },
    });
    if (currentCharge?.orderStatus === 'PAID') return;

    const [paidCount, activeCount] = await Promise.all([
      this.prisma.payment.count({
        where: {
          chargeId: payment.chargeId,
          id: { not: payment.id },
          status: {
            in: [PaymentStatus.CONFIRMED, PaymentStatus.RECEIVED],
          },
        },
      }),
      this.prisma.payment.count({
        where: {
          chargeId: payment.chargeId,
          id: { not: payment.id },
          status: {
            in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
          },
        },
      }),
    ]);

    await this.prisma.charge.update({
      where: { id: payment.chargeId },
      data:
        paidCount > 0
          ? { orderStatus: 'PAID' }
          : activeCount > 0
            ? { orderStatus: 'PENDING_PAYMENT' }
            : { orderStatus: 'READY', status: 'CANCELLED' },
    });
  }

  private async syncNewSplitResults(
    payment: NewPaymentRecord,
    asaasSplits: AsaasSplitDetail[],
  ): Promise<void> {
    for (const split of payment.charge.splits) {
      const providerSplit = split.subaccount.walletId
        ? asaasSplits.find(
            (item) => item.walletId === split.subaccount.walletId,
          )
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

  private isProviderPaid(status?: string): boolean {
    return status === 'CONFIRMED' || status === 'RECEIVED';
  }

  private async createLegacySplitResults(
    chargeId: string,
    asaasPaymentId: string,
  ) {
    const existing = await this.prisma.splitResult.count({
      where: { chargeId },
    });
    if (existing > 0) return;

    const charge = await this.prisma.charge.findUnique({
      where: { id: chargeId },
      include: { splits: { include: { subaccount: true } } },
    });

    if (!charge) return;

    let asaasSplits: Array<{
      walletId: string;
      totalValue: number;
      percentualValue?: number;
      fixedValue?: number;
    }> = [];

    if (charge.chargeType === 'CUSTOM') {
      try {
        const asaasPayment = await this.asaas.get<{
          netValue: number;
          split: typeof asaasSplits;
        }>(`/payments/${asaasPaymentId}`);
        asaasSplits = asaasPayment.split || [];
      } catch {
        this.logger.warn(
          `Não foi possível buscar splits reais do Asaas para ${asaasPaymentId}, usando cálculo local`,
        );
      }
    }

    let netValue = Number(charge.netValue || charge.value);
    if (charge.chargeType === 'REUSABLE') {
      try {
        const asaasPayment = await this.asaas.get<{ netValue: number }>(
          `/payments/${asaasPaymentId}`,
        );
        netValue = asaasPayment.netValue;
      } catch {
        this.logger.warn(
          `Não foi possível buscar netValue para ${asaasPaymentId}`,
        );
      }
    }

    const totalFixed = charge.splits.reduce(
      (sum, split) => sum + Number(split.fixedValue || 0),
      0,
    );
    const remainingForPercent = netValue - totalFixed;

    for (const split of charge.splits) {
      const walletId = split.subaccount?.walletId;
      const asaasSplit = asaasSplits.find(
        (item) => item.walletId === walletId,
      );
      const fallbackValue = split.fixedValue
        ? Number(split.fixedValue)
        : +(
            (remainingForPercent * Number(split.percentage || 0)) /
            100
          ).toFixed(2);
      const splitValue = asaasSplit
        ? asaasSplit.totalValue
        : fallbackValue;

      await this.prisma.splitResult.create({
        data: {
          chargeId: charge.id,
          receiverSubaccountId: split.subaccountId,
          value: splitValue,
          percentage: split.percentage ?? null,
          fixedValue: split.fixedValue ?? null,
          status: 'COMPLETED',
        },
      });
    }

    this.logger.log(
      `Split results legados criados para cobrança ${chargeId}: ${charge.splits.length} splits`,
    );
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
        const payments = await this.asaas.get<{
          data: Array<{
            id: string;
            status: string;
            value: number;
            netValue: number;
            paymentLink: string | null;
          }>;
        }>(`/payments?paymentLink=${charge.asaasId}&limit=50`);

        const linkPayments = payments.data.filter(
          (payment) => payment.paymentLink === charge.asaasId,
        );

        for (const payment of linkPayments) {
          if (!this.isProviderPaid(payment.status)) continue;

          const alreadyProcessed = await this.prisma.splitResult.count({
            where: { chargeId: charge.id },
          });

          if (alreadyProcessed > 0) {
            if (
              charge.status === 'PENDING' ||
              charge.orderStatus !== 'PAID'
            ) {
              await this.prisma.charge.update({
                where: { id: charge.id },
                data: {
                  status: payment.status,
                  orderStatus: 'PAID',
                  netValue: payment.netValue,
                },
              });
            }
            continue;
          }

          await this.prisma.charge.update({
            where: { id: charge.id },
            data: {
              status: payment.status,
              orderStatus: 'PAID',
              netValue: payment.netValue,
            },
          });

          await this.createLegacySplitResults(charge.id, payment.id);
          this.logger.log(
            `Pagamento ${payment.id} processado para link reutilizável ${charge.asaasId}`,
          );
          break;
        }
      } catch (error) {
        this.logger.error(
          `Erro ao sincronizar link reutilizável ${charge.asaasId}:`,
          error,
        );
      }
    }
  }
}
