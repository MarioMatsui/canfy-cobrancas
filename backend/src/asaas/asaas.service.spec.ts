import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AsaasApiException, AsaasService } from './asaas.service';

describe('AsaasService', () => {
  let fetchSpy: jest.SpiedFunction<typeof fetch>;
  let debugSpy: jest.SpiedFunction<Logger['debug']>;
  let errorSpy: jest.SpiedFunction<Logger['error']>;

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
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
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

  it('preserva status e codigos de validacao do Asaas sem registrar o corpo inteiro', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          errors: [
            {
              code: 'invalid_callback',
              description: 'A URL informada nao pertence ao dominio cadastrado',
            },
          ],
        }),
      ),
    } as unknown as Response);

    const service = createService();

    let thrown: unknown;
    try {
      await service.post('/payments', { billingType: 'CREDIT_CARD' });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(AsaasApiException);
    expect((thrown as AsaasApiException).providerStatus).toBe(400);
    expect((thrown as AsaasApiException).errorCodes).toEqual(['invalid_callback']);
    expect(errorSpy).toHaveBeenCalledWith(
      'Asaas API error: HTTP 400 codes=invalid_callback',
    );

    expect((thrown as AsaasApiException).errorDescriptions).toEqual([
      'A URL informada nao pertence ao dominio cadastrado',
    ]);

    const logged = errorSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('A URL informada');
    expect(logged).not.toContain('primary-secret-key');
  });

  it('preserva o walletId na descricao de split bloqueado', async () => {
    const description =
      'Não é possível fazer split para wallet [b0e47e47-c959-4957-bc72-b10a2a33baf5], ' +
      'pois a mesma está bloqueada. Favor entrar em contato com o Suporte Técnico.';
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({ errors: [{ code: 'invalid_action', description }] }),
      ),
    } as unknown as Response);

    const thrown = await createService()
      .post('/payments', { billingType: 'PIX' })
      .catch((error: unknown) => error);

    expect((thrown as AsaasApiException).errorDescriptions).toEqual([
      description.slice(0, 200),
    ]);
    expect((thrown as AsaasApiException).errorDescriptions[0]).toContain(
      'b0e47e47-c959-4957-bc72-b10a2a33baf5',
    );
  });

  it('mascara CPF, telefone e e-mail na descricao do erro do Asaas', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: jest.fn().mockResolvedValue(
        JSON.stringify({
          errors: [
            {
              code: 'invalid_action',
              description:
                'Cliente 123.456.789-01 (fulano@exemplo.com, (11) 98765-4321)\nnao pode receber cobrancas.',
            },
          ],
        }),
      ),
    } as unknown as Response);

    const service = createService();
    const thrown = await service
      .post('/payments', { billingType: 'PIX' })
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(AsaasApiException);
    const [description] = (thrown as AsaasApiException).errorDescriptions;
    expect(description).toContain('nao pode receber cobrancas.');
    expect(description).not.toMatch(/123|789|98765|4321/);
    expect(description).not.toContain('fulano@exemplo.com');
    expect(description).not.toContain('\n');
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
