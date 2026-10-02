import { Module } from '@nestjs/common';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationReadService } from './integration-read.service';
import { IntegrationScopesGuard } from './integration-scopes.guard';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  controllers: [IntegrationsController, IntegrationApiController],
  providers: [
    IntegrationsService,
    IntegrationReadService,
    IntegrationApiKeyGuard,
    IntegrationScopesGuard,
  ],
  exports: [IntegrationsService, IntegrationApiKeyGuard, IntegrationScopesGuard],
})
export class IntegrationsModule {}
