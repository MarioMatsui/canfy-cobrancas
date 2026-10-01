import { SetMetadata } from '@nestjs/common';
import { IntegrationScope } from './integration-scopes';

export const INTEGRATION_SCOPES_KEY = 'integration-scopes';

export const RequireIntegrationScopes = (...scopes: IntegrationScope[]) =>
  SetMetadata(INTEGRATION_SCOPES_KEY, scopes);
