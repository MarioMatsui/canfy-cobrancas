import {
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationsService } from './integrations.service';

function contextWithHeader(value?: string): {
  context: ExecutionContext;
  request: {
    headers: Record<string, string | undefined>;
    integration?: unknown;
  };
} {
  const request = {
    headers: {
      'x-canfy-integration-key': value,
    },
  };

  const context = {
    switchToHttp: () => ({
      getRequest: () => request,
    }),
  } as unknown as ExecutionContext;

  return { context, request };
}

describe('IntegrationApiKeyGuard', () => {
  it('autentica a chave e anexa a integração ao request', async () => {
    const authenticated = {
      id: 'integration-1',
      name: 'MsgDesk',
      scopes: ['products:read'] as const,
    };
    const integrationsService = {
      authenticate: jest.fn().mockResolvedValue(authenticated),
    } as unknown as IntegrationsService;
    const guard = new IntegrationApiKeyGuard(integrationsService);
    const { context, request } = contextWithHeader('canfy_sk_public_secret');

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(integrationsService.authenticate).toHaveBeenCalledWith(
      'canfy_sk_public_secret',
    );
    expect(request.integration).toEqual(authenticated);
  });

  it('retorna 401 quando o header está ausente', async () => {
    const integrationsService = {
      authenticate: jest.fn(),
    } as unknown as IntegrationsService;
    const guard = new IntegrationApiKeyGuard(integrationsService);
    const { context } = contextWithHeader();

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(integrationsService.authenticate).not.toHaveBeenCalled();
  });

  it('propaga 401 para chave inválida ou revogada', async () => {
    const integrationsService = {
      authenticate: jest
        .fn()
        .mockRejectedValue(
          new UnauthorizedException('Credencial de integração inválida'),
        ),
    } as unknown as IntegrationsService;
    const guard = new IntegrationApiKeyGuard(integrationsService);
    const { context } = contextWithHeader('canfy_sk_invalid');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });
});
