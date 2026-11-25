import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';

/** Tempo máximo para o Redis aceitar o job antes de responder ao Asaas. */
export const ENQUEUE_TIMEOUT_MS = 3_000;

export interface AsaasWebhookPayload {
  id?: string;
  event: string;
  payment?: {
    id: string;
    installment?: string | null;
    status: string;
    value: number;
    customer: string;
    billingType: string;
  };
}

export interface QueuedAsaasWebhookPayload extends AsaasWebhookPayload {
  webhookLogId: string;
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly webhookSecret: string;

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
    @InjectQueue('webhooks') private webhooksQueue: Queue,
  ) {
    this.webhookSecret = this.configService.get<string>('WEBHOOK_SECRET', '');
  }

  validateToken(token: string | undefined): void {
    if (!this.webhookSecret || this.webhookSecret === 'your_webhook_secret_here') {
      throw new ForbiddenException('WEBHOOK_SECRET não configurado');
    }
    if (!token) {
      throw new ForbiddenException('Token de webhook ausente');
    }
    const tokenBuf = Buffer.from(token);
    const secretBuf = Buffer.from(this.webhookSecret);
    if (
      tokenBuf.length !== secretBuf.length ||
      !crypto.timingSafeEqual(tokenBuf, secretBuf)
    ) {
      throw new ForbiddenException('Token de webhook inválido');
    }
  }

  async handleWebhook(payload: AsaasWebhookPayload, token: string | undefined) {
    this.validateToken(token);

    const payment = payload.payment?.id
      ? await this.prisma.payment.findFirst({
          where: { provider: 'ASAAS', providerPaymentId: payload.payment.id },
          select: { id: true },
        })
      : null;

    let log: { id: string };
    try {
      log = await this.prisma.webhookLog.create({
        data: {
          provider: 'ASAAS',
          providerEventId: payload.id ?? null,
          event: payload.event,
          payload: JSON.parse(JSON.stringify(payload)),
          status: 'RECEIVED',
          paymentId: payment?.id ?? null,
        },
        select: { id: true },
      });
    } catch (error) {
      const code =
        typeof error === 'object' && error !== null && 'code' in error
          ? String((error as { code?: unknown }).code)
          : '';

      if (payload.id && code === 'P2002') {
        const existing = await this.prisma.webhookLog.findUnique({
          where: { providerEventId: payload.id },
          select: { id: true, status: true },
        });

        // Se a primeira entrega persistiu no banco, mas falhou antes de entrar
        // na fila, uma repetição do mesmo evento precisa tentar enfileirar de
        // novo. O jobId estável impede duas execuções simultâneas.
        if (existing && existing.status !== 'PROCESSED') {
          await this.enqueueWebhook(payload, existing.id);
        }

        this.logger.log('Webhook duplicado recebido com idempotência.');
        return { received: true, duplicate: true };
      }
      throw error;
    }

    const queued = await this.enqueueWebhook(payload, log.id);

    this.logger.log(
      queued
        ? 'Webhook recebido e enfileirado: ' + payload.event
        : 'Webhook recebido e persistido; será processado pela recuperação periódica: ' +
            payload.event,
    );
    return { received: true };
  }

  async getLogs(page = 1, limit = 50) {
    const skip = (page - 1) * limit;
    const [data, total] = await Promise.all([
      this.prisma.webhookLog.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.webhookLog.count(),
    ]);
    return { data, total, page, limit };
  }

  /**
   * Tenta colocar o evento na fila do Bull (Redis) sem nunca travar nem
   * derrubar a resposta ao Asaas.
   *
   * A fila de webhooks do Asaas é sequencial: se este endpoint demora (408)
   * ou falha (500), o mesmo evento é reenviado indefinidamente e todos os
   * eventos seguintes ficam bloqueados até a fila ser pausada. Como o evento
   * já está gravado em webhook_logs antes daqui, é seguro responder 200 mesmo
   * se o Redis estiver indisponível: WebhookRecoveryService processa direto do
   * banco os logs que ficarem pendentes.
   */
  private async enqueueWebhook(
    payload: AsaasWebhookPayload,
    webhookLogId: string,
  ): Promise<boolean> {
    const queuedPayload: QueuedAsaasWebhookPayload = {
      ...payload,
      webhookLogId,
    };

    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error('WEBHOOK_ENQUEUE_TIMEOUT')),
        ENQUEUE_TIMEOUT_MS,
      );
      timer.unref?.();
    });

    const add = this.webhooksQueue.add('process', queuedPayload, {
      jobId: payload.id
        ? 'asaas:' + payload.id
        : 'asaas-log:' + webhookLogId,
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: true,
      removeOnFail: true,
    });
    // Se o timeout vencer, a promessa original pode rejeitar depois; evita
    // "unhandled rejection" sem esconder o erro (já logado abaixo).
    add.catch(() => undefined);

    try {
      await Promise.race([add, timeout]);
      return true;
    } catch (error) {
      const reason =
        error instanceof Error && error.message === 'WEBHOOK_ENQUEUE_TIMEOUT'
          ? 'timeout de ' + ENQUEUE_TIMEOUT_MS + 'ms'
          : error instanceof Error
            ? error.name + ': ' + error.message.slice(0, 200)
            : 'erro desconhecido';
      this.logger.error(
        'Não foi possível enfileirar o webhook no Redis (' +
          reason +
          '). Evento mantido em webhook_logs para recuperação.',
      );
      return false;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
