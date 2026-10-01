import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedIntegration } from './integrations.service';
import { INTEGRATION_SCOPES_KEY } from './integration-scopes.decorator';
import { IntegrationScope } from './integration-scopes';

type IntegrationRequest = {
  integration?: AuthenticatedIntegration;
};

@Injectable()
export class IntegrationScopesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<IntegrationScope[]>(INTEGRATION_SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!required?.length) return true;

    const request = context.switchToHttp().getRequest<IntegrationRequest>();
    const granted = new Set(request.integration?.scopes ?? []);
    const allowed = required.every((scope) => granted.has(scope));

    if (!allowed) {
      throw new ForbiddenException('Permissão de integração insuficiente');
    }

    return true;
  }
}
