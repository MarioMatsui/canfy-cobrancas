import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export class AsaasApiException extends HttpException {
  constructor(
    readonly providerStatus: number | undefined,
    readonly errorCodes: string[] = [],
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

  private providerError(
    providerStatus: number,
    error: unknown,
  ): AsaasApiException {
    const codes = this.extractErrorCodes(error);
    this.logger.error(
      'Asaas API error: HTTP ' +
        providerStatus +
        (codes.length > 0 ? ' codes=' + codes.join(',') : ''),
    );
    return new AsaasApiException(providerStatus, codes);
  }

  private async fetchWithTimeout(
    url: string,
    options: RequestInit,
  ): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.requestTimeoutMs);

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

    const response = await this.fetchWithTimeout(url, options);

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

    const response = await this.fetchWithTimeout(url, options);

    if (!response.ok) {
      const error = await this.parseErrorBody(response);
      throw this.providerError(response.status, error);
    }

    return this.parseBody<T>(response);
  }
}
