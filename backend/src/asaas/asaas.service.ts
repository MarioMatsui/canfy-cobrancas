import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const UUID_PATTERN =
  /([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i;
const UUID_EXACT =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class AsaasApiException extends HttpException {
  constructor(
    readonly providerStatus: number | undefined,
    readonly errorCodes: string[] = [],
    /**
     * Textos de `errors[].description` devolvidos pelo Asaas. Servem só para
     * diagnóstico interno (logs e failure_reason); nunca são expostos ao
     * cliente final no corpo HTTP.
     */
    readonly errorDescriptions: string[] = [],
  ) {
    super(
      {
        message: 'Erro na comunicação com o Asaas',
        ...(providerStatus !== undefined ? { providerStatus } : {}),
        ...(errorCodes.length > 0 ? { providerErrorCodes: errorCodes } : {}),
      },
      providerStatus !== undefined && providerStatus < 500
        ? HttpStatus.BAD_REQUEST
        : HttpStatus.BAD_GATEWAY,
    );
  }
}

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;
  private readonly requestTimeoutMs: number;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.getOrThrow<string>('ASAAS_API_URL');
    this.apiKey = this.configService.getOrThrow<string>('ASAAS_API_KEY');
    const configuredTimeout = Number(
      this.configService.get<string>('ASAAS_REQUEST_TIMEOUT_MS', '15000'),
    );
    this.requestTimeoutMs =
      Number.isFinite(configuredTimeout) && configuredTimeout > 0
        ? configuredTimeout
        : 15_000;
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'canfy-app/1.0',
      access_token: this.apiKey,
    };
  }

  private async parseBody<T>(response: Response): Promise<T> {
    if (response.status === 204) {
      return undefined as T;
    }

    const text = await response.text();
    if (!text) {
      return undefined as T;
    }

    return JSON.parse(text) as T;
  }

  private async parseErrorBody(response: Response): Promise<unknown> {
    try {
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch {
      return {};
    }
  }

  private extractErrorCodes(error: unknown): string[] {
    if (!error || typeof error !== 'object') return [];

    const errors = (error as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) return [];

    const codes = errors
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const code = (entry as { code?: unknown }).code;
        if (typeof code !== 'string') return null;

        const sanitized = code
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9._-]+/g, '_')
          .slice(0, 80);

        return sanitized || null;
      })
      .filter((code): code is string => Boolean(code));

    return [...new Set(codes)].slice(0, 5);
  }

  private extractErrorDescriptions(error: unknown): string[] {
    if (!error || typeof error !== 'object') return [];

    const errors = (error as { errors?: unknown }).errors;
    if (!Array.isArray(errors)) return [];

    const descriptions = errors
      .map((entry) => {
        if (!entry || typeof entry !== 'object') return null;
        const description = (entry as { description?: unknown }).description;
        if (typeof description !== 'string') return null;

        // O Asaas pode ecoar dados do cliente na descrição (CPF, e-mail,
        // telefone). Mascaramos e-mails e sequências numéricas longas, removemos
        // caracteres de controle e limitamos o tamanho: é só para diagnóstico.
        // UUIDs (walletId, ids de conta) não são dados pessoais e são
        // essenciais para o diagnóstico (ex.: "wallet ... está bloqueada"),
        // então ficam intactos; só o texto entre eles é mascarado.
        const sanitized = description
          .replace(/[\u0000-\u001f\u007f]+/g, ' ')
          .split(UUID_PATTERN)
          .map((part) =>
            UUID_EXACT.test(part)
              ? part
              : part
                  .replace(/[^\s@]+@[^\s@]+/g, '[email]')
                  .replace(/\d[\d.\-/() ]{3,}\d/g, '[numero]'),
          )
          .join('')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 200);

        return sanitized || null;
      })
      .filter((description): description is string => Boolean(description));

    return [...new Set(descriptions)].slice(0, 3);
  }

  private providerError(
    providerStatus: number,
    error: unknown,
  ): AsaasApiException {
    const codes = this.extractErrorCodes(error);
    // A descrição não vai para o log do processo (pode conter dados do
    // cliente); ela segue mascarada na exceção para quem chamou decidir onde
    // registrá-la (ex.: payments.failure_reason).
    const descriptions = this.extractErrorDescriptions(error);
    this.logger.error(
      'Asaas API error: HTTP ' +
        providerStatus +
        (codes.length > 0 ? ' codes=' + codes.join(',') : ''),
    );
    return new AsaasApiException(providerStatus, codes, descriptions);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
    timeoutMs = this.requestTimeoutMs,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch {
      this.logger.error('Falha de rede ou timeout na comunicação com o Asaas.');
      throw new AsaasApiException(undefined);
    } finally {
      clearTimeout(timer);
    }
  }

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = this.apiUrl + path;
    this.logger.debug(method + ' request to Asaas API');

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await this.fetchWithTimeout(
      url, options,
      method === 'DELETE' && /^\/installments\/[^/]+\/payments$/.test(path)
        ? Math.max(this.requestTimeoutMs, 65_000) : this.requestTimeoutMs,
    );

    if (!response.ok) {
      const error = await this.parseErrorBody(response);
      throw this.providerError(response.status, error);
    }

    return this.parseBody<T>(response);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  async put<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PUT', path, body);
  }

  async delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }

  async requestWithApiKey<T>(
    method: string,
    path: string,
    apiKey: string,
    body?: unknown,
  ): Promise<T> {
    const url = this.apiUrl + path;
    this.logger.debug(method + ' request to Asaas API (custom credential)');

    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        access_token: apiKey,
      },
    };

    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await this.fetchWithTimeout(
      url, options,
      method === 'DELETE' && /^\/installments\/[^/]+\/payments$/.test(path)
        ? Math.max(this.requestTimeoutMs, 65_000) : this.requestTimeoutMs,
    );

    if (!response.ok) {
      const error = await this.parseErrorBody(response);
      throw this.providerError(response.status, error);
    }

    return this.parseBody<T>(response);
  }
}
