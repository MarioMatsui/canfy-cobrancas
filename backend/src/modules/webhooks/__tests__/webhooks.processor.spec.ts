import { Test } from '@nestjs/testing';
import { AsaasService } from '../../../asaas/asaas.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WebhooksProcessor } from '../webhooks.processor';

const D = (value: string) => ({ toString: () => value, valueOf: () => Number(value) }) as any;

describe('WebhooksProcessor', () => {
  let processor: WebhooksProcessor;
  let prisma: any;
  let asaas: { get: jest.Mock };

  const localPayment = {
    id: 'payment-local',
    chargeId: 'charge-1',
    paidAt: null,
    charge: {
      id: 'charge-1',
      orderStatus: 'PENDING_PAYMENT',
      value: D('110.00'),
      splits: [
        {
          subaccountId: 'supplier-1',
          calculatedValue: D('90.00'),
          fixedValue: null,
          percentage: D('70.00'),
          subaccount: { walletId: 'wallet_supplier' },
        },
      ],
    },
  };

  beforeEach(async () => {
    prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(localPayment),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      charge: {
        update: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        findFirst: jest.fn(),
      },
      splitResult: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(0),
      },
      webhookLog: {
        update: jest.fn().mockResolvedValue({}),
      },
      $transaction: jest.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
    };
    asaas = {
      get: jest.fn().mockResolvedValue({
        netValue: 105,
        split: [
          {
            walletId: 'wallet_supplier',
            totalValue: 90,
            fixedValue: 90,
            status: 'DONE',
          },
        ],
      }),
    };

    const mod = await Test.createTestingModule({
      providers: [
        WebhooksProcessor,
        { provide: PrismaService, useValue: prisma },
        { provide: AsaasService, useValue: asaas },
      ],
    }).compile();
    processor = mod.get(WebhooksProcessor);
  });

  it('localiza primeiro por Payment.providerPaymentId e promove Charge para PAID', async () => {
    await processor.handleWebhookEvent({
      data: {
        id: 'evt_confirmed',
        webhookLogId: 'log-1',
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: 'pay_provider',
          status: 'CONFIRMED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
    } as any);

    expect(prisma.payment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          provider: 'ASAAS',
          providerPaymentId: 'pay_provider',
        },
      }),
    );
    expect(prisma.charge.findFirst).not.toHaveBeenCalled();
    expect(prisma.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'payment-local' },
        data: expect.objectContaining({
          status: 'CONFIRMED',
          netValue: 105,
        }),
      }),
    );
    expect(prisma.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'charge-1' },
        data: expect.objectContaining({ orderStatus: 'PAID' }),
      }),
    );
  });

  it('vincula SplitResult ao paymentId e usa o valor efetivo/fallback travado', async () => {
    await processor.handleWebhookEvent({
      data: {
        id: 'evt_received',
        webhookLogId: 'log-2',
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: 'pay_provider',
          status: 'RECEIVED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
    } as any);

    expect(prisma.splitResult.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        chargeId: 'charge-1',
        paymentId: 'payment-local',
        receiverSubaccountId: 'supplier-1',
        value: 90,
        fixedValue: 90,
      }),
    });
  });

  it('nao duplica SplitResult se o processamento for repetido defensivamente', async () => {
    prisma.splitResult.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'split-result-1' });

    const job = {
      data: {
        id: 'evt_received',
        webhookLogId: 'log-3',
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: 'pay_provider',
          status: 'RECEIVED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
    } as any;

    await processor.handleWebhookEvent(job);
    await processor.handleWebhookEvent({
      ...job,
      data: { ...job.data, webhookLogId: 'log-4' },
    });

    expect(prisma.splitResult.create).toHaveBeenCalledTimes(1);
    expect(prisma.splitResult.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'split-result-1' } }),
    );
  });

  it('mapeia PAYMENT_OVERDUE para Payment OVERDUE sem marcar a Charge como paga', async () => {
    await processor.handleWebhookEvent({
      data: {
        id: 'evt_overdue',
        webhookLogId: 'log-5',
        event: 'PAYMENT_OVERDUE',
        payment: {
          id: 'pay_provider',
          status: 'OVERDUE',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
    } as any);

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-local' },
      data: { status: 'OVERDUE' },
    });
    expect(prisma.charge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: { orderStatus: 'PENDING_PAYMENT', status: 'OVERDUE' },
    });
  });

  it('preserva o estado financeiro durante chargeback em disputa', async () => {
    await processor.handleWebhookEvent({
      data: {
        id: 'evt_chargeback',
        webhookLogId: 'log-chargeback',
        event: 'PAYMENT_CHARGEBACK_REQUESTED',
        payment: {
          id: 'pay_provider',
          status: 'CONFIRMED',
          value: 110,
          customer: 'cus_1',
          billingType: 'CREDIT_CARD',
        },
      },
    } as any);

    expect(prisma.webhookLog.update).toHaveBeenCalledWith({
      where: { id: 'log-chargeback' },
      data: { paymentId: 'payment-local' },
    });
    expect(prisma.payment.update).not.toHaveBeenCalled();
    expect(prisma.charge.update).not.toHaveBeenCalled();
  });

  it('mapeia PAYMENT_REFUNDED para REFUNDED', async () => {
    await processor.handleWebhookEvent({
      data: {
        id: 'evt_refund',
        webhookLogId: 'log-6',
        event: 'PAYMENT_REFUNDED',
        payment: {
          id: 'pay_provider',
          status: 'REFUNDED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
    } as any);

    expect(prisma.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-local' },
      data: { status: 'REFUNDED' },
    });
    expect(prisma.charge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: { orderStatus: 'REFUNDED', status: 'REFUNDED' },
    });
  });
});
