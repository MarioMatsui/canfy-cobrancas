import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  const webhookToken = 'x'.repeat(40);

  function makeService() {
    const prisma = {
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      webhookLog: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };

    const config = {
      get: jest.fn((key: string, fallback = '') =>
        key === 'WEBHOOK_SECRET' ? webhookToken : fallback,
      ),
    };

    const queue = {
      add: jest.fn().mockResolvedValue({ id: 'job_1' }),
    };

    return {
      service: new WebhooksService(
        prisma as unknown as PrismaService,
        config as unknown as ConfigService,
        queue as unknown as Queue,
      ),
      prisma,
      queue,
    };
  }

  it('requeues an unprocessed duplicate after a previous queueing failure', async () => {
    const { service, prisma, queue } = makeService();

    prisma.webhookLog.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.webhookLog.findUnique.mockResolvedValueOnce({
      id: 'log_1',
      status: 'RECEIVED',
    });

    await expect(
      service.handleWebhook(
        {
          id: 'evt_1',
          event: 'PAYMENT_RECEIVED',
          payment: {
            id: 'pay_1',
            status: 'RECEIVED',
            value: 110,
            customer: 'cus_1',
            billingType: 'PIX',
          },
        },
        webhookToken,
      ),
    ).resolves.toEqual({ received: true, duplicate: true });

    expect(queue.add).toHaveBeenCalledWith(
      'process',
      expect.objectContaining({
        id: 'evt_1',
        webhookLogId: 'log_1',
      }),
      expect.objectContaining({
        jobId: 'asaas:evt_1',
        attempts: 3,
        removeOnFail: true,
      }),
    );
  });

  it('does not enqueue a duplicate that was already processed', async () => {
    const { service, prisma, queue } = makeService();

    prisma.webhookLog.create.mockRejectedValueOnce({ code: 'P2002' });
    prisma.webhookLog.findUnique.mockResolvedValueOnce({
      id: 'log_1',
      status: 'PROCESSED',
    });

    await expect(
      service.handleWebhook(
        {
          id: 'evt_1',
          event: 'PAYMENT_RECEIVED',
        },
        webhookToken,
      ),
    ).resolves.toEqual({ received: true, duplicate: true });

    expect(queue.add).not.toHaveBeenCalled();
  });
});
