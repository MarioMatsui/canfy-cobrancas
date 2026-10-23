import { SubaccountsService } from '../subaccounts.service';
describe('subaccount creation idempotency', () => {
  it('blocks a remote request when no idempotency key is supplied', async () => {
    const db: any = { subaccountCreateOperation: {} };
    const remote = { post: jest.fn() };
    const service = new SubaccountsService(db, remote as any);
    await expect(service.create({} as any)).rejects.toThrow('Idempotency-Key');
    expect(remote.post).not.toHaveBeenCalled();
  });
});
