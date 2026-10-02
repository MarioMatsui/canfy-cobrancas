import { Module } from '@nestjs/common';
import { ChargesModule } from '../charges/charges.module';
import { ExchangeRateModule } from '../../common/exchange-rate/exchange-rate.module';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationReadService } from './integration-read.service';
import { IntegrationWriteService } from './integration-write.service';
import { IntegrationScopesGuard } from './integration-scopes.guard';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';

@Module({
  imports: [ChargesModule, ExchangeRateModule],
  controllers: [IntegrationsController, IntegrationApiController],
  providers: [
    IntegrationsService,
    IntegrationReadService,
    IntegrationWriteService,
    IntegrationApiKeyGuard,
    IntegrationScopesGuard,
  ],
  exports: [IntegrationsService, IntegrationApiKeyGuard, IntegrationScopesGuard],
})
export class IntegrationsModule {}
