import { Module } from '@nestjs/common';
import { IntegrationsController } from './integrations.controller';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationScopesGuard } from './integration-scopes.guard';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController],
  providers: [IntegrationsService, IntegrationApiKeyGuard, IntegrationScopesGuard],
  exports: [IntegrationsService, IntegrationApiKeyGuard, IntegrationScopesGuard],
})
export class IntegrationsModule {}
