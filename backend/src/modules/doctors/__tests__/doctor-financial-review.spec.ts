import { ConflictException } from '@nestjs/common';
import { DoctorsService } from '../doctors.service';

const key='84b5a143-58ba-46d9-8511-73136ee45911';
describe('audited physician financial ownership review',()=>{
 let db:any,tx:any,service:DoctorsService;
 beforeEach(()=>{
  const subaccount={id:'sub-1',type:'DOCTOR',active:true,deletedAt:null,
   walletId:'wallet_1',asaasId:'acc_123'};
  const link={id:'link-1',doctorId:'doctor-1',status:'PENDING_REVIEW',active:true,subaccount};
  tx={
   doctor:{findUnique:jest.fn().mockResolvedValue({accessActive:false})},
   doctorFinancialLink:{
    findUnique:jest.fn().mockResolvedValue(link),findFirst:jest.fn().mockResolvedValue(null),
    updateMany:jest.fn().mockResolvedValue({count:1}),
   },
   doctorProvisioningOperation:{
    create:jest.fn().mockResolvedValue({id:'op'}),
    update:jest.fn().mockResolvedValue({id:'op'}),
   },
  };
  db={
   doctorProvisioningOperation:{findUnique:jest.fn().mockResolvedValue(null)},
   $transaction:jest.fn().mockImplementation(async (fn:(ctx:any)=>Promise<unknown>)=>fn(tx)),
  };
  service=new DoctorsService(db);
  jest.spyOn(service,'detail').mockResolvedValue({id:'doctor-1'} as never);
 });
 it('approves verified parent account with an actor and evidence log',async()=>{
  await service.reviewFinancialLink('doctor-1','link-1',{
   decision:'VERIFIED',evidenceReference:'protocolo-interno-123',
  },key,'admin-1');
  expect(tx.doctorProvisioningOperation.create).toHaveBeenCalledWith({
   data:expect.objectContaining({
    kind:'FINANCIAL_REVIEW',actorUserId:'admin-1',evidenceReference:'protocolo-interno-123',
   }),
  });
  expect(tx.doctorFinancialLink.updateMany).toHaveBeenCalledWith(
   expect.objectContaining({data:expect.objectContaining({status:'VERIFIED'})}),
  );
 });
 it('refuses to endorse synthetic wallet IDs',async()=>{
  tx.doctorFinancialLink.findUnique.mockResolvedValue({
   id:'link-1',doctorId:'doctor-1',status:'PENDING_REVIEW',active:true,
   subaccount:{id:'sub-1',type:'DOCTOR',active:true,deletedAt:null,
    walletId:'wallet_1',asaasId:'external_wallet_1'},
  });
  await expect(service.reviewFinancialLink('doctor-1','link-1',{
   decision:'VERIFIED',evidenceReference:'protocolo-interno-123',
  },key,'admin-1')).rejects.toThrow(ConflictException);
  expect(tx.doctorProvisioningOperation.create).not.toHaveBeenCalled();
 });
 it('refuses financial revocation while the doctor has active clinical access',async()=>{
  tx.doctor.findUnique.mockResolvedValue({accessActive:true});
  await expect(service.reviewFinancialLink('doctor-1','link-1',{
   decision:'REJECTED',evidenceReference:'protocolo-interno-123',
  },key,'admin-1')).rejects.toThrow(ConflictException);
  expect(tx.doctorFinancialLink.updateMany).not.toHaveBeenCalled();
 });
 it('reuses completed idempotent review without writing a second time',async()=>{
  db.doctorProvisioningOperation.findUnique.mockResolvedValue({
   kind:'FINANCIAL_REVIEW',requestHash:'different',doctorId:'doctor-1',status:'COMPLETED',
  });
  await expect(service.reviewFinancialLink('doctor-1','link-1',{
   decision:'VERIFIED',evidenceReference:'protocolo-interno-123',
  },key,'admin-1')).rejects.toThrow(ConflictException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
});
