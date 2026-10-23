export const INTEGRATION_SCOPES = [
  'products:read',
  'catalog:read',
  'subaccounts:read',
  'doctors:read',
  'doctors:admin:read',
  'doctors:admin:write',
  'charges:create',
  'charges:read',
  'charges:cancel',
] as const;

export type IntegrationScope = (typeof INTEGRATION_SCOPES)[number];
