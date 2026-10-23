import {BadRequestException,ConflictException,ForbiddenException,Injectable,NotFoundException} from '@nestjs/common';
import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {PrismaService} from '../../common/prisma/prisma.service';
import {AuthenticatedIntegration} from './integrations.service';

const doctorScopes=['doctors:admin:read','doctors:admin:write'];
const hash=(value:string)=>createHash('sha256').update(value,'utf8').digest('hex');

@Injectable()
export class MedicalPairingService {
 constructor(private readonly db:PrismaService){}
 async start(integrationId:string,actorId:string){
   const existing=await this.db.integrationApiKey.findUnique({where:{id:integrationId}});
   if(!existing)throw new NotFoundException('Integração não encontrada');
   if(existing.status!=='ACTIVE'||existing.revokedAt)throw new BadRequestException('Integração revogada');
   if(existing.doctorOrganizationId)throw new ConflictException('Integração já associada a uma organização');
   const pairingCode=randomBytes(16).toString('hex').toUpperCase();
   const expiresAt=new Date(Date.now()+10*60*1000);
   const update=await this.db.integrationApiKey.updateMany({where:{id:integrationId,status:'ACTIVE',revokedAt:null,doctorOrganizationId:null},
     data:{doctorPairCodeHash:hash(pairingCode),doctorPairExpiresAt:expiresAt,doctorPairRequestedByUserId:actorId}});
   if(update.count!==1)throw new ConflictException('Integração alterada; recarregue');
   return {pairingCode,expiresAt};
 }
 status(integration:AuthenticatedIntegration){
   const scopes=integration.scopes;
   return {paired:!!integration.doctorOrganizationId,organizationId:integration.doctorOrganizationId,
     canRead:scopes.includes('doctors:admin:read'),canWrite:scopes.includes('doctors:admin:write')};
 }
 async claim(integrationId:string,organizationId:string,pairingCode:string){
   const providedHash=hash(pairingCode.toUpperCase());
   return this.db.$transaction(async tx=>{
     const current=await tx.integrationApiKey.findUnique({where:{id:integrationId}});
     if(!current||current.status!=='ACTIVE'||current.revokedAt||current.doctorOrganizationId||
       !current.doctorPairCodeHash||!current.doctorPairExpiresAt||current.doctorPairExpiresAt<=new Date())
       throw new ForbiddenException('Pareamento indisponível ou expirado');
     const expected=Buffer.from(current.doctorPairCodeHash,'hex');
     const actual=Buffer.from(providedHash,'hex');
     if(expected.length!==actual.length||!timingSafeEqual(expected,actual))
       throw new ForbiddenException('Código de pareamento inválido');
     const scopes=[...new Set([...current.scopes,...doctorScopes])].sort();
     const saved=await tx.integrationApiKey.updateMany({
       where:{id:current.id,status:'ACTIVE',revokedAt:null,doctorOrganizationId:null,
         doctorPairCodeHash:current.doctorPairCodeHash,doctorPairExpiresAt:{gt:new Date()},scopes:{equals:current.scopes}},
       data:{doctorOrganizationId:organizationId,scopes,doctorPairCodeHash:null,doctorPairExpiresAt:null,
         doctorPairRequestedByUserId:null}
     });
     if(saved.count!==1)throw new ConflictException('Pareamento já consumido ou alterado');
     await tx.integrationDoctorPairingEvent.create({data:{integrationKeyId:integrationId,organizationId,
       initiatedByCanfyUserId:current.doctorPairRequestedByUserId}});
     return {paired:true,organizationId,canRead:true,canWrite:true};
   });
 }
}
