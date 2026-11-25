import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AsaasService } from '../../asaas/asaas.service';

const WEBHOOK_NAME = 'CanFy - pagamentos';

const PAYMENT_EVENTS = [
  'PAYMENT_CONFIRMED',
  'PAYMENT_RECEIVED',
  'PAYMENT_OVERDUE',
  'PAYMENT_REFUNDED',
  'PAYMENT_CHARGEBACK_REQUESTED',
  'PAYMENT_CHARGEBACK_DISPUTE',
  'PAYMENT_AWAITING_CHARGEBACK_REVERSAL',
  'PAYMENT_DELETED',
  'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED',
  'PAYMENT_REPROVED_BY_RISK_ANALYSIS',
  'PAYMENT_RESTORED',
  'PAYMENT_SPLIT_DONE',
] as const;

type AsaasWebhook = {
  id: string;
  name?: string;
  url?: string;
  enabled?: boolean;
  interrupted?: boolean;
  sendType?: string;
  events?: string[];
};

type AsaasWebhookList = {
  data?: AsaasWebhook[];
};

type CommercialInfo = {
  email?: string | null;
};

type WebhookConfiguration = {
  url: string;
  authToken: string;
};

@Injectable()
export class WebhookRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(WebhookRegistrationService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly asaas: AsaasService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.autoConfigureEnabled()) return;

    // Não bloqueia o boot da API por uma chamada externa. A configuração é
    // idempotente e pode ser refeita no próximo restart se o Asaas estiver fora.
    // No boot o PUT é sempre enviado (force) para propagar uma troca de
    // WEBHOOK_SECRET, que o Asaas não devolve na listagem para comparação.
    const timer = setTimeout(() => {
      void this.reconcileConfiguration(true);
    }, 1_500);

    timer.unref();
  }

  @Cron(CronExpression.EVERY_HOUR)
  async reconcileConfiguration(force = false): Promise<void> {
    if (!this.autoConfigureEnabled()) return;

    try {
      await this.ensureConfigured({ force: force === true });
    } catch {
      this.logger.error(
        'Não foi possível garantir a configuração do webhook no Asaas. ' +
          'Uma nova tentativa será feita automaticamente; o sync periódico continua como fallback.',
      );
    }
  }

  async ensureConfigured(
    options: { force?: boolean } = { force: true },
  ): Promise<'skipped' | 'created' | 'updated' | 'unchanged'> {
    if (!this.autoConfigureEnabled()) {
      return 'skipped';
    }

    const desired = this.resolveConfiguration();
    if (!desired) {
      return 'skipped';
    }

    const list = await this.asaas.get<AsaasWebhookList>(
      '/webhooks?offset=0&limit=100',
    );
    const webhooks = list.data ?? [];
    const existing =
      webhooks.find(
        (item) =>
          typeof item.url === 'string' &&
          this.normalizeUrl(item.url) === desired.url,
      ) ??
      webhooks.find((item) => item.name === WEBHOOK_NAME);

    const updatePayload = {
      name: WEBHOOK_NAME,
      url: desired.url,
      enabled: true,
      interrupted: false,
      authToken: desired.authToken,
      sendType: 'SEQUENTIALLY',
      events: [...PAYMENT_EVENTS],
    };

    if (existing?.id) {
      if (!options.force && this.matchesDesired(existing, desired.url)) {
        return 'unchanged';
      }

      if (existing.interrupted === true) {
        // A fila foi pausada pelo Asaas por falhas de entrega. Reativá-la faz o
        // Asaas reenviar o evento da frente da fila; se o endpoint continuar
        // falhando, ela será pausada de novo. Fica registrado para diagnóstico.
        this.logger.warn(
          'A fila do webhook de pagamentos estava pausada (interrupted) no Asaas; reativando. ' +
            'Se voltar a pausar, verifique os Logs de Webhooks no painel do Asaas.',
        );
      }

      await this.asaas.put(
        '/webhooks/' + encodeURIComponent(existing.id),
        updatePayload,
      );
      this.logger.log('Webhook de pagamentos do Asaas verificado/atualizado.');
      return 'updated';
    }

    const email = await this.resolveNotificationEmail();
    if (!email) {
      this.logger.warn(
        'Webhook Asaas não criado: defina ASAAS_WEBHOOK_EMAIL ou cadastre um e-mail comercial na conta.',
      );
      return 'skipped';
    }

    await this.asaas.post('/webhooks', {
      ...updatePayload,
      email,
      apiVersion: 3,
    });

    this.logger.log('Webhook de pagamentos do Asaas criado com sucesso.');
    return 'created';
  }

  private matchesDesired(existing: AsaasWebhook, desiredUrl: string): boolean {
    if (typeof existing.url !== 'string') return false;
    if (this.normalizeUrl(existing.url) !== desiredUrl) return false;
    if (existing.name !== WEBHOOK_NAME) return false;
    if (existing.enabled !== true) return false;
    if (existing.interrupted !== false) return false;
    if (existing.sendType !== 'SEQUENTIALLY') return false;
    if (!Array.isArray(existing.events)) return false;

    const current = new Set(existing.events);
    return (
      current.size === PAYMENT_EVENTS.length &&
      PAYMENT_EVENTS.every((event) => current.has(event))
    );
  }

  private autoConfigureEnabled(): boolean {
    const value = this.config
      .get<string>('ASAAS_WEBHOOK_AUTO_CONFIGURE', 'true')
      .trim()
      .toLowerCase();
    return !['false', '0', 'no', 'off'].includes(value);
  }

  private resolveConfiguration(): WebhookConfiguration | null {
    const authToken = this.config.get<string>('WEBHOOK_SECRET', '').trim();
    const apiKey = this.config.get<string>('ASAAS_API_KEY', '').trim();

    if (
      authToken.length < 32 ||
      authToken.length > 255 ||
      /\s/.test(authToken) ||
      (apiKey && authToken === apiKey)
    ) {
      this.logger.warn(
        'Webhook Asaas não configurado automaticamente: WEBHOOK_SECRET precisa ter 32-255 caracteres, sem espaços, e ser diferente da API key.',
      );
      return null;
    }

    const url = this.resolveWebhookUrl();
    if (!url) {
      this.logger.warn(
        'Webhook Asaas não configurado automaticamente: não há URL pública válida.',
      );
      return null;
    }

    return { url, authToken };
  }

  private resolveWebhookUrl(): string | null {
    const explicit = this.config.get<string>('ASAAS_WEBHOOK_URL', '').trim();
    if (explicit) {
      return this.validatePublicUrl(explicit);
    }

    const frontend = this.config
      .get<string>('FRONTEND_URL', '')
      .split(',')
      .map((value) => value.trim())
      .find(Boolean);

    if (!frontend) return null;

    try {
      const url = new URL(frontend);
      url.pathname = '/api/webhooks/asaas';
      url.search = '';
      url.hash = '';
      return this.validatePublicUrl(url.toString());
    } catch {
      return null;
    }
  }

  private validatePublicUrl(value: string): string | null {
    try {
      const url = new URL(value);
      if (url.protocol !== 'https:') {
        // O Asaas não segue redirecionamentos: uma URL http:// atrás de um
        // nginx que redireciona para https recebe 301 em toda entrega e a
        // fila é penalizada. Só aceitamos https.
        this.logger.warn(
          'URL do webhook Asaas ignorada: use https:// em ASAAS_WEBHOOK_URL/FRONTEND_URL.',
        );
        return null;
      }

      const hostname = url.hostname.toLowerCase();
      if (
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname === '::1'
      ) {
        return null;
      }

      return this.normalizeUrl(url.toString());
    } catch {
      return null;
    }
  }

  private normalizeUrl(value: string): string {
    return value.trim().replace(/\/+$/, '');
  }

  private async resolveNotificationEmail(): Promise<string | null> {
    const configured = this.config.get<string>('ASAAS_WEBHOOK_EMAIL', '').trim();
    if (this.isEmail(configured)) {
      return configured;
    }

    try {
      const info = await this.asaas.get<CommercialInfo>(
        '/myAccount/commercialInfo/',
      );
      const email = info.email?.trim() ?? '';
      return this.isEmail(email) ? email : null;
    } catch {
      this.logger.warn(
        'Não foi possível recuperar o e-mail comercial da conta Asaas para criar o webhook.',
      );
      return null;
    }
  }

  private isEmail(value: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
  }
}
