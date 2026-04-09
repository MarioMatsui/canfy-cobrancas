import { Injectable, Logger, ForbiddenException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';

export interface AsaasWebhookPayload {
  event: string;
  payment?: {
    id: string;
    status: string;
    value: number;
    customer: string;
    billingType: string;
  };
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
    if (!token || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(this.webhookSecret))) {
      throw new ForbiddenException('Token de webhook inválido');
    }
  }

  async handleWebhook(payload: AsaasWebhookPayload, token: string | undefined) {
    this.validateToken(token);

    // Loga o evento recebido
    await this.prisma.webhookLog.create({
      data: {
        event: payload.event,
        payload: JSON.parse(JSON.stringify(payload)),
        status: 'RECEIVED',
      },
    });

    // Adiciona na fila para processamento assíncrono
    await this.webhooksQueue.add('process', payload, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
    });

    this.logger.log(`Webhook recebido e enfileirado: ${payload.event}`);
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
}
