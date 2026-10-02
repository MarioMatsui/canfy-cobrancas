import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';

export type UsdBrlQuote = {
  pair: 'USD-BRL';
  rate: Prisma.Decimal;
  quotedAt: Date;
  source: 'AWESOME_API';
};

type AwesomeApiResponse = {
  USDBRL?: {
    ask?: string;
    timestamp?: string;
  };
};

@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);
  private readonly endpoint = 'https://economia.awesomeapi.com.br/json/last/USD-BRL';

  constructor(private readonly config: ConfigService) {}

  async getUsdBrlQuote(): Promise<UsdBrlQuote> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5_000);

    try {
      const apiKey = this.config.get<string>('AWESOME_API_KEY')?.trim();
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (apiKey) headers['x-api-key'] = apiKey;

      const response = await fetch(this.endpoint, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      if (!response.ok) throw new Error('HTTP ' + response.status);

      const payload = (await response.json()) as AwesomeApiResponse;
      const rawAsk = payload.USDBRL?.ask;
      if (!rawAsk) throw new Error('Resposta sem cotação ask');

      const rate = new Prisma.Decimal(rawAsk);
      if (rate.lte(0)) throw new Error('Cotação ask inválida');

      const timestamp = Number(payload.USDBRL?.timestamp);
      const quotedAt =
        Number.isFinite(timestamp) && timestamp > 0
          ? new Date(timestamp * 1000)
          : new Date();

      return { pair: 'USD-BRL', rate, quotedAt, source: 'AWESOME_API' };
    } catch (error) {
      this.logger.error(
        'Falha ao obter cotação USD/BRL da AwesomeAPI: ' +
          (error instanceof Error ? error.message : String(error)),
      );
      throw new ServiceUnavailableException(
        'Não foi possível obter a cotação USD/BRL agora. Tente novamente antes de criar uma cobrança com produto importado.',
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  async tryGetUsdBrlQuote(): Promise<UsdBrlQuote | null> {
    try {
      return await this.getUsdBrlQuote();
    } catch {
      return null;
    }
  }
}
