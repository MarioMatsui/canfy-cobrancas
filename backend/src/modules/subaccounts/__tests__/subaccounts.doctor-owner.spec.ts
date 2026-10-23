import { BadRequestException, ConflictException } from '@nestjs/common';
import { AsaasApiException } from '../../../asaas/asaas.service';
import { SubaccountsService } from '../subaccounts.service';

const localAccount = {
  id:'subaccount-local-1',asaasId:'acc_1234567890',walletId:'wallet_1234567890',
  name:'Maria Silva',cpfCnpj:'52998224725',email:'maria@example.com',
  type:'DOCTOR',active:true,deletedAt:null,apiKey:null,
};
describe('parent-owned Asaas medical account linking', () => {
  let db:any,provider:any,service:SubaccountsService;
  beforeEach(()=>{
    db={subaccount:{
      findFirst:jest.fn().mockResolvedValue(null),
      create:jest.fn().mockResolvedValue({...localAccount}),
    }};
    provider={get:jest.fn().mockResolvedValue({
      id:localAccount.asaasId,walletId:localAccount.walletId,
      name:localAccount.name,cpfCnpj:localAccount.cpfCnpj,email:localAccount.email,
    })};
    service=new SubaccountsService(db,provider);
  });
  it('uses only the account returned from authenticated parent Asaas API',async()=>{
    const out=await service.linkManagedDoctorAccount('acc_1234567890');
    expect(provider.get).toHaveBeenCalledWith('/accounts/acc_1234567890');
    expect(db.subaccount.create).toHaveBeenCalledWith({data:expect.objectContaining({
      asaasId:localAccount.asaasId,walletId:localAccount.walletId,type:'DOCTOR',
    })});
    expect(out).not.toHaveProperty('apiKey');
  });
  it('recovers a parent-owned walletId through paginated list only after 404',async()=>{
    provider.get.mockRejectedValueOnce(new AsaasApiException(404));
    provider.get.mockResolvedValueOnce({data:[{
      id:localAccount.asaasId,walletId:localAccount.walletId,name:localAccount.name,
      cpfCnpj:localAccount.cpfCnpj,email:localAccount.email,
    }],hasMore:false});
    const out=await service.linkManagedDoctorAccount(localAccount.walletId);
    expect(out.asaasId).toBe(localAccount.asaasId);
    expect(provider.get).toHaveBeenCalledWith('/accounts?offset=0&limit=100');
  });
  it('does not invent external wallet metadata if parent Asaas cannot verify it',async()=>{
    provider.get.mockRejectedValueOnce(new AsaasApiException(404));
    provider.get.mockResolvedValueOnce({data:[],hasMore:false});
    await expect(service.linkManagedDoctorAccount('wallet_external111')).rejects.toBeInstanceOf(BadRequestException);
    expect(db.subaccount.create).not.toHaveBeenCalled();
  });
  it('returns existing same-owner medical subaccount without creating duplicate',async()=>{
    db.subaccount.findFirst.mockResolvedValue({...localAccount});
    const out=await service.linkManagedDoctorAccount('acc_1234567890');
    expect(out.id).toBe(localAccount.id);
    expect(db.subaccount.create).not.toHaveBeenCalled();
  });
  it('rejects existing wallet linked to different account owner',async()=>{
    db.subaccount.findFirst.mockResolvedValue({...localAccount,cpfCnpj:'12345678901'});
    await expect(service.linkManagedDoctorAccount('acc_1234567890')).rejects.toBeInstanceOf(ConflictException);
    expect(db.subaccount.create).not.toHaveBeenCalled();
  });
  it('fails closed when provider request errors beyond not-found',async()=>{
    provider.get.mockRejectedValueOnce(new AsaasApiException(403));
    await expect(service.linkManagedDoctorAccount('acc_1234567890')).rejects.toBeInstanceOf(AsaasApiException);
    expect(db.subaccount.create).not.toHaveBeenCalled();
  });
});
