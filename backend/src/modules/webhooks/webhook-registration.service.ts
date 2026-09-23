import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
] as const;

type AsaasWebhook = {
  id: string;
  name?: string;
  url?: string;
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
    const timer = setTimeout(() => {
      void this.ensureConfigured().catch(() => {
        this.logger.error(
          'Não foi possível garantir a configuração do webhook no Asaas. ' +
            'O sync periódico continuará como fallback.',
        );
      });
    }, 1_500);

    timer.unref();
  }

  async ensureConfigured(): Promise<'skipped' | 'created' | 'updated'> {
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
      if (url.protocol !== 'https:' && url.protocol !== 'http:') {
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
