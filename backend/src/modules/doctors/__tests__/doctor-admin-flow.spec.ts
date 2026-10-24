import {BadRequestException, ConflictException} from '@nestjs/common';
import {DoctorsService} from '../doctors.service';

const cpf='52998224725';
const wallet={active:true,deletedAt:null,walletId:'wal_123',asaasId:'acc_123'};
describe('Internal administrative doctor completion',()=>{
  it('audits the authenticated administrator and verifies CRM in one transaction',async()=>{
    const tx:any={
      doctor:{findUnique:jest.fn().mockResolvedValue({id:'doc',cpfNormalized:cpf,fullName:'Dra. Teste',
        registrationStatus:'DRAFT',licenses:[{id:'lic',verificationStatus:'PENDING'}]}),
        updateMany:jest.fn().mockResolvedValue({count:1})},
      doctorLicense:{updateMany:jest.fn().mockResolvedValue({count:1})},
      doctorReviewEvent:{create:jest.fn().mockResolvedValue({id:'audit'})},
    };
    const db:any={$transaction:jest.fn(async (fn:(t:any)=>Promise<unknown>)=>fn(tx))};
    const service=new DoctorsService(db);
    jest.spyOn(service,'detail').mockResolvedValue({id:'doc',registrationStatus:'VERIFIED'} as never);
    await service.confirmAdministrativeRegistration('doc','canfy-admin');
    expect(tx.doctorReviewEvent.create).toHaveBeenCalledWith({data:{
      doctorId:'doc',licenseId:'lic',actorUserId:'canfy-admin',decision:'VERIFIED',
    }});
    expect(tx.doctor.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data:expect.objectContaining({registrationStatus:'VERIFIED'}),
    }));
  });
  it('rejects completion with no authenticated operator',async()=>{
    const service=new DoctorsService({} as never);
    await expect(service.confirmAdministrativeRegistration('doc','')).rejects.toThrow(BadRequestException);
  });
  it('does not automatically reverse a historically rejected profile',async()=>{
    const tx:any={doctor:{findUnique:jest.fn().mockResolvedValue({registrationStatus:'REJECTED',licenses:[]})}};
    const service=new DoctorsService({$transaction:jest.fn(async(fn:(t:any)=>Promise<unknown>)=>fn(tx))} as never);
    await expect(service.confirmAdministrativeRegistration('doc','canfy-admin')).rejects.toThrow(ConflictException);
  });
});
describe('Single-tenant pairing resolution',()=>{
  it('automatically resolves two eligible keys paired to the same organization',async()=>{
    const service=new DoctorsService({integrationApiKey:{findMany:jest.fn().mockResolvedValue([
      {id:'key-a',doctorOrganizationId:'org-one'},
      {id:'key-b',doctorOrganizationId:'org-one'},
    ])}} as never);
    await expect(service.resolveOnboardingIntegration()).resolves.toBe('key-a');
  });
  it('does not guess when multiple different organizations are available',async()=>{
    const service=new DoctorsService({integrationApiKey:{findMany:jest.fn().mockResolvedValue([
      {id:'key-a',doctorOrganizationId:'org-one'},
      {id:'key-b',doctorOrganizationId:'org-two'},
    ])}} as never);
    await expect(service.resolveOnboardingIntegration()).resolves.toBeNull();
    await expect(service.resolveOnboardingIntegration('not-paired')).rejects.toThrow(ConflictException);
  });
});
describe('Financial status parity',()=>{
  it('shows the same wallet status in the list and detail',async()=>{
    const doctor:any={id:'doc',fullName:'Dra. Teste',cpfNormalized:cpf,
      registrationStatus:'VERIFIED',provisioningStatus:'AWAITING_MSGDESK',accessActive:false,
      msgdeskOrganizationId:null,licenses:[],financialLinks:[{
        active:true,status:'VERIFIED',subaccount:wallet,
      }],operations:[],createdAt:new Date(),updatedAt:new Date()};
    const db:any={doctor:{
      findMany:jest.fn().mockResolvedValue([doctor]),findUnique:jest.fn().mockResolvedValue(doctor),
      count:jest.fn().mockResolvedValue(1),groupBy:jest.fn().mockResolvedValue([
        {registrationStatus:'VERIFIED',_count:{_all:1}},
      ])}};
    const service=new DoctorsService(db);
    const list=await service.list({page:1,limit:20});
    const detail=await service.detail('doc');
    expect(list.data[0].financialStatus).toBe('VERIFIED');
    expect(detail.financialStatus).toBe('VERIFIED');
    expect(db.doctor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      include:expect.objectContaining({financialLinks:expect.any(Object)}),
    }));
  });
});

describe('Legacy professional regularization',()=>{
  it('does not require unrelated Asaas-only fields to request an exceptional review',async()=>{
    const db:any={doctor:{update:jest.fn().mockResolvedValue({})}};
    const service=new DoctorsService(db);
    jest.spyOn(service,'detail').mockResolvedValue({
      id:'doc',fullName:'Dra. Teste',cpfNormalized:cpf,
      licenses:[{crmNormalized:'1234',state:'SP'}],registrationStatus:'DRAFT',
    } as never);
    await service.regularize('doc');
    expect(db.doctor.update).toHaveBeenCalledWith({
      where:{id:'doc'},data:{registrationStatus:'PENDING_REVIEW'},
    });
  });
});

describe('MsgDesk scoped doctor detail contract',()=>{
  it('retains the paired tenant ID for secure login creation without revealing financial secrets',async()=>{
    const service=new DoctorsService({} as never);
    jest.spyOn(service,'detail').mockResolvedValue({
      id:'doc',fullName:'Dra. Teste',cpfNormalized:cpf,financialStatus:'VERIFIED',
      msgdeskOrganizationId:'org-one',msgdeskAuthUserId:null,
      registrationStatus:'VERIFIED',provisioningStatus:'AWAITING_MSGDESK',accessActive:false,
      email:'doctor@example.com',mobilePhone:null,
      licenses:[{crmNormalized:'12345',state:'SP',verificationStatus:'VERIFIED'}],
      createdAt:new Date(),updatedAt:new Date(),
      financialLinks:[{subaccount:{walletId:'secret-wallet',asaasId:'secret-account'}}],
    } as never);
    const result=await service.detailForIntegration('doc','org-one');
    expect(result.msgdeskOrganizationId).toBe('org-one');
    expect(result.financialStatus).toBe('VERIFIED');
    expect(result.licenses[0].verificationStatus).toBe('VERIFIED');
    expect(result).not.toHaveProperty('cpfNormalized');
    expect(result).not.toHaveProperty('financialLinks');
  });
});
