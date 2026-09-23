import { PaymentStatus } from '@prisma/client';
import { AsaasService } from '../../asaas/asaas.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { SyncService } from './sync.service';

describe('SyncService new Payment fallback', () => {
  function makePayment(overrides: Record<string, unknown> = {}) {
    return {
      id: 'payment_pix_local',
      chargeId: 'charge_1',
      provider: 'ASAAS',
      providerPaymentId: 'pay_pix',
      billingType: 'PIX',
      amount: 110,
      installments: 1,
      status: PaymentStatus.PENDING,
      invoiceUrl: null,
      bankSlipUrl: null,
      pixQrCode: null,
      pixCopyPaste: null,
      netValue: null,
      failureReason: null,
      dueDate: new Date('2026-09-24T00:00:00.000Z'),
      paidAt: null,
      createdAt: new Date('2026-09-23T00:00:00.000Z'),
      updatedAt: new Date('2026-09-23T00:00:00.000Z'),
      charge: {
        id: 'charge_1',
        orderStatus: 'PENDING_PAYMENT',
        splits: [],
      },
      ...overrides,
    };
  }

  it('marks Charge PAID and cancels the alternative method when polling finds a received Pix', async () => {
    const winner = makePayment();
    const alternative = makePayment({
      id: 'payment_card_local',
      providerPaymentId: 'pay_card',
      billingType: 'CREDIT_CARD',
    });

    const prisma = {
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([winner])
          .mockResolvedValueOnce([alternative]),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      charge: {
        update: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue({ orderStatus: 'PAID' }),
      },
      splitResult: {
        upsert: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) =>
        Promise.all(operations),
      ),
    };

    const asaas = {
      get: jest
        .fn()
        .mockResolvedValueOnce({
          status: 'RECEIVED',
          netValue: 106.5,
          split: [],
        })
        .mockResolvedValueOnce({
          status: 'PENDING',
        }),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const service = new SyncService(
      prisma as unknown as PrismaService,
      asaas as unknown as AsaasService,
    );

    await expect(service.syncNewPayments()).resolves.toBe(1);

    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment_pix_local' },
        data: expect.objectContaining({
          status: PaymentStatus.RECEIVED,
          netValue: 106.5,
        }),
      }),
    );
    expect(prisma.charge.update).toHaveBeenCalledWith({
      where: { id: 'charge_1' },
      data: expect.objectContaining({
        orderStatus: 'PAID',
        status: PaymentStatus.RECEIVED,
      }),
    });
    expect(asaas.delete).toHaveBeenCalledWith('/payments/pay_card');
    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment_card_local' },
      data: { status: PaymentStatus.CANCELLED },
    });
  });

  it('leaves a still-pending provider payment untouched', async () => {
    const payment = makePayment();

    const prisma = {
      payment: {
        findMany: jest.fn().mockResolvedValue([payment]),
      },
    };

    const asaas = {
      get: jest.fn().mockResolvedValue({ status: 'PENDING' }),
    };

    const service = new SyncService(
      prisma as unknown as PrismaService,
      asaas as unknown as AsaasService,
    );

    await expect(service.syncNewPayments()).resolves.toBe(0);
  });
});
