import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasService } from './asaas.service';

describe('AsaasService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let debugSpy: jest.SpiedFunction<Logger['debug']>;

  function createService(): AsaasService {
    const config = {
      getOrThrow: jest.fn((key: string) => {
        if (key === 'ASAAS_API_URL') return 'https://sandbox.asaas.com/api/v3';
        if (key === 'ASAAS_API_KEY') return 'primary-secret-key';
        throw new Error('Unexpected config key: ' + key);
      }),
      get: jest.fn((_key: string, fallback?: string) => fallback),
    } as unknown as ConfigService;

    return new AsaasService(config);
  }

  beforeEach(() => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      text: jest.fn().mockResolvedValue(JSON.stringify({ data: [] })),
    } as unknown as Response);
    debugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('nao registra query string nem CPF ao chamar a Asaas', async () => {
    const service = createService();

    await service.get(
      '/customers?cpfCnpj=12345678901&externalReference=customer-sensitive',
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://sandbox.asaas.com/api/v3/customers?cpfCnpj=12345678901&externalReference=customer-sensitive',
      expect.any(Object),
    );
    expect(debugSpy).toHaveBeenCalledWith('GET request to Asaas API');

    const logged = debugSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('12345678901');
    expect(logged).not.toContain('customer-sensitive');
    expect(logged).not.toContain('/customers?');
  });

  it('nao registra chave customizada nem identificador da URL', async () => {
    const service = createService();

    await service.requestWithApiKey(
      'GET',
      '/payments/pay_sensitive_identifier',
      'custom-secret-key',
    );

    expect(debugSpy).toHaveBeenCalledWith(
      'GET request to Asaas API (custom credential)',
    );

    const logged = debugSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('custom-secret-key');
    expect(logged).not.toContain('pay_sensitive_identifier');
    expect(logged).not.toContain('primary-secret-key');
  });
});
