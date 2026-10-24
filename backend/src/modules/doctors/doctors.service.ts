import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DoctorRegistrationStatus, Prisma, SubaccountType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, ReviewDoctorLicenseDto, ReviewDoctorFinancialLinkDto, UpdateDoctorDto } from './doctors.dto';

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

/** Shared canonical financial state; missing data is never mistaken for an absent wallet. */
function financialStatus(links:Array<{active:boolean;status:string;subaccount?:{
  active:boolean;deletedAt:Date|null;walletId:string|null;asaasId:string;
}|null}>):string {
  const active=links.filter(link=>link.active);
  if(!active.length) return 'UNLINKED';
  if(active.length!==1) return 'CONFLICT';
  const {status,subaccount}=active[0];
  if(!subaccount || !subaccount.active || subaccount.deletedAt || !subaccount.walletId ||
    !subaccount.asaasId || subaccount.asaasId.startsWith('external_')) return 'UNAVAILABLE';
  return status;
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
        financialLinks:{where:{active:true},select:{active:true,status:true,subaccountId:true,subaccount:{select:{active:true,deletedAt:true,walletId:true,asaasId:true}}}}}}}),
      this.db.doctor.count({where})
    ]);
    const organizationWhere:Prisma.DoctorWhereInput = organizationId?{msgdeskOrganizationId:organizationId}:{};
    const [statuses,activeForCare,financiallyLinked,withoutOrganization]=await Promise.all([
      this.db.doctor.groupBy({by:['registrationStatus'],where:organizationWhere,_count:{_all:true}}),
      this.db.doctor.count({where:{...organizationWhere,accessActive:true,registrationStatus:'VERIFIED',provisioningStatus:'LINKED'}}),
      this.db.doctor.count({where:{...organizationWhere,financialLinks:{some:{active:true}}}}),
      organizationId?Promise.resolve(0):this.db.doctor.count({where:{msgdeskOrganizationId:null}})
    ]);
    const counts=Object.fromEntries(statuses.map(s=>[s.registrationStatus,s._count._all])) as Record<string,number>;
    const summary={total:statuses.reduce((acc,s)=>acc+s._count._all,0),verified:counts.VERIFIED||0,
      awaitingReview:counts.PENDING_REVIEW||0,incomplete:counts.DRAFT||0,rejected:counts.REJECTED||0,
      clinicalActive:activeForCare,withFinancialLink:financiallyLinked,withoutOrganization};
    return {summary,data:rows.map(d=>({
      id:d.id,fullName:d.fullName,maskedCpf:maskCpf(d.cpfNormalized),
      registrationStatus:d.registrationStatus,provisioningStatus:d.provisioningStatus,
      accessActive:d.accessActive,organizationLinked:!!d.msgdeskOrganizationId,licenses:d.licenses,
      financialStatus:financialStatus(d.financialLinks),
      createdAt:d.createdAt,updatedAt:d.updatedAt,
    })),pagination:{page,limit,total,totalPages:Math.ceil(total/limit)}};
  }

  /** Candidate discovery is read-only; selection and evidence remain separate. */
  async identityCandidates(dto:{cpfNormalized:string;crmNormalized?:string;state?:string}) {
    assertCpf(dto.cpfNormalized);
    if (dto.crmNormalized && !dto.state)
      throw new BadRequestException('UF do CRM necessária para comparação');
    const doctors = await this.db.doctor.findMany({where:{OR:[
      {cpfNormalized:dto.cpfNormalized},
      ...(dto.crmNormalized && dto.state?[{licenses:{some:{crmNormalized:dto.crmNormalized,state:dto.state}}}]:[]),
    ]},take:4,include:{licenses:{select:{crmNormalized:true,state:true,verificationStatus:true}},
      financialLinks:{where:{active:true},select:{subaccountId:true,status:true}}}});
    return {conflict:doctors.length>1,candidates:doctors.map(d=>({
      id:d.id,fullName:d.fullName,maskedCpf:maskCpf(d.cpfNormalized),
      cpfMatched:d.cpfNormalized===dto.cpfNormalized,
      crmMatched:!!dto.crmNormalized&&d.licenses.some(l=>l.crmNormalized===dto.crmNormalized&&l.state===dto.state),
      registrationStatus:d.registrationStatus,organizationLinked:!!d.msgdeskOrganizationId,
      financiallyLinked:d.financialLinks.length>0,
      licenses:d.licenses,
    }))};
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
    return {...doctor,financialStatus:financialStatus(doctor.financialLinks)};
  }

  /** Only clinical-access administration fields cross the organization boundary. */
  async detailForIntegration(id:string,organizationId:string) {
    const doctor=await this.detail(id,organizationId);
    return {
      id:doctor.id,fullName:doctor.fullName,maskedCpf:maskCpf(doctor.cpfNormalized),
      registrationStatus:doctor.registrationStatus,provisioningStatus:doctor.provisioningStatus,
      financialStatus:doctor.financialStatus,accessActive:doctor.accessActive,
      licenses:doctor.licenses.map(l=>({crmNormalized:l.crmNormalized,state:l.state,verificationStatus:l.verificationStatus})),
      email:doctor.email,mobilePhone:doctor.mobilePhone,msgdeskAuthUserId:doctor.msgdeskAuthUserId,
      createdAt:doctor.createdAt,updatedAt:doctor.updatedAt,
    };
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

  /** Resolve one authorized organization, even when several keys belong to it. */
  async resolveOnboardingIntegration(requestedId?:string):Promise<string|null> {
    const keys=await this.db.integrationApiKey.findMany({
      where:{status:'ACTIVE',revokedAt:null,doctorOrganizationId:{not:null},
        scopes:{hasEvery:['doctors:admin:read','doctors:admin:write']}},
      select:{id:true,doctorOrganizationId:true},orderBy:{createdAt:'asc'},
    });
    if(requestedId){
      if(!keys.some(k=>k.id===requestedId)) throw new ConflictException('Integração MsgDesk não pareada ou sem permissão');
      return requestedId;
    }
    return new Set(keys.map(k=>k.doctorOrganizationId)).size===1?keys[0].id:null;
  }

  /** Explicit, authenticated administrative attestation; no fabricated evidence reference. */
  async confirmAdministrativeRegistration(id:string,actorUserId:string) {
    if(!actorUserId) throw new BadRequestException('Administrador autenticado obrigatório');
    await this.db.$transaction(async tx=>{
      const doctor=await tx.doctor.findUnique({where:{id},include:{licenses:true}});
      if(!doctor) throw new NotFoundException('Médico não encontrado');
      if(doctor.registrationStatus==='REJECTED')
        throw new ConflictException('Cadastro rejeitado requer regularização excepcional');
      if(!doctor.cpfNormalized || !doctor.fullName.trim() || !doctor.licenses.length)
        throw new ConflictException('Informe nome, CPF e CRM/UF antes de concluir');
      assertCpf(doctor.cpfNormalized);
      if(doctor.registrationStatus==='VERIFIED') return;
      const now=new Date();
      for(const license of doctor.licenses){
        if(license.verificationStatus==='REJECTED')
          throw new ConflictException('CRM rejeitado exige regularização específica');
        const changed=await tx.doctorLicense.updateMany({
          where:{id:license.id,doctorId:id,verificationStatus:'PENDING'},
          data:{verificationStatus:'VERIFIED',verifiedAt:now},
        });
        if(changed.count) await tx.doctorReviewEvent.create({data:{
          doctorId:id,licenseId:license.id,actorUserId,decision:'VERIFIED',
        }});
      }
      const updated=await tx.doctor.updateMany({
        where:{id,registrationStatus:{in:['DRAFT','PENDING_REVIEW']}},
        data:{registrationStatus:'VERIFIED',verifiedAt:now},
      });
      if(updated.count!==1) throw new ConflictException('Cadastro alterado simultaneamente; recarregue');
    },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    return this.detail(id);
  }

  /** Canfy ADMIN may link an unowned professional only to an already paired, active integration.
   * The browser provides an integration identifier, never a self-asserted tenant UUID. */
  async associateOrganization(id:string,integrationId:string,actorId:string,evidenceReference?:string) {
    const integration=await this.db.integrationApiKey.findUnique({where:{id:integrationId}});
    if (!integration || integration.status!=='ACTIVE' || integration.revokedAt || !integration.doctorOrganizationId ||
        !integration.scopes.includes('doctors:admin:read') || !integration.scopes.includes('doctors:admin:write'))
      throw new BadRequestException('Integração médica não está pareada e autorizada');
    const doctor=await this.db.doctor.findUnique({where:{id},select:{id:true,msgdeskOrganizationId:true,msgdeskAuthUserId:true}});
    if (!doctor) throw new NotFoundException('Médico não encontrado');
    if (doctor.msgdeskOrganizationId===integration.doctorOrganizationId) return this.detail(id);
    if (doctor.msgdeskOrganizationId || doctor.msgdeskAuthUserId)
      throw new ConflictException('Médico já associado; revisão administrativa específica necessária');
    await this.db.$transaction(async tx=>{
      const updated=await tx.doctor.updateMany({where:{id,msgdeskOrganizationId:null,msgdeskAuthUserId:null},
        data:{msgdeskOrganizationId:integration.doctorOrganizationId}});
      if (updated.count!==1) throw new ConflictException('Vínculo alterado durante revisão; recarregue');
      await tx.doctorOrganizationLinkEvent.create({data:{doctorId:id,organizationId:integration.doctorOrganizationId!,
        integrationKeyId:integration.id,actorUserId:actorId,
        ...(evidenceReference?.trim()?{evidenceReference:evidenceReference.trim()}:{}),}});
    });
    return this.detail(id);
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


  /** Manual ownership review for an Asaas account already validated as parent-owned.
   * An administrator must provide a durable evidence reference; no provider
   * account, wallet, split, or user is created or edited by this operation. */
  async reviewFinancialLink(
    doctorId:string,linkId:string,dto:ReviewDoctorFinancialLinkDto,rawKey:string,actorId:string,
  ) {
    const key=idempotency(rawKey);
    if(!actorId)throw new BadRequestException('Operador autenticado obrigatório');
    const requestHash=createHash('sha256').update(stableStringify({
      doctorId,linkId,decision:dto.decision,evidenceReference:dto.evidenceReference.trim(),actorId
    })).digest('hex');
    const old=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if(old) {
      if(old.kind!=='FINANCIAL_REVIEW'||old.requestHash!==requestHash||old.doctorId!==doctorId)
        throw new ConflictException('Idempotency-Key já utilizada em outra revisão');
      if(old.status!=='COMPLETED')throw new ConflictException('Revisão financeira requer reconciliação');
      return this.detail(doctorId);
    }
    try {
      await this.db.$transaction(async tx=>{
        const doctor=await tx.doctor.findUnique({where:{id:doctorId},select:{accessActive:true}});
        if(!doctor)throw new NotFoundException('Médico não encontrado');
        const link=await tx.doctorFinancialLink.findUnique({
          where:{id:linkId},include:{subaccount:true}
        });
        if(!link||link.doctorId!==doctorId||!link.active||link.status!=='PENDING_REVIEW')
          throw new ConflictException('Vínculo não está pendente de revisão');
        const sub=link.subaccount;
        if(sub.type!==SubaccountType.DOCTOR||!sub.active||sub.deletedAt||!sub.walletId||
           !sub.asaasId||sub.asaasId.startsWith('external_'))
          throw new ConflictException('Subconta médica sem titularidade Asaas verificável');
        const concurrent=await tx.doctorFinancialLink.findFirst({
          where:{subaccountId:sub.id,active:true,id:{not:linkId}}
        });
        if(concurrent)throw new ConflictException('Conta financeira já vinculada a outro profissional');
        if(dto.decision==='REJECTED'&&doctor.accessActive)
          throw new ConflictException('Desative o acesso clínico nos dois sistemas antes de rejeitar uma carteira em operação');
        await tx.doctorProvisioningOperation.create({data:{
          doctorId,kind:'FINANCIAL_REVIEW',idempotencyKey:key,requestHash,status:'PENDING',
          actorUserId:actorId,evidenceReference:dto.evidenceReference.trim(),
        }});
        const changed=await tx.doctorFinancialLink.updateMany({where:{
          id:linkId,doctorId,status:'PENDING_REVIEW',active:true,
        },data:dto.decision==='VERIFIED'
          ?{status:'VERIFIED',verifiedAt:new Date()}
          :{status:'REJECTED',active:false,revokedAt:new Date()}});
        if(changed.count!==1)throw new ConflictException('Vínculo alterado durante a revisão');
        await tx.doctorProvisioningOperation.update({
          where:{idempotencyKey:key},data:{status:'COMPLETED',resultDoctorId:doctorId}
        });
      },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    }catch(error){
      if(error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code==='P2002'||error.code==='P2034'))
        throw new ConflictException('Revisão concorrente; confira o vínculo e repita com a mesma chave');
      throw error;
    }
    return this.detail(doctorId);
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
  /** Clinic authorization is separate from financial eligibility, identity and license review. */
  async activateClinicalAccess(id:string,authUserId:string,rawKey:string,organizationId:string){
    const key=idempotency(rawKey);
    const doctor=await this.db.doctor.findUnique({where:{id},
      include:{licenses:{select:{verificationStatus:true}}}});
    if(!doctor || !organizationId || doctor.msgdeskOrganizationId!==organizationId)
      throw new NotFoundException('Médico não encontrado');
    if(doctor.msgdeskAuthUserId!==authUserId ||
      doctor.registrationStatus!=='VERIFIED'||doctor.provisioningStatus!=='LINKED'||
      !doctor.licenses.some(l=>l.verificationStatus==='VERIFIED'))
      throw new ConflictException('Médico não elegível para acesso clínico');
    // Financial eligibility is separate from CRM review. Never activate clinical
    // access when the wallet is absent, synthetic, disabled or awaiting review.
    const activeFinance = await this.db.doctorFinancialLink.findFirst({
      where:{
        doctorId:id,active:true,status:'VERIFIED',
        subaccount:{type:'DOCTOR',active:true,deletedAt:null,walletId:{not:null}},
      },
      include:{subaccount:{select:{asaasId:true}}},
    });
    if (!activeFinance || activeFinance.subaccount.asaasId.startsWith('external_')) {
      throw new ConflictException('Conta Asaas médica validada é necessária para habilitação clínica');
    }
    const requestHash=createHash('sha256').update(stableStringify({id,authUserId,organizationId})).digest('hex');
    const previous=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if(previous) {
      if(previous.kind!=='CLINICAL_ACTIVATE'||previous.requestHash!==requestHash)
        throw new ConflictException('Idempotency-Key reutilizada com outra solicitação');
      if(previous.status!=='COMPLETED') throw new ConflictException('Ativação requer reconciliação');
      return this.provisioning(id,organizationId);
    }
    try {
      await this.db.$transaction(async tx=>{
        const op=await tx.doctorProvisioningOperation.create({data:{
          doctorId:id,kind:'CLINICAL_ACTIVATE',idempotencyKey:key,requestHash,status:'PENDING'
        }});
        const updated=await tx.doctor.updateMany({where:{
          id,msgdeskOrganizationId:organizationId,msgdeskAuthUserId:authUserId,
          registrationStatus:'VERIFIED',provisioningStatus:'LINKED'
        },data:{accessActive:true}});
        if(updated.count!==1)throw new ConflictException('Revalidação de acesso falhou');
        await tx.doctorProvisioningOperation.update({where:{id:op.id},data:{
          status:'COMPLETED',resultDoctorId:id
        }});
      });
    }catch(err){return conflict(err);}
    return this.provisioning(id,organizationId);
  }

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
    // A previously confirmed UID is already linked. A retry (even with a
    // newly generated idempotency key) must NEVER reset clinical access.
    // In particular, the original updateMany below sets accessActive=false
    // for a *new* link and would otherwise revoke an activated doctor.
    if(doctor.msgdeskAuthUserId===authUserId) {
      const existing=await this.provisioning(id,organizationId);
      if(existing.provisioningStatus==='LINKED') return existing;
      // Any inconsistent partial state requires operator reconciliation.
      throw new ConflictException('Vínculo Auth parcial; reconciliação necessária');
    }
    const financeForLogin = await this.db.doctorFinancialLink.findFirst({
      where:{doctorId:id,active:true,status:'VERIFIED',
        subaccount:{type:'DOCTOR',active:true,deletedAt:null,walletId:{not:null}}},
      include:{subaccount:{select:{asaasId:true}}},
    });
    if (!financeForLogin || financeForLogin.subaccount.asaasId.startsWith('external_'))
      throw new ConflictException('Vínculo financeiro Asaas validado obrigatório antes da confirmação do login médico');
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
