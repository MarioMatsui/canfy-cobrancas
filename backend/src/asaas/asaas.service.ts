import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AsaasService {
  private readonly logger = new Logger(AsaasService.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiUrl = this.configService.getOrThrow<string>('ASAAS_API_URL');
    this.apiKey = this.configService.getOrThrow<string>('ASAAS_API_KEY');
  }

  private get headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'User-Agent': 'canfy-app/1.0',
      access_token: this.apiKey,
    };
  }

  // Interpreta o corpo de uma resposta HTTP de forma segura.
  // Endpoints como /accounts/{id}/resendActivationLink retornam 204 No Content
  // (ou, em alguns casos, 200/201 com corpo vazio), e response.json() lançaria
  // um erro de parse nesses casos. Qualquer corpo vazio vira `undefined`.
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

  async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;

    this.logger.debug(`${method} ${url}`);

    const options: RequestInit = {
      method,
      headers: this.headers,
    };

    if (body !== undefined && (method === 'POST' || method === 'PUT')) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await this.parseErrorBody(response);
      this.logger.error(`Asaas API error: ${response.status}`, error);
      throw new HttpException(
        {
          message: 'Erro na comunicação com o Asaas',
          details: error,
        },
        response.status >= 500
          ? HttpStatus.BAD_GATEWAY
          : HttpStatus.BAD_REQUEST,
      );
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

  async requestWithApiKey<T>(method: string, path: string, apiKey: string, body?: unknown): Promise<T> {
    const url = `${this.apiUrl}${path}`;
    this.logger.debug(`${method} ${url} (custom apiKey)`);

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

    const response = await fetch(url, options);

    if (!response.ok) {
      const error = await this.parseErrorBody(response);
      this.logger.error(`Asaas API error: ${response.status}`, error);
      throw new HttpException(
        { message: 'Erro na comunicação com o Asaas', details: error },
        response.status >= 500 ? HttpStatus.BAD_GATEWAY : HttpStatus.BAD_REQUEST,
      );
    }

    return this.parseBody<T>(response);
  }
}
