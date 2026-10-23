import { Module } from '@nestjs/common';
import { ChargesModule } from '../charges/charges.module';
import { ProductsModule } from '../products/products.module';
import { IntegrationCatalogController } from './integration-catalog.controller';
import { ExchangeRateModule } from '../../common/exchange-rate/exchange-rate.module';
import { IntegrationApiController } from './integration-api.controller';
import { IntegrationApiKeyGuard } from './integration-api-key.guard';
import { IntegrationReadService } from './integration-read.service';
import { IntegrationWriteService } from './integration-write.service';
import { IntegrationScopesGuard } from './integration-scopes.guard';
import { IntegrationsController } from './integrations.controller';
import { IntegrationsService } from './integrations.service';
import { MedicalPairingService } from './medical-pairing.service';
import { MedicalPairingAdminController, MedicalPairingClaimController } from './medical-pairing.controller';

@Module({
  imports: [ChargesModule, ExchangeRateModule, ProductsModule],
  controllers: [IntegrationsController, IntegrationApiController, IntegrationCatalogController, MedicalPairingAdminController, MedicalPairingClaimController],
  providers: [
    IntegrationsService,
    MedicalPairingService,
    IntegrationReadService,
    IntegrationWriteService,
    IntegrationApiKeyGuard,
    IntegrationScopesGuard,
  ],
  exports: [IntegrationsService, IntegrationApiKeyGuard, IntegrationScopesGuard, MedicalPairingService],
})
export class IntegrationsModule {}
