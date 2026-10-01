import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { IntegrationsService, AuthenticatedIntegration } from './integrations.service';

type IntegrationRequest = {
  headers: Record<string, string | string[] | undefined>;
  integration?: AuthenticatedIntegration;
};

@Injectable()
export class IntegrationApiKeyGuard implements CanActivate {
  constructor(private readonly integrationsService: IntegrationsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const header = request.headers['x-canfy-integration-key'];
    const rawKey = Array.isArray(header) ? undefined : header;

    if (!rawKey) {
      throw new UnauthorizedException('Credencial de integração inválida');
    }

    request.integration = await this.integrationsService.authenticate(rawKey);
    return true;
  }
}
