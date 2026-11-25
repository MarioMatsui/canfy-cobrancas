import { PrismaService } from '../../../common/prisma/prisma.service';
import {
  RECOVERY_MIN_AGE_MS,
  WebhookRecoveryService,
} from '../webhook-recovery.service';
import { WebhooksProcessor } from '../webhooks.processor';

describe('WebhookRecoveryService', () => {
  function makeService(logs: Array<{ id: string; payload: unknown }>) {
    const prisma = {
      webhookLog: { findMany: jest.fn().mockResolvedValue(logs) },
    };
    const processor = { processEvent: jest.fn().mockResolvedValue('processed') };
    return {
      service: new WebhookRecoveryService(
        prisma as unknown as PrismaService,
        processor as unknown as WebhooksProcessor,
      ),
      prisma,
      processor,
    };
  }

  const overdue = {
    id: 'evt_old',
    event: 'PAYMENT_OVERDUE',
    payment: { id: 'pay_1', status: 'OVERDUE', value: 99, customer: 'cus_1', billingType: 'PIX' },
  };

  it('busca pendentes antigos em ordem de chegada e processa cada um com o id do log', async () => {
    const { service, prisma, processor } = makeService([
      { id: 'log_1', payload: overdue },
      { id: 'log_2', payload: { ...overdue, id: 'evt_2', event: 'PAYMENT_RECEIVED' } },
    ]);
    const now = new Date('2026-11-25T20:00:00Z');

    await expect(service.runOnce(now)).resolves.toEqual({ processed: 2, failed: 0 });

    const query = prisma.webhookLog.findMany.mock.calls[0][0];
    expect(query.orderBy).toEqual({ createdAt: 'asc' });
    expect(query.where.createdAt).toEqual({
      lt: new Date(now.getTime() - RECOVERY_MIN_AGE_MS),
    });
    expect(JSON.stringify(query.where.OR)).toContain('RECEIVED');
    expect(JSON.stringify(query.where.OR)).toContain('FAILED');
    expect(JSON.stringify(query.where.OR)).not.toContain('DEAD_LETTER');

    expect(processor.processEvent.mock.calls.map((call) => call[0].webhookLogId)).toEqual([
      'log_1',
      'log_2',
    ]);
    expect(processor.processEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'PAYMENT_OVERDUE', webhookLogId: 'log_1' }),
    );
  });

  it('continua o lote quando um evento falha', async () => {
    const { service, processor } = makeService([
      { id: 'log_1', payload: overdue },
      { id: 'log_2', payload: overdue },
    ]);
    processor.processEvent.mockRejectedValueOnce(new Error('boom'));

    await expect(service.runOnce()).resolves.toEqual({ processed: 1, failed: 1 });
    expect(processor.processEvent).toHaveBeenCalledTimes(2);
  });

  it('ignora payload invalido sem derrubar o lote', async () => {
    const { service, processor } = makeService([
      { id: 'log_bad', payload: null },
      { id: 'log_ok', payload: overdue },
    ]);

    await expect(service.runOnce()).resolves.toEqual({ processed: 1, failed: 0 });
    expect(processor.processEvent).toHaveBeenCalledTimes(1);
  });

  it('nao sobrepoe execucoes do cron', async () => {
    const { service, prisma } = makeService([]);
    let release: () => void = () => undefined;
    prisma.webhookLog.findMany.mockReturnValueOnce(
      new Promise((resolve) => {
        release = () => resolve([]);
      }),
    );

    const first = service.recoverPendingEvents();
    await service.recoverPendingEvents();
    release();
    await first;

    expect(prisma.webhookLog.findMany).toHaveBeenCalledTimes(1);
  });
});
