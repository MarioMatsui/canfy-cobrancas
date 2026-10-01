export const INTEGRATION_SCOPES = [
  'products:read',
  'subaccounts:read',
  'doctors:read',
  'charges:create',
  'charges:read',
  'charges:cancel',
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];
