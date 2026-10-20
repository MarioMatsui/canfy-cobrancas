import { PaymentStatus, Prisma } from '@prisma/client';
import { AsaasService } from '../../asaas/asaas.service';
import { PrismaService } from '../../common/prisma/prisma.service';

export type AsaasInstallmentMember = {
  id: string;
  installment?: string | null;
  installmentNumber?: number | null;
  status?: string;
  value?: number;
  netValue?: number;
  split?: Array<{ walletId?: string; totalValue?: number; status?: string }>;
};

type MemberList = { data?: AsaasInstallmentMember[]; hasMore?: boolean };

const paidStatuses = new Set(['CONFIRMED', 'RECEIVED']);

export function memberPaid(status?: string): boolean {
  return paidStatuses.has(status ?? '');
}

/**
 * A cobrança parcelada gera N IDs de payment no Asaas. Nunca concluir
 * a venda após receber confirmação de somente uma dessas parcelas.
 * Também não é seguro marcar splits como liquidados antes do provedor.
 */
export async function getInstallmentMembers(
  asaas: AsaasService,
  installmentId: string,
  expectedCount: number,
): Promise<AsaasInstallmentMember[]> {
  let response = await asaas.get<MemberList>(
    '/installments/' + encodeURIComponent(installmentId) + '/payments',
  );
  // Some Asaas list endpoints paginate. The general payments endpoint
  // explicitly supports limit=100 + the installment filter. Never infer
  // group completeness from only the first page.
  if (response.hasMore || (response.data ?? []).length !== expectedCount) {
    response = await asaas.get<MemberList>(
      '/payments?installment=' + encodeURIComponent(installmentId) + '&limit=100&offset=0',
    );
  }
  const members = response.data ?? [];
  if (
    response.hasMore ||
    members.length !== expectedCount ||
    members.some((item) => !item.id || !item.status || !Number.isFinite(item.value)) ||
    new Set(members.map((item) => item.id)).size !== expectedCount ||
    members.some((member) =>
      member.installmentNumber != null &&
      (!Number.isInteger(member.installmentNumber) ||
        member.installmentNumber < 1 || member.installmentNumber > expectedCount)
    )
  ) {
    throw new Error('ASAAS_INSTALLMENT_MEMBERS_INCOMPLETE');
  }
  return members;
}

function localStatus(status?: string): PaymentStatus {
  if (status === 'CONFIRMED') return PaymentStatus.CONFIRMED;
  if (status === 'RECEIVED') return PaymentStatus.RECEIVED;
  if (status === 'OVERDUE') return PaymentStatus.OVERDUE;
  if (status === 'REFUNDED') return PaymentStatus.REFUNDED;
  if (status === 'DELETED' || status === 'CANCELLED') return PaymentStatus.CANCELLED;
  return PaymentStatus.PENDING;
}

/** Shared by webhook and periodic sync. Idempotent for repeated notifications. */
export async function reconcileInstallmentGroup(
  prisma: PrismaService,
  asaas: AsaasService,
  localPaymentId: string,
): Promise<'PAID' | 'PENDING' | 'REFUNDED'> {
  const payment = await prisma.payment.findUnique({
    where: { id: localPaymentId },
    include: { charge: { include: { splits: { include: { subaccount: true } } } } },
  });
  if (!payment?.providerInstallmentId || payment.installments < 2) {
    throw new Error('INSTALLMENT_GROUP_NOT_FOUND');
  }
  const members = await getInstallmentMembers(
    asaas, payment.providerInstallmentId, payment.installments,
  );
  // Fail closed if the provider sent an incomplete or economically different group.
  const cents = (value: number) => Math.round(value * 100);
  if (members.reduce((sum, item) => sum + cents(item.value!), 0) !== cents(Number(payment.amount))) {
    throw new Error('ASAAS_INSTALLMENT_TOTAL_MISMATCH');
  }

  const allPaid = members.every((member) => memberPaid(member.status));
  const allRefunded = members.every((member) => member.status === 'REFUNDED');
  const anyOverdue = members.some((member) => member.status === 'OVERDUE');

  // PaymentInstallment holds each remote ID, allowing auditing any parcel individually.
  await prisma.$transaction(async (tx) => {
    for (const [index, member] of members.entries()) {
      const installmentNumber = member.installmentNumber ?? index + 1;
      await tx.paymentInstallment.upsert({
        where: { providerPaymentId: member.id },
        create: {
          paymentId: payment.id,
          providerPaymentId: member.id,
          installmentNumber,
          amount: member.value!,
          status: localStatus(member.status),
        },
        update: { status: localStatus(member.status), amount: member.value! },
      });
    }

    if (allPaid) {
      const netValues = members.map((member) => member.netValue);
      const netValue = netValues.every((value) => typeof value === 'number')
        ? netValues.reduce<number>((sum, value) => sum + (value ?? 0), 0)
        : undefined;
      const status = members.every((member) => member.status === 'RECEIVED')
        ? PaymentStatus.RECEIVED : PaymentStatus.CONFIRMED;
      await tx.payment.update({
        where: { id: payment.id },
        data: {
          status, paidAt: payment.paidAt ?? new Date(), failureReason: null,
          ...(netValue !== undefined ? { netValue } : {}),
        },
      });
      await tx.charge.update({
        where: { id: payment.chargeId },
        data: {
          orderStatus: 'PAID', status,
          ...(netValue !== undefined ? { netValue } : {}),
        },
      });

      // Uma subconta pode receber mais de um ChargeSplit (vários produtos).
      // Consolide antes de gravar o resultado da VENDA inteira.
      const totalsByRecipient = new Map<string, {
        walletId: string;
        locked: Prisma.Decimal;
        percentage: Prisma.Decimal | null;
        rows: number;
      }>();
      for (const split of payment.charge.splits) {
        const walletId = split.subaccount.walletId;
        if (!walletId) continue;
        const current = totalsByRecipient.get(split.subaccountId);
        const splitValue = new Prisma.Decimal(split.calculatedValue ?? split.fixedValue ?? 0);
        totalsByRecipient.set(split.subaccountId, {
          walletId,
          locked: (current?.locked ?? new Prisma.Decimal(0)).add(splitValue),
          percentage: current ? null : split.percentage,
          rows: (current?.rows ?? 0) + 1,
        });
      }
      for (const [recipientId, details] of totalsByRecipient) {
        const providerSplits = members
          .map((member) => member.split?.find((row) => row.walletId === details.walletId))
          .filter((row): row is NonNullable<typeof row> => row != null);
        const fullyObserved = providerSplits.length === members.length &&
          providerSplits.every((row) => typeof row.totalValue === 'number');
        const aggregate = fullyObserved
          ? providerSplits.reduce((sum, row) => sum + (row.totalValue ?? 0), 0)
          : Number(details.locked);
        const fullySettled = fullyObserved && providerSplits.every(
          (row) => row.status === 'DONE' || row.status === 'COMPLETED',
        );
        await tx.splitResult.upsert({
          where: {
            paymentId_receiverSubaccountId: {
              paymentId: payment.id, receiverSubaccountId: recipientId,
            },
          },
          create: {
            chargeId: payment.chargeId,
            paymentId: payment.id,
            receiverSubaccountId: recipientId,
            value: new Prisma.Decimal(aggregate).toDecimalPlaces(2),
            fixedValue: details.locked.toDecimalPlaces(2),
            percentage: details.rows === 1 ? details.percentage : null,
            status: fullySettled ? 'COMPLETED' : 'PENDING',
          },
          update: {
            value: new Prisma.Decimal(aggregate).toDecimalPlaces(2),
            status: fullySettled ? 'COMPLETED' : 'PENDING',
          },
        });
      }
    } else if (allRefunded) {
      await tx.payment.update({ where: { id: payment.id }, data: { status: PaymentStatus.REFUNDED } });
      await tx.charge.update({
        where: { id: payment.chargeId }, data: { orderStatus: 'REFUNDED', status: 'REFUNDED' },
      });
    } else if (payment.charge.orderStatus !== 'PAID') {
      // Partial confirmation is not sufficient to release the sale.
      const status = anyOverdue ? PaymentStatus.OVERDUE : PaymentStatus.PENDING;
      await tx.payment.update({ where: { id: payment.id }, data: { status } });
      await tx.charge.update({
        where: { id: payment.chargeId },
        data: { orderStatus: 'PENDING_PAYMENT', status },
      });
    }
  });
  return allPaid ? 'PAID' : allRefunded ? 'REFUNDED' : 'PENDING';
}

/**
 * Never delete only the first installment; that leaves other invoices payable.
 * Use the installment-level deletion API after checking all members.
 */
export async function cancelUnpaidInstallmentGroup(
  asaas: AsaasService,
  groupId: string,
  expectedCount: number,
): Promise<void> {
  const members = await getInstallmentMembers(asaas, groupId, expectedCount);
  if (members.some((member) => memberPaid(member.status))) {
    throw new Error('INSTALLMENT_ALREADY_PAID');
  }
  await asaas.delete<void>(
    '/installments/' + encodeURIComponent(groupId) + '/payments',
  );
}
