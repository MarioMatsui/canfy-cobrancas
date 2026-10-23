import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DoctorRegistrationStatus, Prisma, SubaccountType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, ReviewDoctorLicenseDto, UpdateDoctorDto } from './doctors.dto';

export function assertCpf(value?: string) {
  if (!value) return;
  if (!/^[0-9]{11}$/.test(value) || /^(\d)\1{10}$/.test(value)) throw new BadRequestException('CPF inválido');
  for (let length=9;length<=10;length++) {
    const sum=Array.from({length},(_,i)=>Number(value[i])*(length+1-i)).reduce((a,b)=>a+b,0);
    const remainder=(sum*10)%11;
    if (Number(value[length]) !== (remainder===10 ? 0 : remainder)) throw new BadRequestException('CPF inválido');
  }
}

function idempotency(value?: string) {
  if (!value || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new BadRequestException('Idempotency-Key UUID obrigatório');
  }
  return value;
}

function dateOnly(value?: string): Date | undefined {
  if (!value) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException('Data deve ser YYYY-MM-DD');
  const date=new Date(value+'T00:00:00.000Z');
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10)!==value) throw new BadRequestException('Data inválida');
  return date;
}

function sensitiveData(dto: CreateDoctorDto | UpdateDoctorDto) {
  const { licenses:_licenses, birthDate, ...fields } = dto;
  return {...fields, ...(birthDate===undefined?{}:{birthDate:dateOnly(birthDate)})};
}

function maskCpf(value: string|null): string|null {
  return value ? '***.***.***-'+value.slice(-2) : null;
}

function conflict(error:unknown):never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')
    throw new ConflictException('CPF, CRM, identidade ou vínculo já cadastrado');
  throw error;
}

// Canonical request hashing prevents harmless JSON object key reordering from
// changing the meaning of an idempotent create attempt.
function stableStringify(value:unknown):string {
  if (Array.isArray(value)) return '['+value.map(stableStringify).join(',')+']';
  if (value && typeof value==='object' && !(value instanceof Date)) {
    const obj=value as Record<string,unknown>;
    return '{'+Object.keys(obj).sort().map(key=>JSON.stringify(key)+':'+stableStringify(obj[key])).join(',')+'}';
  }
  return JSON.stringify(value);
}

@Injectable()
export class DoctorsService {
  constructor(private readonly db:PrismaService) {}

  async list(query:DoctorListDto,organizationId?:string) {
    const page=query.page??1, limit=query.limit??20;
    const search=query.search?.trim()||undefined;
    const digits=search?.replace(/\D/g,'');
    const where:Prisma.DoctorWhereInput = {
      ...(organizationId?{msgdeskOrganizationId:organizationId}:{}),
      ...(query.registrationStatus?{registrationStatus:query.registrationStatus}:{}),
      ...(search?{OR:[
        {fullName:{contains:search,mode:Prisma.QueryMode.insensitive}},
        ...(digits?[{licenses:{some:{crmNormalized:{contains:digits}}}}]:[]),
      ]}:{}),
    };
    const [rows,total]=await Promise.all([
      this.db.doctor.findMany({where,skip:(page-1)*limit,take:limit,
        orderBy:{createdAt:'desc'},include:{licenses:{select:{crmNormalized:true,state:true,verificationStatus:true}},
        financialLinks:{where:{active:true},select:{status:true,subaccountId:true}}}}),
      this.db.doctor.count({where})
    ]);
    return {data:rows.map(d=>({
      id:d.id,fullName:d.fullName,maskedCpf:maskCpf(d.cpfNormalized),
      registrationStatus:d.registrationStatus,provisioningStatus:d.provisioningStatus,
      accessActive:d.accessActive,licenses:d.licenses,
      financialStatus:d.financialLinks[0]?.status??'UNLINKED',
      createdAt:d.createdAt,updatedAt:d.updatedAt,
    })),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
  }

  async legacyCandidates(query:DoctorListDto,includeOther=false) {
    const page=query.page??1, limit=query.limit??20;
    // Classifying OTHER as physician is never automatic; show it only on
    // explicit request for manual review.
    const where:Prisma.SubaccountWhereInput={
      type:includeOther?{in:[SubaccountType.DOCTOR,SubaccountType.OTHER]}:SubaccountType.DOCTOR,
      doctorFinancialLinks:{none:{active:true}},
      ...(query.search?{name:{contains:query.search,mode:Prisma.QueryMode.insensitive}}:{})
    };
    const [rows,total]=await Promise.all([
      this.db.subaccount.findMany({where,skip:(page-1)*limit,take:limit,
        orderBy:{createdAt:'desc'},
        select:{id:true,name:true,type:true,active:true,deletedAt:true,asaasId:true,walletId:true,createdAt:true}}),
      this.db.subaccount.count({where})
    ]);
    return {data:rows.map(x=>({
      subaccountId:x.id,name:x.name,classification:x.type,
      reviewRequired:true,active:x.active,softDeleted:!!x.deletedAt,
      financialIdentifierVerified:!!x.walletId && !x.asaasId.startsWith('external_'),
      createdAt:x.createdAt
    })),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
  }

  async detail(id:string,organizationId?:string) {
    const doctor=await this.db.doctor.findUnique({where:{id},include:{
      licenses:true,financialLinks:{include:{subaccount:{
        select:{id:true,name:true,type:true,active:true,walletId:true,asaasId:true,deletedAt:true}
      }}},operations:{select:{id:true,kind:true,status:true,safeErrorCode:true,createdAt:true},
        orderBy:{createdAt:'desc'},take:15}
    }});
    if(!doctor || (organizationId && doctor.msgdeskOrganizationId !== organizationId)) throw new NotFoundException('Médico não encontrado');
    return doctor;
  }

  /** Integration details never expose Asaas wallet/account identifiers or financial PII. */
  async detailForIntegration(id:string,organizationId:string) {
    const {financialLinks,...doctor}=await this.detail(id,organizationId);
    return {...doctor,financialLinks:financialLinks.map(link=>({
      status:link.status,active:link.active,createdAt:link.createdAt
    }))};
  }

  async create(dto:CreateDoctorDto,rawKey?:string,organizationId?:string) {
    const key=idempotency(rawKey);
    assertCpf(dto.cpfNormalized);
    const data=sensitiveData(dto);
    const licenses=dto.licenses??[];
    const requestHash=createHash('sha256').update(stableStringify({data,licenses,organizationId})).digest('hex');
    const previous=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if(previous){
      if(previous.kind!=='DOCTOR_CREATE' || previous.requestHash!==requestHash)
        throw new ConflictException('Idempotency-Key reutilizada com payload diferente');
      if(!previous.resultDoctorId) throw new ConflictException('Cadastro pendente de reconciliação');
      return this.detail(previous.resultDoctorId,organizationId);
    }
    try {
      const created=await this.db.$transaction(async tx=>{
        const op=await tx.doctorProvisioningOperation.create({
          data:{kind:'DOCTOR_CREATE',idempotencyKey:key,requestHash,status:'PENDING'}});
        const doctor=await tx.doctor.create({
          data:{...data,fullName:dto.fullName,
            ...(organizationId?{msgdeskOrganizationId:organizationId}:{}),
            licenses:{create:licenses.map(l=>({crmNormalized:l.crmNormalized,state:l.state}))}
          }});
        await tx.doctorProvisioningOperation.update({
          where:{id:op.id},data:{doctorId:doctor.id,resultDoctorId:doctor.id,status:'COMPLETED'}});
        return doctor;
      });
      return this.detail(created.id,organizationId);
    } catch(err) {
      if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002'){
        const replay=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
        if(replay?.kind==='DOCTOR_CREATE' && replay.requestHash===requestHash && replay.resultDoctorId)
          return this.detail(replay.resultDoctorId,organizationId);
      }
      return conflict(err);
    }
  }

  async update(id:string,dto:UpdateDoctorDto,organizationId?:string) {
    await this.detail(id,organizationId);
    if(dto.cpfNormalized) assertCpf(dto.cpfNormalized);
    if(dto.licenses!==undefined) throw new BadRequestException('Use endpoint dedicado para adicionar CRM');
    try {await this.db.doctor.update({where:{id},data:sensitiveData(dto)});
    }catch(err){return conflict(err);}
    return this.detail(id,organizationId);
  }

  async addLicense(id:string,dto:DoctorLicenseInputDto,organizationId?:string) {
    await this.detail(id,organizationId);
    try { await this.db.doctorLicense.create({data:{doctorId:id,crmNormalized:dto.crmNormalized,state:dto.state}});
    }catch(err){return conflict(err);}
    return this.detail(id,organizationId);
  }

  async regularize(id:string,organizationId?:string) {
    const doctor=await this.detail(id,organizationId);
    const required:Record<string,unknown>={
      cpfNormalized:doctor.cpfNormalized,rg:doctor.rg,rgIssuer:doctor.rgIssuer,
      rgState:doctor.rgState,birthDate:doctor.birthDate,email:doctor.email,
      mobilePhone:doctor.mobilePhone,postalCode:doctor.postalCode,street:doctor.street,
      streetNumber:doctor.streetNumber,neighborhood:doctor.neighborhood,
      city:doctor.city,state:doctor.state,license:doctor.licenses[0]?.crmNormalized
    };
    const missing=Object.keys(required).filter(k=>!required[k]);
    if(missing.length) throw new ConflictException({message:'Cadastro incompleto',missingFields:missing});
    if(doctor.registrationStatus===DoctorRegistrationStatus.VERIFIED) return doctor;
    await this.db.doctor.update({where:{id},data:{registrationStatus:'PENDING_REVIEW'}});
    return this.detail(id,organizationId);
  }

  async linkExisting(id:string,dto:DoctorFinancialLinkDto,organizationId?:string) {
    await this.detail(id,organizationId);
    const sub=await this.db.subaccount.findUnique({where:{id:dto.subaccountId}});
    if(!sub || sub.type!==SubaccountType.DOCTOR || sub.deletedAt || !sub.walletId)
      throw new BadRequestException('Subconta não elegível; vínculo requer revisão financeira');
    if(!sub.asaasId || sub.asaasId.startsWith('external_'))
      throw new ConflictException('Conta externa ainda não verificada no Asaas');
    try {
      await this.db.doctorFinancialLink.create({data:{
        doctorId:id,subaccountId:sub.id,status:'PENDING_REVIEW',active:true
      }});
    }catch(err){return conflict(err);}
    return this.detail(id,organizationId);
  }

  /**
   * JWT ADMIN manual review, with reference to independently checked CRM evidence.
   * Simply submitting data via regularize() never verifies a professional.
   */
  async reviewLicense(id:string,dto:ReviewDoctorLicenseDto,actorUserId:string) {
    if(!actorUserId)throw new BadRequestException('Ator administrativo não identificado');
    const doctor=await this.detail(id);
    if(doctor.registrationStatus!==DoctorRegistrationStatus.PENDING_REVIEW)
      throw new ConflictException('Apenas cadastros em revisão podem ser verificados');
    const license=doctor.licenses.find(l=>l.id===dto.licenseId);
    if(!license || license.verificationStatus!=='PENDING')
      throw new ConflictException('CRM não encontrado ou já revisado');
    const evidence=dto.evidenceReference.trim();
    if(evidence.length<8||evidence.length>250)
      throw new BadRequestException('Referência de verificação inválida');
    await this.db.$transaction(async tx=>{
      const updated=await tx.doctorLicense.updateMany({
        where:{id:dto.licenseId,doctorId:id,verificationStatus:'PENDING'},
        data:{verificationStatus:dto.decision,verifiedAt:dto.decision==='VERIFIED'?new Date():null}
      });
      if(updated.count!==1)throw new ConflictException('CRM revisado em paralelo');
      await tx.doctorReviewEvent.create({data:{
        doctorId:id,licenseId:dto.licenseId,actorUserId,evidenceReference:evidence,decision:dto.decision
      }});
      const statuses=await tx.doctorLicense.findMany({where:{doctorId:id},select:{verificationStatus:true}});
      const verified=statuses.some(x=>x.verificationStatus==='VERIFIED');
      const rejected=statuses.every(x=>x.verificationStatus==='REJECTED');
      await tx.doctor.update({where:{id},data:verified?{
        registrationStatus:'VERIFIED',verifiedAt:new Date()
      }:rejected?{registrationStatus:'REJECTED',verifiedAt:null}:{
        registrationStatus:'PENDING_REVIEW',verifiedAt:null
      }});
    });
    return this.detail(id);
  }

  async provisioning(id:string,organizationId?:string) {
    const d=await this.db.doctor.findUnique({where:{id},select:{
      msgdeskOrganizationId:true,
      id:true,msgdeskAuthUserId:true,provisioningStatus:true,accessActive:true
    }});
    if(!d || (organizationId && d.msgdeskOrganizationId !== organizationId)) throw new NotFoundException('Médico não encontrado');
    const {msgdeskOrganizationId:_organizationId,...safe}=d;
    return {...safe,provisioned:d.msgdeskAuthUserId!==null};
  }

  async prepareProvisioning(id:string,organizationId?:string) {
    await this.detail(id,organizationId);
    // Fail closed. The authenticated Auth-create protocol is implemented in Prompt 3.
    return {doctorId:id,provisioned:false,status:'AWAITING_MSGDESK',
      message:'Provisionamento Auth não habilitado nesta etapa; nenhuma credencial criada'};
  }
  /**
   * Confirm an Auth UID only from the organization-scoped integration v2.
   * Never changes subaccounts, balances, historical charges or CRM verification.
   */
  async confirmProvisioning(id:string, authUserId:string, rawKey:string, organizationId:string) {
    const key=idempotency(rawKey);
    const doctor=await this.db.doctor.findUnique({where:{id},select:{
      id:true,msgdeskOrganizationId:true,msgdeskAuthUserId:true,registrationStatus:true
    }});
    if(!doctor || !organizationId || doctor.msgdeskOrganizationId!==organizationId)
      throw new NotFoundException('Médico não encontrado');
    if(doctor.registrationStatus!==DoctorRegistrationStatus.VERIFIED)
      throw new ConflictException('Cadastro profissional não verificado');
    if(doctor.msgdeskAuthUserId && doctor.msgdeskAuthUserId!==authUserId)
      throw new ConflictException('Médico já vinculado a outra identidade Auth');
    const requestHash=createHash('sha256').update(stableStringify({id,authUserId,organizationId})).digest('hex');
    const previous=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if(previous){
      if(previous.kind!=='AUTH_CONFIRM' || previous.requestHash!==requestHash)
        throw new ConflictException('Chave de idempotência reutilizada');
      if(previous.status!=='COMPLETED')
        throw new ConflictException('Reconciliação de provisionamento necessária');
      return this.provisioning(id,organizationId);
    }
    try {
      await this.db.$transaction(async tx=>{
        const op=await tx.doctorProvisioningOperation.create({
          data:{doctorId:id,kind:'AUTH_CONFIRM',idempotencyKey:key,requestHash,status:'PENDING'}
        });
        const updated=await tx.doctor.updateMany({
          where:{id,msgdeskOrganizationId:organizationId,msgdeskAuthUserId:doctor.msgdeskAuthUserId},
          data:{msgdeskAuthUserId:authUserId,provisioningStatus:'LINKED',accessActive:false}
        });
        if(updated.count!==1)throw new ConflictException('Cadastro alterado em paralelo; reconciliação necessária');
        await tx.doctorProvisioningOperation.update({where:{id:op.id},data:{status:'COMPLETED',resultDoctorId:id}});
      });
    }catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError && error.code==='P2002')
        throw new ConflictException('Identidade Auth ou confirmação já vinculada; verifique antes de repetir');
      throw error;
    }
    return this.provisioning(id,organizationId);
  }

}
