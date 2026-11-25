import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasWebhookPayload } from './webhooks.service';
import {
  STALE_CLAIM_MS,
  WEBHOOK_LOG_STATUS,
  WebhooksProcessor,
} from './webhooks.processor';

/** Só recupera eventos que já tiveram tempo de passar pelo worker do Bull. */
export const RECOVERY_MIN_AGE_MS = 2 * 60_000;
export const RECOVERY_BATCH_SIZE = 25;

/**
 * Processa direto do banco os eventos de webhook que ficaram pendentes em
 * webhook_logs (Redis indisponível no recebimento, worker caído, falha
 * transitória). Não depende do Bull/Redis.
 *
 * Os eventos são processados em ordem de chegada e um de cada vez, porque a
 * ordem importa (ex.: OVERDUE seguido de CONFIRMED do mesmo pagamento).
 */
@Injectable()
export class WebhookRecoveryService {
  private readonly logger = new Logger(WebhookRecoveryService.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly processor: WebhooksProcessor,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async recoverPendingEvents(): Promise<void> {
    // Evita duas execuções sobrepostas no mesmo processo se um lote demorar.
    if (this.running) return;
    this.running = true;

    try {
      await this.runOnce();
    } catch {
      this.logger.error('Falha ao buscar webhooks pendentes para recuperação.');
    } finally {
      this.running = false;
    }
  }

  async runOnce(now = new Date()): Promise<{ processed: number; failed: number }> {
    const pending = await this.prisma.webhookLog.findMany({
      where: {
        createdAt: { lt: new Date(now.getTime() - RECOVERY_MIN_AGE_MS) },
        OR: [
          {
            status: {
              in: [WEBHOOK_LOG_STATUS.RECEIVED, WEBHOOK_LOG_STATUS.FAILED],
            },
          },
          {
            status: WEBHOOK_LOG_STATUS.PROCESSING,
            processedAt: { lt: new Date(now.getTime() - STALE_CLAIM_MS) },
          },
          { status: WEBHOOK_LOG_STATUS.PROCESSING, processedAt: null },
        ],
      },
      select: { id: true, payload: true },
      orderBy: { createdAt: 'asc' },
      take: RECOVERY_BATCH_SIZE,
    });

    let processed = 0;
    let failed = 0;

    for (const log of pending) {
      const payload = log.payload as unknown as AsaasWebhookPayload | null;
      if (!payload || typeof payload !== 'object' || typeof payload.event !== 'string') {
        this.logger.error('Webhook pendente com payload inválido; ignorado.');
        continue;
      }

      try {
        const result = await this.processor.processEvent({
          ...payload,
          webhookLogId: log.id,
        });
        if (result === 'processed') processed += 1;
      } catch {
        // processEvent já registrou FAILED/DEAD_LETTER e o contador de
        // tentativas; segue para os próximos eventos.
        failed += 1;
      }
    }

    if (processed > 0 || failed > 0) {
      this.logger.log(
        'Recuperação de webhooks: ' + processed + ' processado(s), ' +
          failed + ' com falha.',
      );
    }

    return { processed, failed };
  }
}
