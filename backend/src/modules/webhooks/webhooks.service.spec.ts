import { ConfigService } from '@nestjs/config';
import { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ENQUEUE_TIMEOUT_MS, WebhooksService } from './webhooks.service';

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

  describe('quando o Redis não responde', () => {
    afterEach(() => jest.useRealTimers());

    const payload = {
      id: 'evt_redis',
      event: 'PAYMENT_OVERDUE',
      payment: {
        id: 'pay_1',
        status: 'OVERDUE',
        value: 99,
        customer: 'cus_1',
        billingType: 'PIX',
      },
    };

    it('responde 200 dentro do tempo limite se queue.add nunca resolve', async () => {
      jest.useFakeTimers();
      const { service, prisma, queue } = makeService();
      prisma.webhookLog.create.mockResolvedValueOnce({ id: 'log_redis' });
      queue.add.mockReturnValueOnce(new Promise(() => undefined));

      const response = service.handleWebhook(payload, webhookToken);
      await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);

      await expect(response).resolves.toEqual({ received: true });
      expect(prisma.webhookLog.create).toHaveBeenCalled();
    });

    it('responde 200 se queue.add rejeita', async () => {
      const { service, prisma, queue } = makeService();
      prisma.webhookLog.create.mockResolvedValueOnce({ id: 'log_redis' });
      queue.add.mockRejectedValueOnce(new Error('connect ECONNREFUSED'));

      await expect(
        service.handleWebhook(payload, webhookToken),
      ).resolves.toEqual({ received: true });
    });

    it('responde 200 para o reenvio de um evento ainda pendente com Redis fora', async () => {
      jest.useFakeTimers();
      const { service, prisma, queue } = makeService();
      prisma.webhookLog.create.mockRejectedValueOnce({ code: 'P2002' });
      prisma.webhookLog.findUnique.mockResolvedValueOnce({
        id: 'log_redis',
        status: 'RECEIVED',
      });
      queue.add.mockReturnValueOnce(new Promise(() => undefined));

      const response = service.handleWebhook(payload, webhookToken);
      await jest.advanceTimersByTimeAsync(ENQUEUE_TIMEOUT_MS);

      await expect(response).resolves.toEqual({
        received: true,
        duplicate: true,
      });
    });

    it('continua recusando token inválido', async () => {
      const { service } = makeService();
      await expect(
        service.handleWebhook(payload, 'token-errado'),
      ).rejects.toThrow('Token de webhook inválido');
    });
  });
});
