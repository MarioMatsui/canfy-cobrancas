import { BadRequestException, ConflictException } from '@nestjs/common';
import { DoctorOnboardingService } from '../doctor-onboarding.service';
import { DoctorOnboardingFinancialMode } from '../doctor-onboarding.dto';

const key = 'a1111111-1111-4111-8111-111111111111';
const validCpf = '52998224725';
const input = (mode:DoctorOnboardingFinancialMode = DoctorOnboardingFinancialMode.LINK) => ({
  doctor:{fullName:'Dra. Teste',cpfNormalized:validCpf,licenses:[{crmNormalized:'98765',state:'SP'}]},
  mode,administrativeConfirmed:true,
  ...(mode==='LINK'?{accountIdentifier:'wallet1234567890'}:{newAccount:{
    type:'DOCTOR',name:'Dra. Teste',cpfCnpj:validCpf,email:'medico@example.com',
    mobilePhone:'11999999999',postalCode:'01310100',address:'Avenida Paulista',
    addressNumber:'100',province:'Bela Vista',incomeValue:5000,
  }}),
});
describe('Unified medical onboarding',()=>{
  let db:any,doctors:any,subaccounts:any,service:DoctorOnboardingService;
  beforeEach(()=>{
    db={
      doctorProvisioningOperation:{
        findUnique:jest.fn().mockResolvedValue(null),
        create:jest.fn().mockResolvedValue({id:'op'}),
        update:jest.fn().mockResolvedValue({id:'op'}),
      },
      $transaction:jest.fn(),
      subaccount:{findUnique:jest.fn().mockResolvedValue({
        id:'sub-1',type:'DOCTOR',asaasId:'acc_1234',walletId:'wallet1234567890',
        cpfCnpj:validCpf,deletedAt:null,active:true,
      })},
    };
    doctors={
      create:jest.fn().mockResolvedValue({id:'doctor-1'}),
      detail:jest.fn().mockResolvedValue({
        id:'doctor-1',fullName:'Dra. Teste',accessActive:false,
        provisioningStatus:'AWAITING_MSGDESK',msgdeskOrganizationId:null,
      }),
      associateOrganization:jest.fn(),
      confirmAdministrativeRegistration:jest.fn().mockResolvedValue({id:'doctor-1'}),
      resolveOnboardingIntegration:jest.fn().mockResolvedValue(null),
    };
    subaccounts={
      linkManagedDoctorAccount:jest.fn().mockResolvedValue({
        id:'sub-1',type:'DOCTOR',asaasId:'acc_1234',
        walletId:'wallet1234567890',cpfCnpj:validCpf,deletedAt:null,active:true,
      }),
      create:jest.fn().mockResolvedValue({
        id:'sub-1',type:'DOCTOR',asaasId:'acc_1234',
        walletId:'wallet1234567890',cpfCnpj:validCpf,deletedAt:null,active:true,
      }),
    };
    service=new DoctorOnboardingService(db,doctors,subaccounts);
    db.$transaction.mockImplementation(async (fn:(tx:any)=>Promise<unknown>)=>{
      const tx={
        doctorFinancialLink:{
          findMany:jest.fn().mockResolvedValue([]),
          create:jest.fn().mockResolvedValue({id:'link-1'}),
        }
      };
      return fn(tx);
    });
  });

  it('rejects incomplete identity before any external operation',async()=>{
    const data=input();
    data.doctor.cpfNormalized='11111111111';
    await expect(service.onboard(data as any,key,'admin-id')).rejects.toThrow(BadRequestException);
    expect(doctors.create).not.toHaveBeenCalled();
    expect(subaccounts.linkManagedDoctorAccount).not.toHaveBeenCalled();
  });
  it('uses parent verified account for LINK and records professional identity once',async()=>{
    const result=await service.onboard(input() as any,key,'admin-id');
    expect(subaccounts.linkManagedDoctorAccount).toHaveBeenCalledWith('wallet1234567890');
    expect(doctors.create).toHaveBeenCalledTimes(1);
    expect(result.financialOwnershipVerified).toBe(true);
    expect(result.clinicalAccessActive).toBe(false);
  });
  it('creates an Asaas account via the durable ledger with a derived idempotency key',async()=>{
    const result=await service.onboard(input(DoctorOnboardingFinancialMode.CREATE) as any,key,'admin-id');
    expect(subaccounts.create).toHaveBeenCalledWith(expect.objectContaining({type:'DOCTOR'}),expect.any(String),true);
    expect(result.financialOwnershipVerified).toBe(true);
  });
  it('rejects replay of same UUID with a modified request before side effects',async()=>{
    db.doctorProvisioningOperation.findUnique.mockResolvedValue({
      kind:'DOCTOR_ONBOARD',requestHash:'different',
    });
    await expect(service.onboard(input() as any,key,'admin-id')).rejects.toThrow(ConflictException);
    expect(doctors.create).not.toHaveBeenCalled();
    expect(subaccounts.linkManagedDoctorAccount).not.toHaveBeenCalled();
  });
  it('blocks another doctor owning the same active wallet',async()=>{
    db.$transaction.mockImplementation(async (fn:(tx:any)=>Promise<unknown>)=>fn({
      doctorFinancialLink:{
        findMany:jest.fn().mockResolvedValue([{doctorId:'someone-else',subaccountId:'sub-1'}]),
      },
    }));
    await expect(service.onboard(input() as any,key,'admin-id')).rejects.toThrow(ConflictException);
  });
  it('fails closed on untrusted synthetic wallet',async()=>{
    subaccounts.linkManagedDoctorAccount.mockResolvedValue({
      id:'sub-1',type:'DOCTOR',asaasId:'external_unknown',
      walletId:'wallet1234567890',cpfCnpj:validCpf,deletedAt:null,active:true,
    });
    await expect(service.onboard(input() as any,key,'admin-id')).rejects.toThrow(ConflictException);
  });
  it('reuses a verified matching local wallet without any extra Asaas POST or manual review',async()=>{
    const req={...input(),accountIdentifier:undefined,localSubaccountId:'sub-1',identityEvidenceReference:'ticket-identity-2026'};
    const result=await service.onboard(req as any,key,'admin-id');
    expect(db.subaccount.findUnique).toHaveBeenCalledWith({where:{id:'sub-1'}});
    expect(subaccounts.linkManagedDoctorAccount).not.toHaveBeenCalled();
    expect(subaccounts.create).not.toHaveBeenCalled();
    expect(result.financialAccountReused).toBe(true);
    expect(result.financialOwnershipVerified).toBe(true);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    expect(doctors.confirmAdministrativeRegistration).toHaveBeenCalledWith('doctor-1','admin-id');
  });
  it('continues the selected Doctor instead of creating a duplicate professional',async()=>{
    doctors.detail.mockResolvedValue({id:'doctor-1',fullName:'Dra. Teste',cpfNormalized:validCpf,
      licenses:[{crmNormalized:'98765',state:'SP'}],registrationStatus:'DRAFT',
      msgdeskOrganizationId:null,birthDate:null,accessActive:false,provisioningStatus:'AWAITING_MSGDESK'});
    const req={...input(),accountIdentifier:undefined,localSubaccountId:'sub-1',
      existingDoctorId:'doctor-1',identityEvidenceReference:'ticket-identity-2026'};
    const result=await service.onboard(req as any,key,'admin-id');
    expect(doctors.create).not.toHaveBeenCalled();
    expect(subaccounts.create).not.toHaveBeenCalled();
    expect(result.existingProfessionalReused).toBe(true);
  });
  it('rejects a legacy account without a validated wallet before creating a Doctor',async()=>{
    db.subaccount.findUnique.mockResolvedValue({...await db.subaccount.findUnique(),walletId:null});
    const req={...input(),accountIdentifier:undefined,localSubaccountId:'sub-1',identityEvidenceReference:'ticket-identity-2026'};
    await expect(service.onboard(req as any,key,'admin-id')).rejects.toThrow(ConflictException);
    expect(doctors.create).not.toHaveBeenCalled();
    expect(subaccounts.create).not.toHaveBeenCalled();
  });
  it('refuses mismatch when administrator selects a different existing professional',async()=>{
    doctors.detail.mockResolvedValue({id:'doctor-1',cpfNormalized:'16899535009',licenses:[],msgdeskOrganizationId:null});
    const req={...input(),accountIdentifier:undefined,localSubaccountId:'sub-1',
      existingDoctorId:'doctor-1',identityEvidenceReference:'ticket-identity-2026'};
    await expect(service.onboard(req as any,key,'admin-id')).rejects.toThrow(ConflictException);
    expect(doctors.create).not.toHaveBeenCalled();
  });

});
