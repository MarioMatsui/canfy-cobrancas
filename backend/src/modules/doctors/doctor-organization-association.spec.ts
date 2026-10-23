import {BadRequestException,ConflictException,NotFoundException} from '@nestjs/common';
import {DoctorsService} from './doctors.service';

const organization='03ead2d8-7a74-45c6-8a1e-b1272d6bc243';
const integration={id:'integration-a',status:'ACTIVE',revokedAt:null,doctorOrganizationId:organization,
  scopes:['doctors:admin:read','doctors:admin:write','charges:create']};
const doctor={id:'doctor-a',msgdeskOrganizationId:null,msgdeskAuthUserId:null};
const createDb=()=>{
 const tx={doctor:{updateMany:jest.fn().mockResolvedValue({count:1})},
   doctorOrganizationLinkEvent:{create:jest.fn().mockResolvedValue({id:'audit'})}};
 return {integrationApiKey:{findUnique:jest.fn().mockResolvedValue(integration)},
   doctor:{findUnique:jest.fn().mockResolvedValue(doctor)},
   $transaction:jest.fn(async(fn:(trx:typeof tx)=>Promise<unknown>)=>fn(tx)),tx};
};
describe('Canfy doctor organization association',()=>{
 it('refuses integration without administrative write scope',async()=>{
  const db=createDb();db.integrationApiKey.findUnique.mockResolvedValue({...integration,scopes:['doctors:admin:read']});
  const service=new DoctorsService(db as never);
  await expect(service.associateOrganization('doctor-a','integration-a','admin-a','internal protocol 123'))
   .rejects.toBeInstanceOf(BadRequestException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('does not reassign a doctor already belonging to another tenant',async()=>{
  const db=createDb();db.doctor.findUnique.mockResolvedValue({...doctor,msgdeskOrganizationId:'other-org'});
  const service=new DoctorsService(db as never);
  await expect(service.associateOrganization('doctor-a','integration-a','admin-a','internal protocol 123'))
   .rejects.toBeInstanceOf(ConflictException);
  expect(db.$transaction).not.toHaveBeenCalled();
 });
 it('does not assign a doctor already paired to an Auth user',async()=>{
  const db=createDb();db.doctor.findUnique.mockResolvedValue({...doctor,msgdeskAuthUserId:'existing-user'});
  const service=new DoctorsService(db as never);
  await expect(service.associateOrganization('doctor-a','integration-a','admin-a','internal protocol 123'))
   .rejects.toBeInstanceOf(ConflictException);
 });
 it('writes conditional tenant link plus actor/evidence audit atomically',async()=>{
  const db=createDb();const service=new DoctorsService(db as never);
  jest.spyOn(service,'detail').mockResolvedValue({id:'doctor-a',msgdeskOrganizationId:organization} as never);
  await service.associateOrganization('doctor-a','integration-a','admin-a','internal protocol 123');
  expect(db.tx.doctor.updateMany).toHaveBeenCalledWith({
   where:{id:'doctor-a',msgdeskOrganizationId:null,msgdeskAuthUserId:null},
   data:{msgdeskOrganizationId:organization}
  });
  expect(db.tx.doctorOrganizationLinkEvent.create).toHaveBeenCalledWith({data:{
   doctorId:'doctor-a',organizationId:organization,integrationKeyId:'integration-a',
   actorUserId:'admin-a',evidenceReference:'internal protocol 123'
  }});
 });
 it('rejects a raced reassignment without inserting audit and rolls back',async()=>{
  const db=createDb();db.tx.doctor.updateMany.mockResolvedValue({count:0});
  const service=new DoctorsService(db as never);
  await expect(service.associateOrganization('doctor-a','integration-a','admin-a','internal protocol 123'))
   .rejects.toBeInstanceOf(ConflictException);
  expect(db.tx.doctorOrganizationLinkEvent.create).not.toHaveBeenCalled();
 });
 it('rejects missing doctor record',async()=>{
  const db=createDb();db.doctor.findUnique.mockResolvedValue(null);
  const service=new DoctorsService(db as never);
  await expect(service.associateOrganization('missing','integration-a','admin-a','internal protocol 123'))
   .rejects.toBeInstanceOf(NotFoundException);
 });
});
