import { SubaccountsService } from '../subaccounts.service';

const key = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const dto: any = {
  name: 'Fixture', cpfCnpj: '00000000000', type: 'DOCTOR',
  email: 'fixture@example.invalid', mobilePhone: '00000000000',
  postalCode: '00000000', address: 'Fixture', addressNumber: '0',
  province: 'Fixture', incomeValue: 100,
};

describe('subaccount creation idempotency', () => {
  it('blocks remote POST without a client idempotency key', async () => {
    const db: any = { subaccountCreateOperation: {} };
    const remote = { post: jest.fn() };
    const service = new SubaccountsService(db, remote as any);
    await expect(service.create(dto)).rejects.toThrow('Idempotency-Key');
    expect(remote.post).not.toHaveBeenCalled();
  });

  it('never sends a second remote POST after a timeout', async () => {
    const stored: any = {
      id: 'op1', status: 'NEEDS_RECONCILIATION',
      localSubaccountId: null,
    };
    const db: any = {
      subaccountCreateOperation: {
        findUnique: jest.fn().mockResolvedValueOnce(null).mockImplementation(async () => stored),
        create: jest.fn().mockImplementation(async ({data}: any) => {
          stored.requestHash = data.requestHash;
          return { id: 'op1' };
        }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const remote = { post: jest.fn().mockRejectedValue(new Error('timeout')) };
    const service = new SubaccountsService(db, remote as any);
    await expect(service.create(dto, key)).rejects.toThrow();
    await expect(service.create(dto, key)).rejects.toThrow();
    expect(remote.post).toHaveBeenCalledTimes(1);
    expect(db.subaccountCreateOperation.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({
        status: 'NEEDS_RECONCILIATION',
      }) }),
    );
  });
});
