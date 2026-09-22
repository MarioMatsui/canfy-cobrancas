import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PaymentStatus } from '@prisma/client';
import { AsaasService } from '../../../asaas/asaas.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChargesService } from '../charges.service';

describe('ChargesService cancel', () => {
  let service: ChargesService;
  let prisma: any;
  let tx: any;
  let asaas: {
    get: jest.Mock;
    delete: jest.Mock;
  };

  const charge = (overrides: Record<string, unknown> = {}) => ({
    id: 'charge-1',
    asaasId: null,
    orderStatus: 'PENDING_PAYMENT',
    isActive: true,
    payments: [
      {
        id: 'payment-1',
        providerPaymentId: 'pay_1',
        status: PaymentStatus.PENDING,
      },
    ],
    ...overrides,
  });

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      charge: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({
          id: 'charge-1',
          orderStatus: 'CANCELLED',
          isActive: false,
        }),
      },
      payment: {
        update: jest.fn().mockResolvedValue({}),
      },
    };

    prisma = {
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) =>
        callback(tx),
      ),
    };

    asaas = {
      get: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };

    const mod = await Test.createTestingModule({
      providers: [
        ChargesService,
        { provide: PrismaService, useValue: prisma },
        { provide: AsaasService, useValue: asaas },
      ],
    }).compile();

    service = mod.get(ChargesService);
  });

  function mockCharge(value: ReturnType<typeof charge>) {
    tx.charge.findUnique.mockResolvedValue(value);
  }

  it('cancela o Payment novo no Asaas antes de cancelar a Charge', async () => {
    mockCharge(charge());
    asaas.get.mockResolvedValue({ id: 'pay_1', status: 'PENDING' });

    await service.cancel('charge-1');

    expect(tx.$queryRaw).toHaveBeenCalled();
    expect(asaas.get).toHaveBeenCalledWith('/payments/pay_1');
    expect(asaas.delete).toHaveBeenCalledWith('/payments/pay_1');
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: null,
      },
    });
    expect(tx.charge.update).toHaveBeenCalledWith({
      where: { id: 'charge-1' },
      data: {
        orderStatus: 'CANCELLED',
        status: 'CANCELLED',
        isActive: false,
      },
    });
  });

  it('reconcilia tentativa sem providerPaymentId antes do cancelamento', async () => {
    mockCharge(
      charge({
        payments: [
          {
            id: 'payment-orphan',
            providerPaymentId: null,
            status: PaymentStatus.PENDING,
          },
        ],
      }),
    );
    asaas.get.mockResolvedValue({
      data: [{ id: 'pay_recovered', status: 'PENDING' }],
    });

    await service.cancel('charge-1');

    expect(asaas.get).toHaveBeenCalledWith(
      '/payments?externalReference=canfy-payment-payment-orphan&limit=1',
    );
    expect(tx.payment.update).toHaveBeenNthCalledWith(1, {
      where: { id: 'payment-orphan' },
      data: { providerPaymentId: 'pay_recovered' },
    });
    expect(asaas.delete).toHaveBeenCalledWith('/payments/pay_recovered');
    expect(tx.payment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'payment-orphan' },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: null,
      },
    });
  });

  it.each(['CONFIRMED', 'RECEIVED'])(
    'nao cancela se o Asaas ja considera o pagamento %s',
    async (providerStatus) => {
      mockCharge(charge());
      asaas.get.mockResolvedValue({ id: 'pay_1', status: providerStatus });

      await expect(service.cancel('charge-1')).rejects.toThrow(
        BadRequestException,
      );

      expect(asaas.delete).not.toHaveBeenCalled();
      expect(tx.payment.update).not.toHaveBeenCalled();
      expect(tx.charge.update).not.toHaveBeenCalled();
    },
  );

  it('saneia Payment pendente mesmo se a Charge ja estava cancelada pela logica antiga', async () => {
    mockCharge(
      charge({
        orderStatus: 'CANCELLED',
        isActive: false,
      }),
    );
    asaas.get.mockResolvedValue({ id: 'pay_1', status: 'PENDING' });

    await service.cancel('charge-1');

    expect(asaas.get).toHaveBeenCalledWith('/payments/pay_1');
    expect(asaas.delete).toHaveBeenCalledWith('/payments/pay_1');
    expect(tx.payment.update).toHaveBeenCalledWith({
      where: { id: 'payment-1' },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('reconcilia tentativa FAILED sem providerPaymentId antes de cancelar', async () => {
    mockCharge(
      charge({
        orderStatus: 'READY',
        payments: [
          {
            id: 'payment-timeout',
            providerPaymentId: null,
            status: PaymentStatus.FAILED,
          },
        ],
      }),
    );
    asaas.get.mockResolvedValue({
      data: [{ id: 'pay_after_timeout', status: 'PENDING' }],
    });

    await service.cancel('charge-1');

    expect(asaas.get).toHaveBeenCalledWith(
      '/payments?externalReference=canfy-payment-payment-timeout&limit=1',
    );
    expect(asaas.delete).toHaveBeenCalledWith('/payments/pay_after_timeout');
    expect(tx.payment.update).toHaveBeenNthCalledWith(2, {
      where: { id: 'payment-timeout' },
      data: {
        status: PaymentStatus.CANCELLED,
        failureReason: null,
      },
    });
  });

  it('preserva o cancelamento legado por Charge.asaasId', async () => {
    mockCharge(
      charge({
        asaasId: 'legacy_payment',
        orderStatus: 'READY',
        payments: [],
      }),
    );

    await service.cancel('charge-1');

    expect(asaas.delete).toHaveBeenCalledWith('/payments/legacy_payment');
    expect(tx.charge.update).toHaveBeenCalled();
  });
});
