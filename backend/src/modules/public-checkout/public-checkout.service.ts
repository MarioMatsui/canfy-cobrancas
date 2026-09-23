import {
  GoneException,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import {
  AsaasApiException,
  AsaasService,
} from '../../asaas/asaas.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  PublicActivePaymentDto,
  PublicChargeItemDto,
  PublicChargeResponseDto,
  PublicChargeShipmentDto,
  PublicFulfillmentType,
  PublicOrderKind,
  PublicOrderStatus,
  PublicPaymentMethod,
  PublicPaymentStartResponseDto,
  PublicPaymentStatus,
  PublicProductType,
  PublicShipmentType,
} from './dto/public-charge.response.dto';
import { StartPublicPaymentDto } from './dto/start-public-payment.dto';

const PUBLIC_TOKEN_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const EXIBIVEL = new Set<PublicOrderStatus>(['READY', 'PENDING_PAYMENT', 'PAID']);
const ACTIVE_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.PENDING,
  PaymentStatus.OVERDUE,
]);
const PAID_PAYMENT_STATUSES = new Set<PaymentStatus>([
  PaymentStatus.CONFIRMED,
  PaymentStatus.RECEIVED,
]);

const PUBLIC_CHARGE_SELECT = {
  publicToken: true,
  orderStatus: true,
  orderKind: true,
  customerName: true,
  description: true,
  subtotal: true,
  discountAmount: true,
  shippingAmount: true,
  totalAmount: true,
  maxInstallments: true,
  expiresAt: true,
  isActive: true,
  value: true,
  billingType: true,
  asaasId: true,
  invoiceUrl: true,
  pixQrCode: true,
  pixCopiaECola: true,
  items: {
    select: {
      productName: true,
      productType: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      fulfillmentType: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  shipments: {
    select: {
      type: true,
      shippingAmount: true,
      estimatedDaysMin: true,
      estimatedDaysMax: true,
    },
    orderBy: { createdAt: 'asc' as const },
  },
  payments: {
    select: {
      providerPaymentId: true,
      billingType: true,
      amount: true,
      status: true,
      invoiceUrl: true,
      pixQrCode: true,
      pixCopyPaste: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 10,
  },
} satisfies Prisma.ChargeSelect;

const START_CHARGE_SELECT = {
  id: true,
  publicToken: true,
  orderStatus: true,
  orderKind: true,
  isActive: true,
  expiresAt: true,
  dueDate: true,
  description: true,
  totalAmount: true,
  customer: {
    select: {
      id: true,
      name: true,
      email: true,
      cpfCnpj: true,
      asaasCustomerId: true,
    },
  },
  splits: {
    select: {
      subaccountId: true,
      recipientType: true,
      calculatedValue: true,
      subaccount: {
        select: {
          walletId: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' as const },
  },
  payments: {
    select: {
      id: true,
      providerPaymentId: true,
      billingType: true,
      amount: true,
      status: true,
      invoiceUrl: true,
      pixQrCode: true,
      pixCopyPaste: true,
      dueDate: true,
      createdAt: true,
    },
    orderBy: { createdAt: 'desc' as const },
    take: 20,
  },
} satisfies Prisma.ChargeSelect;

type PublicChargeRecord = Prisma.ChargeGetPayload<{ select: typeof PUBLIC_CHARGE_SELECT }>;
type StartChargeRecord = Prisma.ChargeGetPayload<{ select: typeof START_CHARGE_SELECT }>;
type StartPaymentRecord = StartChargeRecord['payments'][number];

type AsaasPayment = {
  id: string;
  status?: string;
  value?: number;
  billingType?: string;
  invoiceUrl?: string | null;
  bankSlipUrl?: string | null;
  netValue?: number | null;
  dueDate?: string | null;
  externalReference?: string | null;
};

type AsaasPixQrCode = {
  encodedImage?: string;
  payload?: string;
  expirationDate?: string | null;
};

type AsaasListResponse<T> = {
  data?: T[];
};

type StartOutcome =
  | { kind: 'success'; response: PublicPaymentStartResponseDto }
  | { kind: 'provider_error' };

@Injectable()
export class PublicCheckoutService {
  private readonly logger = new Logger(PublicCheckoutService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
    private readonly config: ConfigService,
  ) {}

  async findByToken(token: string): Promise<PublicChargeResponseDto> {
    this.assertToken(token);

    const charge = await this.prisma.charge.findUnique({
      where: { publicToken: token },
      select: PUBLIC_CHARGE_SELECT,
    });

    this.assertChargeAvailable(charge);

    return this.toResponse(charge);
  }

  async startPayment(
    token: string,
    dto: StartPublicPaymentDto,
  ): Promise<PublicPaymentStartResponseDto> {
    this.assertToken(token);

    let providerPaymentCreatedDuringTransaction: string | undefined;
    let outcome: StartOutcome;

    try {
      outcome = await this.prisma.$transaction(
        async (tx) => {
          const initial = await tx.charge.findUnique({
            where: { publicToken: token },
            select: START_CHARGE_SELECT,
          });
          this.assertChargeAvailable(initial);

          await this.acquireLock(tx, 'charge:' + initial.id);

          const charge = await tx.charge.findUnique({
            where: { publicToken: token },
            select: START_CHARGE_SELECT,
          });
          this.assertChargeAvailable(charge);

          if (charge.orderStatus === 'PAID') {
            return { kind: 'success', response: { orderStatus: 'PAID' } };
          }

          const alreadyPaid = charge.payments.find((payment) =>
            PAID_PAYMENT_STATUSES.has(payment.status),
          );
          if (alreadyPaid) {
            await tx.charge.update({
              where: { id: charge.id },
              data: { orderStatus: 'PAID', status: alreadyPaid.status },
            });
            return { kind: 'success', response: { orderStatus: 'PAID' } };
          }

          this.assertPayableTotal(charge.totalAmount);

          const billingType = this.billingTypeFor(dto.method);
          const activePayments = charge.payments.filter((payment) =>
            ACTIVE_PAYMENT_STATUSES.has(payment.status),
          );
          const sameMethod = activePayments.find(
            (payment) => payment.billingType === billingType,
          );

          if (sameMethod) {
            const resumed = await this.resumePayment(tx, charge, sameMethod, dto.method);
            return resumed;
          }

          // Ao selecionar outro método, preservamos a tentativa anterior.
          // Antes de criar a alternativa, reconciliamos o estado remoto para
          // evitar abrir uma segunda cobrança quando a primeira acabou de ser paga.
          for (const payment of activePayments) {
            const paidWhileSelectingAlternative =
              await this.reconcileAlternativePaymentBeforeStart(
                tx,
                charge,
                payment,
              );
            if (paidWhileSelectingAlternative) {
              return { kind: 'success', response: { orderStatus: 'PAID' } };
            }
          }

          const recovered = await this.recoverFailedProviderPayment(
            tx,
            charge,
            billingType,
            dto.method,
          );
          if (recovered) {
            return recovered;
          }

          const paymentId = randomUUID();
          const dueDate = this.resolveDueDate(charge);
          await tx.payment.create({
            data: {
              id: paymentId,
              chargeId: charge.id,
              provider: 'ASAAS',
              billingType,
              amount: charge.totalAmount,
              installments: 1,
              status: 'PENDING',
              dueDate,
            },
          });

          try {
            if (!charge.customer) {
              throw new Error('CUSTOMER_NOT_LINKED');
            }

            const asaasCustomerId = await this.ensureAsaasCustomer(tx, charge.customer);
            const providerPayload = this.buildProviderPayload(
              charge,
              paymentId,
              asaasCustomerId,
              dto.method,
              dueDate,
            );

            const remote = await this.asaas.post<AsaasPayment>('/payments', providerPayload);
            if (!remote?.id) {
              throw new Error('PROVIDER_PAYMENT_ID_MISSING');
            }
            providerPaymentCreatedDuringTransaction = remote.id;

            await tx.payment.update({
              where: { id: paymentId },
              data: {
                providerPaymentId: remote.id,
                invoiceUrl: remote.invoiceUrl ?? null,
                bankSlipUrl: remote.bankSlipUrl ?? null,
                status: this.paymentStatusFromProvider(remote.status),
              },
            });

            await tx.charge.update({
              where: { id: charge.id },
              data: {
                orderStatus: 'PENDING_PAYMENT',
                status: remote.status || 'PENDING',
              },
            });

            const payment: StartPaymentRecord = {
              id: paymentId,
              providerPaymentId: remote.id,
              billingType,
              amount: charge.totalAmount,
              status: this.paymentStatusFromProvider(remote.status),
              invoiceUrl: remote.invoiceUrl ?? null,
              pixQrCode: null,
              pixCopyPaste: null,
              dueDate,
              createdAt: new Date(),
            };

            return this.completeStartedPayment(tx, charge, payment, dto.method);
          } catch (error) {
            // Se o provider já devolveu um id e a persistência local falhou,
            // deixamos a transação abortar para o bloco externo compensar a
            // cobrança remota. Não marcamos FAILED e seguimos silenciosamente,
            // pois isso poderia deixar uma cobrança órfã pagável.
            if (providerPaymentCreatedDuringTransaction) {
              throw error;
            }

            const failureReason = this.providerFailureReason(error);
            this.logger.warn(
              'Falha do provedor ao iniciar uma tentativa de pagamento: ' +
                failureReason,
            );
            await tx.payment.update({
              where: { id: paymentId },
              data: {
                status: 'FAILED',
                failureReason,
              },
            });
            const orderStatus = await this.orderStatusAfterAttemptStops(
              tx,
              charge.id,
              paymentId,
            );
            await tx.charge.update({
              where: { id: charge.id },
              data: { orderStatus },
            });
            return { kind: 'provider_error' };
          }
        },
        { maxWait: 5_000, timeout: 30_000 },
      );
    } catch (error) {
      if (providerPaymentCreatedDuringTransaction) {
        await this.compensateProviderPayment(providerPaymentCreatedDuringTransaction);
      }
      if (error instanceof NotFoundException || error instanceof GoneException) {
        throw error;
      }
      this.logger.error('Falha interna ao iniciar pagamento público.');
      throw this.publicProviderError();
    }

    providerPaymentCreatedDuringTransaction = undefined;

    if (outcome.kind === 'provider_error') {
      throw this.publicProviderError();
    }

    return outcome.response;
  }

  private async resumePayment(
    tx: Prisma.TransactionClient,
    charge: StartChargeRecord,
    payment: StartPaymentRecord,
    method: PublicPaymentMethod,
  ): Promise<StartOutcome> {
    if (!payment.providerPaymentId) {
      try {
        const recovered = await this.findProviderPayment(payment.id);
        if (recovered?.id) {
          const recoveredPayment = await this.attachRecoveredPayment(tx, payment, recovered);
          await tx.charge.update({
            where: { id: charge.id },
            data: { orderStatus: 'PENDING_PAYMENT', status: recovered.status || 'PENDING' },
          });
          return this.completeStartedPayment(tx, charge, recoveredPayment, method);
        }

        // Uma tentativa PENDING sem providerPaymentId pode ser resíduo de uma
        // chamada interrompida. Primeiro tentamos reconciliar pelo
        // externalReference. Se não existir no Asaas, encerramos esta tentativa
        // local; o próximo POST criará uma nova tentativa auditável pelo caminho
        // normal, que possui compensação para falha de persistência.
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            status: 'FAILED',
            failureReason: 'PROVIDER_PAYMENT_NOT_FOUND',
          },
        });
        const orderStatus = await this.orderStatusAfterAttemptStops(
          tx,
          charge.id,
          payment.id,
        );
        await tx.charge.update({
          where: { id: charge.id },
          data: { orderStatus },
        });
        return { kind: 'provider_error' };
      } catch {
        return { kind: 'provider_error' };
      }
    }

    if (method === 'PIX' && (!payment.pixQrCode || !payment.pixCopyPaste)) {
      return this.completeStartedPayment(tx, charge, payment, method);
    }

    if (method === 'CARD' && !payment.invoiceUrl) {
      try {
        const remote = await this.asaas.get<AsaasPayment>(
          '/payments/' + encodeURIComponent(payment.providerPaymentId),
        );
        if (this.isProviderPaid(remote.status)) {
          await this.markPaid(tx, charge.id, payment.id, remote.status);
          return { kind: 'success', response: { orderStatus: 'PAID' } };
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: { invoiceUrl: remote.invoiceUrl ?? null },
        });
        return {
          kind: 'success',
          response: {
            orderStatus: 'PENDING_PAYMENT',
            activePayment: this.toPublicPayment({
              ...payment,
              invoiceUrl: remote.invoiceUrl ?? null,
            }),
          },
        };
      } catch {
        return { kind: 'provider_error' };
      }
    }

    await tx.charge.update({
      where: { id: charge.id },
      data: { orderStatus: 'PENDING_PAYMENT' },
    });
    return {
      kind: 'success',
      response: {
        orderStatus: 'PENDING_PAYMENT',
        activePayment: this.toPublicPayment(payment),
      },
    };
  }

  private async completeStartedPayment(
    tx: Prisma.TransactionClient,
    charge: StartChargeRecord,
    payment: StartPaymentRecord,
    method: PublicPaymentMethod,
  ): Promise<StartOutcome> {
    if (this.isLocalPaid(payment.status)) {
      await this.markPaid(tx, charge.id, payment.id, payment.status);
      return { kind: 'success', response: { orderStatus: 'PAID' } };
    }

    if (method === 'PIX') {
      if (!payment.providerPaymentId) {
        return { kind: 'provider_error' };
      }
      try {
        const pix = await this.asaas.get<AsaasPixQrCode>(
          '/payments/' + encodeURIComponent(payment.providerPaymentId) + '/pixQrCode',
        );
        if (!pix?.encodedImage || !pix?.payload) {
          return { kind: 'provider_error' };
        }
        await tx.payment.update({
          where: { id: payment.id },
          data: {
            pixQrCode: pix.encodedImage,
            pixCopyPaste: pix.payload,
          },
        });
        return {
          kind: 'success',
          response: {
            orderStatus: 'PENDING_PAYMENT',
            activePayment: this.toPublicPayment(
              {
                ...payment,
                pixQrCode: pix.encodedImage,
                pixCopyPaste: pix.payload,
              },
              pix.expirationDate ?? undefined,
            ),
          },
        };
      } catch {
        return { kind: 'provider_error' };
      }
    }

    let invoiceUrl = payment.invoiceUrl;
    if (!invoiceUrl && payment.providerPaymentId) {
      try {
        const remote = await this.asaas.get<AsaasPayment>(
          '/payments/' + encodeURIComponent(payment.providerPaymentId),
        );
        if (this.isProviderPaid(remote.status)) {
          await this.markPaid(tx, charge.id, payment.id, remote.status);
          return { kind: 'success', response: { orderStatus: 'PAID' } };
        }
        invoiceUrl = remote.invoiceUrl ?? null;
        await tx.payment.update({
          where: { id: payment.id },
          data: { invoiceUrl },
        });
      } catch {
        return { kind: 'provider_error' };
      }
    }

    if (!invoiceUrl) {
      return { kind: 'provider_error' };
    }

    return {
      kind: 'success',
      response: {
        orderStatus: 'PENDING_PAYMENT',
        activePayment: this.toPublicPayment({ ...payment, invoiceUrl }),
      },
    };
  }

  private async reconcileAlternativePaymentBeforeStart(
    tx: Prisma.TransactionClient,
    charge: StartChargeRecord,
    payment: StartPaymentRecord,
  ): Promise<boolean> {
    let current = payment;

    if (!current.providerPaymentId) {
      const recovered = await this.findProviderPayment(current.id);
      if (!recovered?.id) {
        await tx.payment.update({
          where: { id: current.id },
          data: {
            status: 'FAILED',
            failureReason: 'PROVIDER_PAYMENT_NOT_FOUND',
          },
        });
        return false;
      }
      current = await this.attachRecoveredPayment(tx, current, recovered);
      if (this.isProviderPaid(recovered.status)) {
        await this.markPaid(tx, charge.id, current.id, recovered.status);
        return true;
      }
      return false;
    }

    const remote = await this.asaas.get<AsaasPayment>(
      '/payments/' + encodeURIComponent(current.providerPaymentId),
    );
    if (this.isProviderPaid(remote.status)) {
      await this.markPaid(tx, charge.id, current.id, remote.status);
      return true;
    }

    // PENDING/OVERDUE do outro método permanece intacto e reutilizável.
    return false;
  }

  private async recoverFailedProviderPayment(
    tx: Prisma.TransactionClient,
    charge: StartChargeRecord,
    billingType: string,
    method: PublicPaymentMethod,
  ): Promise<StartOutcome | null> {
    const failed = charge.payments.find(
      (payment) =>
        payment.billingType === billingType &&
        payment.status === PaymentStatus.FAILED &&
        !payment.providerPaymentId,
    );
    if (!failed) return null;

    let remote: AsaasPayment | null;
    try {
      remote = await this.findProviderPayment(failed.id);
    } catch {
      return { kind: 'provider_error' };
    }
    if (!remote?.id) return null;

    const recovered = await this.attachRecoveredPayment(tx, failed, remote);
    if (this.isProviderPaid(remote.status)) {
      await this.markPaid(tx, charge.id, failed.id, remote.status);
      return { kind: 'success', response: { orderStatus: 'PAID' } };
    }

    await tx.charge.update({
      where: { id: charge.id },
      data: { orderStatus: 'PENDING_PAYMENT', status: remote.status || 'PENDING' },
    });
    return this.completeStartedPayment(tx, charge, recovered, method);
  }

  private async attachRecoveredPayment(
    tx: Prisma.TransactionClient,
    payment: StartPaymentRecord,
    remote: AsaasPayment,
  ): Promise<StartPaymentRecord> {
    const status = this.paymentStatusFromProvider(remote.status);
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        providerPaymentId: remote.id,
        invoiceUrl: remote.invoiceUrl ?? null,
        bankSlipUrl: remote.bankSlipUrl ?? null,
        status,
        failureReason: null,
      },
    });
    return {
      ...payment,
      providerPaymentId: remote.id,
      invoiceUrl: remote.invoiceUrl ?? null,
      status,
    };
  }

  private async ensureAsaasCustomer(
    tx: Prisma.TransactionClient,
    customer: NonNullable<StartChargeRecord['customer']>,
  ): Promise<string> {
    await this.acquireLock(tx, 'customer:' + customer.id);

    const current = await tx.customer.findUnique({
      where: { id: customer.id },
      select: {
        id: true,
        name: true,
        email: true,
        cpfCnpj: true,
        asaasCustomerId: true,
      },
    });
    if (!current) {
      throw new Error('CUSTOMER_NOT_FOUND');
    }
    if (current.asaasCustomerId) {
      return current.asaasCustomerId;
    }

    const externalReferenceResult = await this.asaas.get<AsaasListResponse<{ id: string }>>(
      '/customers?externalReference=' + encodeURIComponent(current.id) + '&limit=1',
    );
    let asaasCustomerId = externalReferenceResult.data?.[0]?.id;

    if (!asaasCustomerId) {
      const byCpf = await this.asaas.get<AsaasListResponse<{ id: string }>>(
        '/customers?cpfCnpj=' + encodeURIComponent(current.cpfCnpj) + '&limit=1',
      );
      asaasCustomerId = byCpf.data?.[0]?.id;
    }

    if (!asaasCustomerId) {
      const created = await this.asaas.post<{ id: string }>('/customers', {
        name: current.name,
        cpfCnpj: current.cpfCnpj,
        ...(current.email ? { email: current.email } : {}),
        externalReference: current.id,
      });
      if (!created?.id) {
        throw new Error('PROVIDER_CUSTOMER_ID_MISSING');
      }
      asaasCustomerId = created.id;
    }

    await tx.customer.update({
      where: { id: current.id },
      data: { asaasCustomerId },
    });
    return asaasCustomerId;
  }

  private buildProviderPayload(
    charge: StartChargeRecord,
    paymentId: string,
    asaasCustomerId: string,
    method: PublicPaymentMethod,
    dueDate: Date,
  ): Record<string, unknown> {
    const split = charge.splits
      .filter((row) => row.calculatedValue != null && Number(row.calculatedValue) > 0)
      .map((row) => {
        if (!row.subaccount.walletId) {
          throw new Error('SPLIT_WALLET_MISSING');
        }
        return {
          walletId: row.subaccount.walletId,
          fixedValue: this.decimalToNumber(row.calculatedValue),
        };
      });

    if (charge.splits.some((row) => row.calculatedValue == null)) {
      throw new Error('LOCKED_SPLIT_VALUE_MISSING');
    }

    const payload: Record<string, unknown> = {
      customer: asaasCustomerId,
      billingType: this.billingTypeFor(method),
      value: this.decimalToNumber(charge.totalAmount),
      dueDate: this.formatAsaasDate(dueDate),
      externalReference: this.externalReference(paymentId),
      split,
    };

    if (charge.description?.trim()) {
      payload.description = charge.description.trim().slice(0, 500);
    }

    if (method === 'CARD') {
      const callbackUrl = this.paymentCallbackSuccessUrl(charge.publicToken);
      if (callbackUrl) {
        payload.callback = {
          successUrl: callbackUrl,
          autoRedirect: true,
        };
      }
    }

    return payload;
  }

  private paymentCallbackSuccessUrl(publicToken: string): string | undefined {
    const configured = this.config
      .get<string>('ASAAS_PAYMENT_CALLBACK_BASE_URL')
      ?.trim();

    // O callback da Asaas e opcional. Nao usamos CHECKOUT_FRONTEND_URL
    // automaticamente porque a Asaas exige que successUrl pertença ao dominio
    // cadastrado nos dados comerciais da conta. Uma URL invalida impede a
    // propria criacao da cobranca. O retorno so e habilitado quando configurado
    // explicitamente no ambiente.
    if (!configured) return undefined;

    try {
      const base = new URL(configured);
      if (base.protocol !== 'https:' && base.protocol !== 'http:') {
        this.logger.warn(
          'ASAAS_PAYMENT_CALLBACK_BASE_URL ignorada por usar protocolo invalido.',
        );
        return undefined;
      }

      base.search = '';
      base.hash = '';
      if (!base.pathname.endsWith('/')) {
        base.pathname += '/';
      }

      return new URL(encodeURIComponent(publicToken), base).toString();
    } catch {
      this.logger.warn(
        'ASAAS_PAYMENT_CALLBACK_BASE_URL ignorada por ser uma URL invalida.',
      );
      return undefined;
    }
  }

  private async findProviderPayment(paymentId: string): Promise<AsaasPayment | null> {
    const response = await this.asaas.get<AsaasListResponse<AsaasPayment>>(
      '/payments?externalReference=' +
        encodeURIComponent(this.externalReference(paymentId)) +
        '&limit=1',
    );
    return response.data?.[0] ?? null;
  }

  private async markPaid(
    tx: Prisma.TransactionClient,
    chargeId: string,
    paymentId: string,
    providerStatus?: string | PaymentStatus,
  ): Promise<void> {
    const status =
      providerStatus === 'RECEIVED' || providerStatus === PaymentStatus.RECEIVED
        ? PaymentStatus.RECEIVED
        : PaymentStatus.CONFIRMED;
    await tx.payment.update({
      where: { id: paymentId },
      data: {
        status,
        paidAt: new Date(),
      },
    });
    await tx.charge.update({
      where: { id: chargeId },
      data: {
        orderStatus: 'PAID',
        status,
      },
    });

    // Se o cliente deixou Pix e cartão abertos, somente o método vencedor
    // continua válido. A limpeza é best-effort aqui; o webhook repete a
    // reconciliação de forma autoritativa caso haja falha transitória.
    await this.cancelAlternativePaymentsAfterPaid(tx, chargeId, paymentId);
  }

  private async cancelAlternativePaymentsAfterPaid(
    tx: Prisma.TransactionClient,
    chargeId: string,
    winnerPaymentId: string,
  ): Promise<void> {
    const alternatives = await tx.payment.findMany({
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
        await tx.payment.update({
          where: { id: alternative.id },
          data: { status: PaymentStatus.CANCELLED },
        });
        continue;
      }

      try {
        const remote = await this.asaas.get<AsaasPayment>(
          '/payments/' + encodeURIComponent(alternative.providerPaymentId),
        );

        if (this.isProviderPaid(remote.status)) {
          const alternativeStatus =
            remote.status === 'RECEIVED'
              ? PaymentStatus.RECEIVED
              : PaymentStatus.CONFIRMED;
          await tx.payment.update({
            where: { id: alternative.id },
            data: {
              status: alternativeStatus,
              paidAt: new Date(),
            },
          });
          this.logger.error(
            'Mais de um método da mesma cobrança foi pago antes da conciliação.',
          );
          continue;
        }

        if (remote.status === 'REFUNDED') {
          await tx.payment.update({
            where: { id: alternative.id },
            data: { status: PaymentStatus.REFUNDED },
          });
          continue;
        }

        await this.asaas.delete<void>(
          '/payments/' + encodeURIComponent(alternative.providerPaymentId),
        );
        await tx.payment.update({
          where: { id: alternative.id },
          data: { status: PaymentStatus.CANCELLED },
        });
      } catch {
        this.logger.error(
          'Falha ao encerrar método alternativo depois da confirmação do pagamento.',
        );
      }
    }
  }

  private async orderStatusAfterAttemptStops(
    tx: Prisma.TransactionClient,
    chargeId: string,
    stoppedPaymentId: string,
  ): Promise<'READY' | 'PENDING_PAYMENT'> {
    const anotherActive = await tx.payment.count({
      where: {
        chargeId,
        id: { not: stoppedPaymentId },
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.OVERDUE],
        },
      },
    });
    return anotherActive > 0 ? 'PENDING_PAYMENT' : 'READY';
  }

  private async toResponse(charge: PublicChargeRecord): Promise<PublicChargeResponseDto> {
    const items: PublicChargeItemDto[] =
      charge.items.length > 0
        ? charge.items.map((item) => ({
            name: item.productName,
            quantity: item.quantity,
            unitPrice: this.decimalToNumber(item.unitPrice),
            lineTotal: this.decimalToNumber(item.lineTotal),
            ...(charge.orderKind === 'PRODUCT'
              ? {
                  fulfillmentType: item.fulfillmentType as PublicFulfillmentType,
                  ...(item.productType
                    ? { productType: item.productType as PublicProductType }
                    : {}),
                }
              : {}),
          }))
        : [
            {
              name: charge.description?.trim() || 'Pagamento',
              quantity: 1,
              unitPrice: this.decimalToNumber(charge.totalAmount ?? charge.value),
              lineTotal: this.decimalToNumber(charge.totalAmount ?? charge.value),
            },
          ];

    const shipments: PublicChargeShipmentDto[] = charge.shipments.map((shipment) => ({
      type: shipment.type as PublicShipmentType,
      shippingAmount: this.decimalToNumber(shipment.shippingAmount),
      ...(shipment.estimatedDaysMin != null
        ? { estimatedDaysMin: shipment.estimatedDaysMin }
        : {}),
      ...(shipment.estimatedDaysMax != null
        ? { estimatedDaysMax: shipment.estimatedDaysMax }
        : {}),
    }));

    const availablePayments = await this.resolveAvailablePayments(charge);
    const activePayment = availablePayments[0];

    return {
      publicToken: charge.publicToken,
      orderStatus: charge.orderStatus as PublicOrderStatus,
      ...(charge.orderKind ? { orderKind: charge.orderKind as PublicOrderKind } : {}),
      customerName: charge.customerName,
      description: charge.description ?? undefined,
      items,
      subtotal: this.decimalToNumber(charge.subtotal),
      discountAmount: this.decimalToNumber(charge.discountAmount),
      shippingAmount: this.decimalToNumber(charge.shippingAmount),
      totalAmount: this.decimalToNumber(charge.totalAmount),
      maxInstallments: charge.maxInstallments,
      shipments,
      expiresAt: charge.expiresAt?.toISOString(),
      availablePayments,
      ...(activePayment ? { activePayment } : {}),
    };
  }

  private async resolveAvailablePayments(
    charge: PublicChargeRecord,
  ): Promise<PublicActivePaymentDto[]> {
    if (charge.orderStatus !== 'PENDING_PAYMENT') return [];

    const byMethod = new Map<
      PublicPaymentMethod,
      PublicChargeRecord['payments'][number]
    >();

    // A ordenacao createdAt DESC permanece util apenas para escolher a
    // tentativa reutilizavel mais recente de CADA metodo. Ela nao decide mais
    // qual tela o cliente esta vendo.
    for (const candidate of charge.payments) {
      if (
        !ACTIVE_PAYMENT_STATUSES.has(candidate.status) &&
        !PAID_PAYMENT_STATUSES.has(candidate.status)
      ) {
        continue;
      }

      const method: PublicPaymentMethod =
        candidate.billingType === 'PIX' ? 'PIX' : 'CARD';
      if (!byMethod.has(method)) {
        byMethod.set(method, candidate);
      }
    }

    const available: PublicActivePaymentDto[] = [];
    for (const payment of byMethod.values()) {
      let pixExpirationDate: string | undefined;
      let pixQrCode = payment.pixQrCode;
      let pixCopyPaste = payment.pixCopyPaste;

      if (payment.billingType === 'PIX' && payment.providerPaymentId) {
        try {
          const pix = await this.asaas.get<AsaasPixQrCode>(
            '/payments/' + encodeURIComponent(payment.providerPaymentId) + '/pixQrCode',
          );
          pixQrCode = pix.encodedImage ?? pixQrCode;
          pixCopyPaste = pix.payload ?? pixCopyPaste;
          pixExpirationDate = pix.expirationDate ?? undefined;
        } catch {
          this.logger.warn(
            'Não foi possível atualizar os dados Pix durante uma leitura pública.',
          );
        }
      }

      available.push(
        this.toPublicPayment(
          { ...payment, pixQrCode, pixCopyPaste },
          pixExpirationDate,
        ),
      );
    }

    if (available.length > 0) return available;

    if (charge.billingType === 'PIX' && (charge.pixQrCode || charge.pixCopiaECola)) {
      return [
        {
          method: 'PIX',
          status: 'PENDING',
          amount: this.decimalToNumber(charge.totalAmount ?? charge.value),
          ...(charge.pixQrCode ? { pixQrCode: charge.pixQrCode } : {}),
          ...(charge.pixCopiaECola ? { pixCopyPaste: charge.pixCopiaECola } : {}),
        },
      ];
    }

    if (
      (charge.billingType === 'CREDIT_CARD' || charge.billingType === 'UNDEFINED') &&
      charge.invoiceUrl
    ) {
      return [
        {
          method: 'CARD',
          status: 'PENDING',
          amount: this.decimalToNumber(charge.totalAmount ?? charge.value),
          invoiceUrl: charge.invoiceUrl,
        },
      ];
    }

    return [];
  }

  private toPublicPayment(
    payment: Pick<
      StartPaymentRecord,
      'billingType' | 'amount' | 'status' | 'invoiceUrl' | 'pixQrCode' | 'pixCopyPaste'
    >,
    pixExpirationDate?: string,
  ): PublicActivePaymentDto {
    const method: PublicPaymentMethod =
      payment.billingType === 'PIX' ? 'PIX' : 'CARD';
    const status = this.publicPaymentStatus(payment.status);

    return {
      method,
      status,
      amount: this.decimalToNumber(payment.amount),
      ...(payment.invoiceUrl ? { invoiceUrl: payment.invoiceUrl } : {}),
      ...(payment.pixQrCode ? { pixQrCode: payment.pixQrCode } : {}),
      ...(payment.pixCopyPaste ? { pixCopyPaste: payment.pixCopyPaste } : {}),
      ...(pixExpirationDate ? { pixExpirationDate } : {}),
    };
  }

  private publicPaymentStatus(status: PaymentStatus): PublicPaymentStatus {
    if (status === PaymentStatus.RECEIVED) return 'RECEIVED';
    if (status === PaymentStatus.CONFIRMED) return 'CONFIRMED';
    if (status === PaymentStatus.OVERDUE) return 'OVERDUE';
    return 'PENDING';
  }

  private paymentStatusFromProvider(status?: string): PaymentStatus {
    if (status === 'RECEIVED') return PaymentStatus.RECEIVED;
    if (status === 'CONFIRMED') return PaymentStatus.CONFIRMED;
    if (status === 'OVERDUE') return PaymentStatus.OVERDUE;
    if (status === 'REFUNDED') return PaymentStatus.REFUNDED;
    return PaymentStatus.PENDING;
  }

  private isProviderPaid(status?: string): boolean {
    return status === 'CONFIRMED' || status === 'RECEIVED';
  }

  private isLocalPaid(status: PaymentStatus): boolean {
    return PAID_PAYMENT_STATUSES.has(status);
  }

  private billingTypeFor(method: PublicPaymentMethod): 'PIX' | 'CREDIT_CARD' {
    return method === 'PIX' ? 'PIX' : 'CREDIT_CARD';
  }

  private resolveDueDate(charge: StartChargeRecord): Date {
    const candidate = charge.expiresAt ?? charge.dueDate;
    if (candidate) return candidate;
    return new Date();
  }

  private formatAsaasDate(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  private externalReference(paymentId: string): string {
    return 'canfy-payment-' + paymentId;
  }

  private decimalToNumber(
    value: Prisma.Decimal | number | null | undefined,
  ): number {
    return value == null ? 0 : Number(value.toString());
  }

  private async acquireLock(
    tx: Prisma.TransactionClient,
    key: string,
  ): Promise<void> {
    // pg_advisory_xact_lock() retorna o tipo PostgreSQL "void". Quando a funcao
    // e selecionada diretamente, o Prisma tenta desserializar essa coluna e
    // falha com P2010 ("Failed to deserialize column of type 'void'").
    // O CTE materializado garante a execucao do lock, mas devolve ao Prisma
    // apenas um inteiro suportado. O lock continua transaction-scoped.
    await tx.$queryRaw(
      Prisma.sql`
        WITH acquired_lock AS MATERIALIZED (
          SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))
        )
        SELECT 1 AS locked
        FROM acquired_lock
      `,
    );
  }

  private assertToken(token: string): void {
    if (!PUBLIC_TOKEN_V4.test(token)) {
      throw new NotFoundException('Cobrança não encontrada');
    }
  }

  private assertPayableTotal(value: Prisma.Decimal | number | null | undefined): void {
    const total = this.decimalToNumber(value);
    if (!Number.isFinite(total) || total <= 0) {
      throw new GoneException('Esta cobrança não está disponível para pagamento');
    }
  }

  private assertChargeAvailable<T extends {
    isActive: boolean;
    orderStatus: string;
    expiresAt: Date | null;
  }>(charge: T | null): asserts charge is T {
    if (!charge || !charge.isActive) {
      throw new NotFoundException('Cobrança não encontrada');
    }
    if (!EXIBIVEL.has(charge.orderStatus as PublicOrderStatus)) {
      throw new GoneException('Esta cobrança não está mais disponível');
    }
    if (
      charge.orderStatus !== 'PAID' &&
      charge.expiresAt &&
      charge.expiresAt.getTime() < Date.now()
    ) {
      throw new GoneException('Este link de pagamento expirou');
    }
  }

  private providerFailureReason(error: unknown): string {
    if (!(error instanceof AsaasApiException)) {
      return 'PROVIDER_REQUEST_FAILED';
    }

    const status = error.providerStatus
      ? 'HTTP_' + error.providerStatus
      : 'TRANSPORT';
    const codes = error.errorCodes
      .slice(0, 3)
      .map((code) =>
        code
          .toUpperCase()
          .replace(/[^A-Z0-9_-]+/g, '_')
          .slice(0, 80),
      )
      .filter(Boolean);

    return (
      'ASAAS_' +
      status +
      (codes.length > 0 ? '_' + codes.join('_') : '')
    ).slice(0, 255);
  }

  private publicProviderError(): ServiceUnavailableException {
    return new ServiceUnavailableException(
      'Não foi possível iniciar o pagamento agora. Tente novamente em alguns instantes.',
    );
  }

  private async compensateProviderPayment(providerPaymentId: string): Promise<void> {
    try {
      await this.asaas.delete<void>(
        '/payments/' + encodeURIComponent(providerPaymentId),
      );
    } catch {
      this.logger.error('Falha ao compensar uma cobrança do provedor após erro local.');
    }
  }
}