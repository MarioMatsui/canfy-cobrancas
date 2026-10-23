import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { DoctorRegistrationStatus, Prisma, SubaccountType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateDoctorDto, DoctorFinancialLinkDto, DoctorLicenseInputDto, DoctorListDto, UpdateDoctorDto } from './doctors.dto';

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

@Injectable()
export class DoctorsService {
  constructor(private readonly db:PrismaService) {}

  async list(query:DoctorListDto) {
    const page=query.page??1, limit=query.limit??20;
    const search=query.search?.trim()||undefined;
    const digits=search?.replace(/\D/g,'');
    const where:Prisma.DoctorWhereInput = {
      ...(query.registrationStatus?{registrationStatus:query.registrationStatus}:{}),
      ...(search?{OR:[
        {fullName:{contains:search,mode:'insensitive'}},
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

  async detail(id:string) {
    const doctor=await this.db.doctor.findUnique({where:{id},include:{
      licenses:true,financialLinks:{include:{subaccount:{
        select:{id:true,name:true,type:true,active:true,walletId:true,asaasId:true,deletedAt:true}
      }}},operations:{select:{id:true,kind:true,status:true,safeErrorCode:true,createdAt:true},
        orderBy:{createdAt:'desc'},take:15}
    }});
    if(!doctor) throw new NotFoundException('Médico não encontrado');
    return doctor;
  }

  async create(dto:CreateDoctorDto,rawKey?:string) {
    const key=idempotency(rawKey);
    assertCpf(dto.cpfNormalized);
    const data=sensitiveData(dto);
    const licenses=dto.licenses??[];
    const requestHash=createHash('sha256').update(JSON.stringify({data,licenses})).digest('hex');
    const previous=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if(previous){
      if(previous.kind!=='DOCTOR_CREATE' || previous.requestHash!==requestHash)
        throw new ConflictException('Idempotency-Key reutilizada com payload diferente');
      if(!previous.resultDoctorId) throw new ConflictException('Cadastro pendente de reconciliação');
      return this.detail(previous.resultDoctorId);
    }
    try {
      const created=await this.db.$transaction(async tx=>{
        const op=await tx.doctorProvisioningOperation.create({
          data:{kind:'DOCTOR_CREATE',idempotencyKey:key,requestHash,status:'PENDING'}});
        const doctor=await tx.doctor.create({
          data:{...data,fullName:dto.fullName,
            licenses:{create:licenses.map(l=>({crmNormalized:l.crmNormalized,state:l.state}))}
          }});
        await tx.doctorProvisioningOperation.update({
          where:{id:op.id},data:{doctorId:doctor.id,resultDoctorId:doctor.id,status:'COMPLETED'}});
        return doctor;
      });
      return this.detail(created.id);
    } catch(err) {
      if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002'){
        const replay=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
        if(replay?.kind==='DOCTOR_CREATE' && replay.requestHash===requestHash && replay.resultDoctorId)
          return this.detail(replay.resultDoctorId);
      }
      return conflict(err);
    }
  }

  async update(id:string,dto:UpdateDoctorDto) {
    await this.detail(id);
    if(dto.cpfNormalized) assertCpf(dto.cpfNormalized);
    if(dto.licenses!==undefined) throw new BadRequestException('Use endpoint dedicado para adicionar CRM');
    try {await this.db.doctor.update({where:{id},data:sensitiveData(dto)});
    }catch(err){return conflict(err);}
    return this.detail(id);
  }

  async addLicense(id:string,dto:DoctorLicenseInputDto) {
    await this.detail(id);
    try { await this.db.doctorLicense.create({data:{doctorId:id,crmNormalized:dto.crmNormalized,state:dto.state}});
    }catch(err){return conflict(err);}
    return this.detail(id);
  }

  async regularize(id:string) {
    const doctor=await this.detail(id);
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
    return this.detail(id);
  }

  async linkExisting(id:string,dto:DoctorFinancialLinkDto) {
    await this.detail(id);
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
    return this.detail(id);
  }

  async provisioning(id:string) {
    const d=await this.db.doctor.findUnique({where:{id},select:{
      id:true,msgdeskAuthUserId:true,provisioningStatus:true,accessActive:true
    }});
    if(!d) throw new NotFoundException('Médico não encontrado');
    return {...d,provisioned:d.msgdeskAuthUserId!==null};
  }

  async prepareProvisioning(id:string) {
    await this.detail(id);
    // Fail closed. The authenticated Auth-create protocol is implemented in Prompt 3.
    return {doctorId:id,provisioned:false,status:'AWAITING_MSGDESK',
      message:'Provisionamento Auth não habilitado nesta etapa; nenhuma credencial criada'};
  }
}
