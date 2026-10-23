import {ConflictException, ForbiddenException} from '@nestjs/common';
import {createHash} from 'node:crypto';
import {MedicalPairingService} from './medical-pairing.service';

const integration={id:'integration-1',status:'ACTIVE',revokedAt:null,doctorOrganizationId:null,
 scopes:['charges:create','products:read'],doctorPairCodeHash:createHash('sha256').update('A'.repeat(32)).digest('hex'),
 doctorPairExpiresAt:new Date(Date.now()+60000),doctorPairRequestedByUserId:'canfy-admin'};

describe('two-admin medical pairing',()=>{
 const makeDb=()=>{
  const tx={integrationApiKey:{findUnique:jest.fn().mockResolvedValue({...integration}),updateMany:jest.fn().mockResolvedValue({count:1})},
    integrationDoctorPairingEvent:{create:jest.fn().mockResolvedValue({id:'event'})}};
  return {integrationApiKey:{findUnique:jest.fn().mockResolvedValue({...integration}),updateMany:jest.fn().mockResolvedValue({count:1})},
    $transaction:jest.fn(async(callback:(trx:typeof tx)=>Promise<unknown>)=>callback(tx)),tx};
 };
 it('generates an expiring pairing code without adding privileged scopes yet',async()=>{
  const db=makeDb(),service=new MedicalPairingService(db as never);
  const result=await service.start('integration-1','canfy-admin');
  expect(result.pairingCode).toMatch(/^[A-F0-9]{32}$/);
  expect(db.integrationApiKey.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    data:expect.objectContaining({doctorPairCodeHash:expect.any(String),doctorPairRequestedByUserId:'canfy-admin'})
  }));
  expect(db.integrationApiKey.updateMany.mock.calls[0][0].data.scopes).toBeUndefined();
 });
 it('rejects incorrect code before updating the organization',async()=>{
  const db=makeDb(),service=new MedicalPairingService(db as never);
  await expect(service.claim('integration-1','12e1d6d4-8965-4d08-bd27-76cd88eb4c3a','B'.repeat(32)))
   .rejects.toBeInstanceOf(ForbiddenException);
  expect(db.tx.integrationApiKey.updateMany).not.toHaveBeenCalled();
 });
 it('rejects expired code',async()=>{
  const db=makeDb();db.tx.integrationApiKey.findUnique.mockResolvedValue({...integration,doctorPairExpiresAt:new Date(0)});
  const service=new MedicalPairingService(db as never);
  await expect(service.claim('integration-1','12e1d6d4-8965-4d08-bd27-76cd88eb4c3a','A'.repeat(32)))
   .rejects.toBeInstanceOf(ForbiddenException);
  expect(db.tx.integrationApiKey.updateMany).not.toHaveBeenCalled();
 });
 it('consumes code atomically and records the Canfy authorizing administrator',async()=>{
  const db=makeDb(),service=new MedicalPairingService(db as never),org='12e1d6d4-8965-4d08-bd27-76cd88eb4c3a';
  const status=await service.claim('integration-1',org,'A'.repeat(32));
  expect(status).toEqual({paired:true,organizationId:org,canRead:true,canWrite:true});
  expect(db.tx.integrationApiKey.updateMany).toHaveBeenCalledWith(expect.objectContaining({
    where:expect.objectContaining({doctorOrganizationId:null,doctorPairCodeHash:integration.doctorPairCodeHash}),
    data:expect.objectContaining({doctorOrganizationId:org,doctorPairCodeHash:null,doctorPairExpiresAt:null,
      scopes:expect.arrayContaining(['charges:create','doctors:admin:read','doctors:admin:write'])})
  }));
  expect(db.tx.integrationDoctorPairingEvent.create).toHaveBeenCalledWith({data:{
    integrationKeyId:'integration-1',organizationId:org,initiatedByCanfyUserId:'canfy-admin'
  }});
 });
 it('rejects concurrently consumed pairing',async()=>{
  const db=makeDb();db.tx.integrationApiKey.updateMany.mockResolvedValue({count:0});
  const service=new MedicalPairingService(db as never);
  await expect(service.claim('integration-1','12e1d6d4-8965-4d08-bd27-76cd88eb4c3a','A'.repeat(32)))
   .rejects.toBeInstanceOf(ConflictException);
  expect(db.tx.integrationDoctorPairingEvent.create).not.toHaveBeenCalled();
 });
});
