import {BadRequestException,NotFoundException} from '@nestjs/common';
import {DoctorsService} from './doctors.service';

describe('stage 3 clinical provisioning contract',()=>{
 const doctor={id:'d1',msgdeskOrganizationId:'org-1',msgdeskAuthUserId:null,registrationStatus:'VERIFIED'};
 const makeDB=()=>{
  const tx={
    doctor:{updateMany:jest.fn().mockResolvedValue({count:1})},
    doctorProvisioningOperation:{
      create:jest.fn().mockResolvedValue({id:'op'}),
      update:jest.fn().mockResolvedValue({})
    }
  };
  return {
    doctor:{findUnique:jest.fn().mockResolvedValue(doctor)},
    doctorProvisioningOperation:{findUnique:jest.fn().mockResolvedValue(null)},
    $transaction:jest.fn(async (callback:(transaction:typeof tx)=>Promise<unknown>)=>callback(tx)),
  };
 };
 it('rejects confirmation belonging to another organization',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  await expect(service.confirmProvisioning('d1','uid','c6f8c97e-9910-44ff-a76e-b625b85ec0b1','org-other'))
   .rejects.toBeInstanceOf(NotFoundException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('refuses non-UUID idempotency keys',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  await expect(service.confirmProvisioning('d1','uid','bad','org-1'))
   .rejects.toBeInstanceOf(BadRequestException);
 });
 it('confirms only the doctor identity, without financial mutations',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  jest.spyOn(service,'provisioning').mockResolvedValue({
    id:'d1',msgdeskAuthUserId:'uid',provisioned:true,provisioningStatus:'LINKED',accessActive:false
  } as never);
  await service.confirmProvisioning('d1','uid','c6f8c97e-9910-44ff-a76e-b625b85ec0b1','org-1');
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  expect((db as Record<string,unknown>).subaccount).toBeUndefined();
 });
});
