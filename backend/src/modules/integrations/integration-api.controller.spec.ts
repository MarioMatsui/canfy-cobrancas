import { INTEGRATION_SCOPES_KEY } from './integration-scopes.decorator';
import { IntegrationApiController } from './integration-api.controller';

describe('IntegrationApiController scopes', () => {
  it.each([
    ['createCharge', ['charges:create']],
    ['listCharges', ['charges:read']],
    ['getCharge', ['charges:read']],
    ['listProducts', ['products:read']],
    ['getProduct', ['products:read']],
    ['listSuppliers', ['subaccounts:read']],
    ['getSupplier', ['subaccounts:read']],
    ['listDoctors', ['doctors:read']],
    ['getDoctor', ['doctors:read']],
  ] as const)('%s exige o scope correto', (method, expected) => {
    const handler = IntegrationApiController.prototype[method];
    expect(Reflect.getMetadata(INTEGRATION_SCOPES_KEY, handler)).toEqual(expected);
  });
});
