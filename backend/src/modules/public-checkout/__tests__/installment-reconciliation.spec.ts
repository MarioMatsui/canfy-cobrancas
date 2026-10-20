import { PaymentStatus, Prisma } from '@prisma/client';
import {
  cancelUnpaidInstallmentGroup,
  reconcileInstallmentGroup,
} from '../installment-reconciliation';

const money = (value: string) => new Prisma.Decimal(value);
const four = [
  { id: 'pay-1', installmentNumber: 1, value: 329.41, status: 'CONFIRMED' },
  { id: 'pay-2', installmentNumber: 2, value: 329.41, status: 'PENDING' },
  { id: 'pay-3', installmentNumber: 3, value: 329.41, status: 'PENDING' },
  { id: 'pay-4', installmentNumber: 4, value: 329.42, status: 'PENDING' },
];

function setup() {
  const tx = {
    paymentInstallment: { upsert: jest.fn().mockResolvedValue({}) },
    payment: { update: jest.fn().mockResolvedValue({}) },
    charge: { update: jest.fn().mockResolvedValue({}) },
    splitResult: { upsert: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    payment: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'payment-1', chargeId: 'charge-1',
        providerInstallmentId: 'inst-4', installments: 4,
        amount: money('1317.65'), status: PaymentStatus.PENDING, paidAt: null,
        charge: {
          orderStatus: 'PENDING_PAYMENT',
          splits: [
            {
              subaccountId: 'supplier-1',
              recipientType: 'SUPPLIER',
              calculatedValue: money('1187.37'),
              fixedValue: null, percentage: null,
              subaccount: { walletId: 'wallet_supplier' },
            },
          ],
        },
      }),
    },
    $transaction: jest.fn(async (fn: (transaction: typeof tx) => Promise<void>) => fn(tx)),
  };
  const asaas: any = {
    get: jest.fn().mockResolvedValue({ data: four }),
    delete: jest.fn().mockResolvedValue(undefined),
  };
  return { tx, prisma, asaas };
}

describe('Conciliação de parcelas da Asaas', () => {
  it('não confirma a venda quando só uma das quatro parcelas está confirmada', async () => {
    const { tx, prisma, asaas } = setup();
    expect(await reconcileInstallmentGroup(prisma, asaas, 'payment-1')).toBe('PENDING');
    expect(tx.paymentInstallment.upsert).toHaveBeenCalledTimes(4);
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: PaymentStatus.PENDING } }),
    );
    expect(tx.charge.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderStatus: 'PAID' }) }),
    );
    expect(tx.splitResult.upsert).not.toHaveBeenCalled();
  });

  it('confirma uma única venda depois de conciliar todas as parcelas e mantém split total', async () => {
    const { tx, prisma, asaas } = setup();
    asaas.get.mockResolvedValue({
      data: four.map((member) => ({ ...member, status: 'CONFIRMED' })),
    });
    expect(await reconcileInstallmentGroup(prisma, asaas, 'payment-1')).toBe('PAID');
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderStatus: 'PAID' }) }),
    );
    expect(tx.splitResult.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({
          receiverSubaccountId: 'supplier-1',
          value: money('1187.37'),
          status: 'PENDING',
        }),
      }),
    );
    expect(tx.paymentInstallment.upsert).toHaveBeenCalledTimes(4);
  });

  it('falha sem alterar o pedido quando o grupo retornado está incompleto', async () => {
    const { tx, prisma, asaas } = setup();
    asaas.get.mockResolvedValue({ data: four.slice(0, 3) });
    await expect(reconcileInstallmentGroup(prisma, asaas, 'payment-1'))
      .rejects.toThrow('ASAAS_INSTALLMENT_MEMBERS_INCOMPLETE');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.charge.update).not.toHaveBeenCalled();
  });

  it('não permite apagar apenas uma parcela de grupo com qualquer parcela paga', async () => {
    const { asaas } = setup();
    await expect(cancelUnpaidInstallmentGroup(asaas, 'inst-4', 4))
      .rejects.toThrow('INSTALLMENT_ALREADY_PAID');
    expect(asaas.delete).not.toHaveBeenCalled();
  });

  it('cancela o grupo inteiro quando todas as parcelas estão pendentes', async () => {
    const { asaas } = setup();
    asaas.get.mockResolvedValue({
      data: four.map((member) => ({ ...member, status: 'PENDING' })),
    });
    await cancelUnpaidInstallmentGroup(asaas, 'inst-4', 4);
    expect(asaas.delete).toHaveBeenCalledWith('/installments/inst-4/payments');
    expect(asaas.delete).toHaveBeenCalledTimes(1);
  });
});
