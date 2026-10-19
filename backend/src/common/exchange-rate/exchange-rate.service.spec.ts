import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { ExchangeRateService } from './exchange-rate.service';

describe('ExchangeRateService', () => {
  const oldFetch = global.fetch;
  let service: ExchangeRateService;
  beforeEach(() => {
    service = new ExchangeRateService({get:jest.fn().mockReturnValue(undefined)} as unknown as ConfigService);
  });
  afterEach(() => {global.fetch = oldFetch; jest.restoreAllMocks();});

  it('aplica R$ 0,03 à cotação ask por dólar sem modificar a cotação de mercado', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, json: async () => ({USDBRL:{ask:'5.2000',timestamp:'1792368000'}}),
    }) as unknown as typeof fetch;
    const quote = await service.getUsdBrlQuote();
    expect(quote.marketRate.toString()).toBe('5.2');
    expect(quote.markup.toString()).toBe('0.03');
    expect(quote.rate.toString()).toBe('5.23');
    expect(quote.rate.mul('100').toDecimalPlaces(2).toFixed(2)).toBe('523.00');
  });

  it('não inventa uma cotação quando o provedor está indisponível', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('provider offline')) as unknown as typeof fetch;
    await expect(service.getUsdBrlQuote()).rejects.toBeInstanceOf(ServiceUnavailableException);
    await expect(service.tryGetUsdBrlQuote()).resolves.toBeNull();
  });
});
