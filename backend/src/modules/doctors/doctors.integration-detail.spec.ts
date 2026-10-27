import { NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DoctorsService } from './doctors.service';

const organizationId='11111111-1111-4111-8111-111111111111';
const id='22222222-2222-4222-8222-222222222222';
function row(){
  return {
    id,fullName:'Médico de teste',cpfNormalized:'12345678901',
    registrationStatus:'VERIFIED',provisioningStatus:'LINKED',
    enabled:true,accessActive:true,email:'doctor@example.test',mobilePhone:null,
    msgdeskAuthUserId:'33333333-3333-4333-8333-333333333333',
    msgdeskOrganizationId:organizationId,createdAt:new Date('2026-10-01'),updatedAt:new Date('2026-10-02'),
    licenses:[{crmNormalized:'12345',state:'SP',verificationStatus:'VERIFIED'}],
    financialLinks:[{active:true,status:'VERIFIED',subaccount:{
      active:true,deletedAt:null,walletId:'wallet-test',asaasId:'acc_test',
      asaasGeneralStatus:'APPROVED',asaasStatusCheckedAt:new Date('2026-10-03')
    }}]
  };
}
function setup(value:unknown){
  const findFirst=jest.fn().mockResolvedValue(value);
  const service=new DoctorsService({doctor:{findFirst}} as unknown as PrismaService);
  return {service,findFirst};
}

describe('doctor integration detail projection',()=>{
  it('queries only tenant-scoped fields, excluding operations and financial history',async()=>{
    const {service,findFirst}=setup(row());
    const result=await service.detailForIntegration(id,organizationId);
    const args=findFirst.mock.calls[0][0];
    expect(args.where).toEqual({id,msgdeskOrganizationId:organizationId});
    expect(args.select.operations).toBeUndefined();
    expect(args.select.cpfNormalized).toBe(true);
    expect(args.select.financialLinks.where).toEqual({active:true});
    expect(result.maskedCpf).toBe('***.***.***-01');
    expect(result.financialStatus).toBe('VERIFIED');
    expect(result.financialProviderStatus).toBe('APPROVED');
    expect(result).not.toHaveProperty('cpfNormalized');
    expect(result).not.toHaveProperty('operations');
  });

  it('does not disclose a doctor outside the organization',async()=>{
    const {service,findFirst}=setup(null);
    await expect(service.detailForIntegration(id,organizationId)).rejects.toBeInstanceOf(NotFoundException);
    expect(findFirst.mock.calls[0][0].where).toEqual({id,msgdeskOrganizationId:organizationId});
  });

  it('preserves financial conflict state when several links are active',async()=>{
    const d=row();d.financialLinks.push({...d.financialLinks[0]});
    const {service}=setup(d);
    const result=await service.detailForIntegration(id,organizationId);
    expect(result.financialStatus).toBe('CONFLICT');
    expect(result.financialProviderStatus).toBeNull();
  });
});
