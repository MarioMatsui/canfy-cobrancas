import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { WebhooksService } from '../webhooks.service';

describe('WebhooksService', () => {
  let service: WebhooksService;
  let prisma: any;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue({ id: 'payment-local' }),
      },
      webhookLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    queue = { add: jest.fn().mockResolvedValue({}) };

    const mod = await Test.createTestingModule({
      providers: [
        WebhooksService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, fallback?: string) => fallback === '' ? 'secret' : fallback),
          },
        },
        { provide: getQueueToken('webhooks'), useValue: queue },
      ],
    }).compile();

    service = mod.get(WebhooksService);
  });

  it('persiste o id unico do evento e associa o Payment antes de enfileirar', async () => {
    await service.handleWebhook(
      {
        id: 'evt_123',
        event: 'PAYMENT_CONFIRMED',
        payment: {
          id: 'pay_123',
          status: 'CONFIRMED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
      'secret',
    );

    expect(prisma.webhookLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          providerEventId: 'evt_123',
          paymentId: 'payment-local',
          event: 'PAYMENT_CONFIRMED',
        }),
      }),
    );
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        id: 'evt_123',
        webhookLogId: 'log-1',
      }),
      expect.any(Object),
    );
  });

  it('ignora reentrega com providerEventId ja persistido', async () => {
    prisma.webhookLog.create.mockRejectedValue({ code: 'P2002' });

    const result = await service.handleWebhook(
      {
        id: 'evt_duplicate',
        event: 'PAYMENT_RECEIVED',
        payment: {
          id: 'pay_123',
          status: 'RECEIVED',
          value: 110,
          customer: 'cus_1',
          billingType: 'PIX',
        },
      },
      'secret',
    );

    expect(result).toEqual({ received: true, duplicate: true });
    expect(queue.add).not.toHaveBeenCalled();
  });
});
