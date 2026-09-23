import { ConfigService } from '@nestjs/config';
import { AsaasService } from '../../asaas/asaas.service';
import { WebhookRegistrationService } from './webhook-registration.service';

describe('WebhookRegistrationService', () => {
  function makeService(values: Record<string, string>) {
    const config = {
      get: jest.fn((key: string, fallback = '') => values[key] ?? fallback),
    } as unknown as ConfigService;

    const asaas = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
    } as unknown as AsaasService;

    return {
      service: new WebhookRegistrationService(config, asaas),
      asaas: asaas as unknown as {
        get: jest.Mock;
        post: jest.Mock;
        put: jest.Mock;
      },
    };
  }

  const baseConfig = {
    ASAAS_WEBHOOK_AUTO_CONFIGURE: 'true',
    ASAAS_WEBHOOK_URL: 'https://cobranca.canfy.com.br/api/webhooks/asaas',
    ASAAS_WEBHOOK_EMAIL: 'operacao@canfy.com.br',
    WEBHOOK_SECRET: 'canfy-webhook-secret-0123456789abcdef',
    ASAAS_API_KEY: '$aact_prod_different_key',
  };

  it('creates the webhook when the account does not have one', async () => {
    const { service, asaas } = makeService(baseConfig);
    asaas.get.mockResolvedValueOnce({ data: [] });
    asaas.post.mockResolvedValueOnce({ id: 'wh_123' });

    await expect(service.ensureConfigured()).resolves.toBe('created');

    expect(asaas.post).toHaveBeenCalledWith(
      '/webhooks',
      expect.objectContaining({
        name: 'CanFy - pagamentos',
        url: 'https://cobranca.canfy.com.br/api/webhooks/asaas',
        email: 'operacao@canfy.com.br',
        enabled: true,
        interrupted: false,
        apiVersion: 3,
        authToken: baseConfig.WEBHOOK_SECRET,
        sendType: 'SEQUENTIALLY',
        events: expect.arrayContaining([
          'PAYMENT_CONFIRMED',
          'PAYMENT_RECEIVED',
        ]),
      }),
    );
  });

  it('updates the existing webhook instead of creating a duplicate', async () => {
    const { service, asaas } = makeService(baseConfig);
    asaas.get.mockResolvedValueOnce({
      data: [
        {
          id: 'wh_existing',
          name: 'CanFy - pagamentos',
          url: 'https://cobranca.canfy.com.br/api/webhooks/asaas',
        },
      ],
    });
    asaas.put.mockResolvedValueOnce({ id: 'wh_existing' });

    await expect(service.ensureConfigured()).resolves.toBe('updated');

    expect(asaas.put).toHaveBeenCalledWith(
      '/webhooks/wh_existing',
      expect.objectContaining({
        enabled: true,
        interrupted: false,
        authToken: baseConfig.WEBHOOK_SECRET,
      }),
    );
    expect(asaas.post).not.toHaveBeenCalled();
  });

  it('does not call Asaas when WEBHOOK_SECRET is invalid', async () => {
    const { service, asaas } = makeService({
      ...baseConfig,
      WEBHOOK_SECRET: 'short',
    });

    await expect(service.ensureConfigured()).resolves.toBe('skipped');

    expect(asaas.get).not.toHaveBeenCalled();
    expect(asaas.post).not.toHaveBeenCalled();
    expect(asaas.put).not.toHaveBeenCalled();
  });
});
