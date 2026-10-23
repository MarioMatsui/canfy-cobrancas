import {BadRequestException,NotFoundException} from '@nestjs/common';
import {DoctorsService} from './doctors.service';

describe('stage 3 clinical provisioning contract',()=>{
 const doctor={id:'d1',msgdeskOrganizationId:'org-1',msgdeskAuthUserId:null,registrationStatus:'VERIFIED'};
 const makeDB=()=>({
   doctor:{
     findUnique:jest.fn().mockResolvedValue(doctor),
     updateMany:jest.fn().mockResolvedValue({count:1}),
   },
   doctorProvisioningOperation:{
     findUnique:jest.fn().mockResolvedValue(null),
     create:jest.fn().mockResolvedValue({id:'op'}),
     update:jest.fn().mockResolvedValue({}),
   },
   $transaction:jest.fn(async callback=>{
     const db=makeDB();
     return callback(db);
   }),
 });
 it('rejects confirmation belonging to another organization',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  await expect(service.confirmProvisioning('d1','uid','c6f8c97e-9910-44ff-a76e-b625b85ec0b1','org-other'))
   .rejects.toBeInstanceOf(NotFoundException);
  expect(db.doctor.updateMany).not.toHaveBeenCalled();
 });
 it('refuses non-UUID idempotency keys',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  await expect(service.confirmProvisioning('d1','uid','bad','org-1'))
   .rejects.toBeInstanceOf(BadRequestException);
 });
 it('does not invoke Asaas or mutate subaccounts when confirming Auth UID',async()=>{
  const db=makeDB();
  const service=new DoctorsService(db as never);
  jest.spyOn(service,'provisioning').mockResolvedValue({id:'d1',msgdeskAuthUserId:'uid',provisioned:true} as never);
  await service.confirmProvisioning('d1','uid','c6f8c97e-9910-44ff-a76e-b625b85ec0b1','org-1');
  expect(db.$transaction).toHaveBeenCalledTimes(1);
  const tx=db.$transaction.mock.results[0];
  expect(tx.type).toBe('return');
  expect((db as Record<string,unknown>).subaccount).toBeUndefined();
 });
});
