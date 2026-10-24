import {BadRequestException, ConflictException} from '@nestjs/common';
import {DoctorsService,assertCpf} from '../doctors.service';

describe('Professional doctor domain — phase 2',()=>{
  const mockDb:any={
    doctor:{findUnique:jest.fn(),findMany:jest.fn(),count:jest.fn(),update:jest.fn()},
    doctorProvisioningOperation:{findUnique:jest.fn()},
    subaccount:{findUnique:jest.fn()},
    doctorFinancialLink:{create:jest.fn()},
  };
  const svc=new DoctorsService(mockDb);
  beforeEach(()=>jest.clearAllMocks());
  it('rejects invalid normalized CPFs',()=>{
    expect(()=>assertCpf('11111111111')).toThrow(BadRequestException);
    expect(()=>assertCpf('12345678901')).toThrow(BadRequestException);
    expect(()=>assertCpf('52998224725')).not.toThrow();
  });
  it('does not call remote services to provision a doctor',async()=>{
    mockDb.doctor.findUnique.mockResolvedValueOnce({id:'d',licenses:[],financialLinks:[],operations:[]});
    const result=await svc.prepareProvisioning('d');
    expect(result.provisioned).toBe(false);
    expect(result.status).toBe('AWAITING_MSGDESK');
  });
  it('rejects duplicate idempotency key with different payload',async()=>{
    mockDb.doctorProvisioningOperation.findUnique.mockResolvedValueOnce({
      kind:'DOCTOR_CREATE',requestHash:'not-matching',resultDoctorId:'old'
    });
    await expect(svc.create({fullName:'Dra. Tester'} as any,'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))
      .rejects.toThrow(ConflictException);
  });
  it('does not associate synthetic financial IDs',async()=>{
    mockDb.doctor.findUnique.mockResolvedValue({id:'d',licenses:[],financialLinks:[],operations:[]});
    mockDb.subaccount.findUnique.mockResolvedValue({
      id:'sub',type:'DOCTOR',active:true,deletedAt:null,walletId:'wallet',asaasId:'external_wallet'
    });
    await expect(svc.linkExisting('d',{subaccountId:'sub'})).rejects.toThrow(ConflictException);
    expect(mockDb.doctorFinancialLink.create).not.toHaveBeenCalled();
  });
  it('finds a matching professional but never creates or associates the identity',async()=>{
    mockDb.doctor.findMany.mockResolvedValue([{
      id:'existing',fullName:'Dra. Teste',cpfNormalized:'52998224725',licenses:[
        {crmNormalized:'98765',state:'SP',verificationStatus:'PENDING'}],
      financialLinks:[],registrationStatus:'DRAFT',msgdeskOrganizationId:null,
    }]);
    const result=await svc.identityCandidates({cpfNormalized:'52998224725',crmNormalized:'98765',state:'SP'});
    expect(result.conflict).toBe(false);
    expect(result.candidates).toEqual([expect.objectContaining({
      id:'existing',cpfMatched:true,crmMatched:true,financiallyLinked:false,
    })]);
    expect(mockDb.doctor.findMany).toHaveBeenCalledTimes(1);
    expect(mockDb.doctor.update).not.toHaveBeenCalled();
  });
  it('flags conflicting CPF and CRM matches for manual review instead of auto-linking',async()=>{
    mockDb.doctor.findMany.mockResolvedValue([
      {id:'cpf',fullName:'Profissional A',cpfNormalized:'52998224725',licenses:[],financialLinks:[],registrationStatus:'DRAFT',msgdeskOrganizationId:null},
      {id:'crm',fullName:'Profissional B',cpfNormalized:'16899535009',
       licenses:[{crmNormalized:'98765',state:'SP'}],financialLinks:[],registrationStatus:'DRAFT',msgdeskOrganizationId:null},
    ]);
    const result=await svc.identityCandidates({cpfNormalized:'52998224725',crmNormalized:'98765',state:'SP'});
    expect(result.conflict).toBe(true);
    expect(result.candidates).toHaveLength(2);
  });

});
