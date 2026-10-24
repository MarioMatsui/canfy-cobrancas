import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Prisma, SubaccountType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { DoctorsService, assertCpf } from './doctors.service';
import { SubaccountsService } from '../subaccounts/subaccounts.service';
import { DoctorOnboardingDto, DoctorOnboardingFinancialMode } from './doctor-onboarding.dto';

const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const digits = (s: string) => s.replace(/\D/g, '');

function validCnpj(value: string): boolean {
  if (!/^\d{14}$/.test(value) || /^(\d)\1{13}$/.test(value)) return false;
  const check = (length: number) => {
    const weights = length === 12 ? [5,4,3,2,9,8,7,6,5,4,3,2] : [6,5,4,3,2,9,8,7,6,5,4,3,2];
    const sum = weights.reduce((acc, weight, i) => acc + Number(value[i]) * weight, 0);
    const remainder = sum % 11;
    return Number(value[length]) === (remainder < 2 ? 0 : 11 - remainder);
  };
  return check(12) && check(13);
}
function stableStringify(value:unknown):string {
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  if (value && typeof value === 'object') {
    const obj=value as Record<string,unknown>;
    return '{' + Object.keys(obj).sort().map(k=>JSON.stringify(k)+':'+stableStringify(obj[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}
function derivedKey(key: string, purpose: string): string {
  const hex = createHash('sha256').update('canfy-medical-v1:' + purpose + ':' + key).digest('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
}
function financialKey(key: string): string {
  // Stable separate key for the existing durable SubaccountCreateOperation ledger.
  const hex = createHash('sha256').update('canfy-doctor-asaas-v1:' + key).digest('hex');
  return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20,32)].join('-');
}

@Injectable()
export class DoctorOnboardingService {
  constructor(
    private readonly db: PrismaService,
    private readonly doctors: DoctorsService,
    private readonly subaccounts: SubaccountsService,
  ) {}

  /**
   * Creates the canonical Doctor first (idempotent DB transaction), then handles
   * the existing Asaas creation ledger or verifies a parent-owned account.
   * A remote uncertainty never triggers a second Asaas POST.
   *
   * No automatic clinical approval or Auth user provisioning is performed.
   */
  async onboard(dto: DoctorOnboardingDto, key: string | undefined, actorId: string) {
    if (!key || !uuidPattern.test(key)) throw new BadRequestException('Idempotency-Key UUID obrigatório');
    if (!dto.doctor || !dto.mode) throw new BadRequestException('Dados profissionais e modo financeiro são obrigatórios');
    if (dto.administrativeConfirmed !== true) throw new BadRequestException('Confirme a conferência profissional realizada pela administração');
    const doctorCpf = digits(dto.doctor.cpfNormalized || '');
    if (doctorCpf.length !== 11) throw new BadRequestException('CPF do médico é obrigatório');
    assertCpf(doctorCpf);
    if (!dto.doctor.licenses?.length) throw new BadRequestException('Informe ao menos um CRM/UF válido');
    if (!actorId) throw new BadRequestException('Operador autenticado obrigatório');
    if (dto.localSubaccountId && dto.accountIdentifier)
      throw new BadRequestException('Escolha apenas uma conta financeira existente');
    if (dto.existingDoctorId && dto.mode !== DoctorOnboardingFinancialMode.LINK)
      throw new BadRequestException('Cadastro profissional existente só pode reutilizar conta financeira');
    if (dto.localSubaccountId && dto.mode !== DoctorOnboardingFinancialMode.LINK)
      throw new BadRequestException('Subconta local somente no modo de vínculo');

    // Verify local eligibility BEFORE recording or creating a professional. A local
    // wallet is never silently re-imported, re-created, or approved as ownership.
    const localAccount = dto.localSubaccountId
      ? await this.db.subaccount.findUnique({where:{id:dto.localSubaccountId}})
      : null;
    if (dto.localSubaccountId && (!localAccount || localAccount.type !== SubaccountType.DOCTOR ||
        !localAccount.active || localAccount.deletedAt || !localAccount.walletId ||
        !localAccount.asaasId || localAccount.asaasId.startsWith('external_')))
      throw new ConflictException('Subconta local indisponível ou sem carteira Asaas validada; revisão manual necessária');

    if (dto.mode === DoctorOnboardingFinancialMode.CREATE) {
      const account = dto.newAccount;
      if (!account || account.type !== SubaccountType.DOCTOR) {
        throw new BadRequestException('Conta financeira de Médico obrigatória');
      }
      const owner = digits(account.cpfCnpj || '');
      if (owner.length === 11) {
        assertCpf(owner);
        if (owner !== doctorCpf) throw new ConflictException('Titular CPF diferente do médico; revise antes de criar conta Asaas.');
        if (dto.doctor.birthDate && account.birthDate && dto.doctor.birthDate !== account.birthDate)
          throw new ConflictException('Nascimento profissional e financeiro divergentes');
      } else if (owner.length === 14) {
        if (!validCnpj(owner)) throw new BadRequestException('CNPJ do titular inválido');
      } else throw new BadRequestException('CPF/CNPJ do titular inválido');
    } else if (dto.mode === DoctorOnboardingFinancialMode.LINK) {
      if (!dto.localSubaccountId && !dto.accountIdentifier?.trim()) throw new BadRequestException('Identificador de subconta Asaas obrigatório');
    } else {
      throw new BadRequestException('Modo financeiro inválido');
    }

    // Reserve the full workflow's intent before either a local Doctor or remote
    // Asaas side effect. A reused key cannot change the operation mode/account.
    const requestHash=createHash('sha256').update(stableStringify(dto)).digest('hex');
    const replay=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
    if (replay) {
      if (replay.kind!=='DOCTOR_ONBOARD' || replay.requestHash!==requestHash)
        throw new ConflictException('Chave de operação utilizada com outro cadastro ou modo financeiro');
    } else {
      try {
        await this.db.doctorProvisioningOperation.create({data:{
          kind:'DOCTOR_ONBOARD',idempotencyKey:key,requestHash,status:'PENDING',actorUserId:actorId,
          ...(dto.identityEvidenceReference?{evidenceReference:dto.identityEvidenceReference.trim()}:{}),
        }});
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code!=='P2002') throw error;
        const concurrent=await this.db.doctorProvisioningOperation.findUnique({where:{idempotencyKey:key}});
        if (!concurrent || concurrent.kind!=='DOCTOR_ONBOARD' || concurrent.requestHash!==requestHash)
          throw new ConflictException('Chave de operação utilizada simultaneamente com outra solicitação');
      }
    }

    // Continue the explicitly selected identity; never silently infer a Doctor
    // from financial name/e-mail or create a duplicate when CPF/CRM already exists.
    let doctor;
    if (dto.existingDoctorId) {
      const current = await this.doctors.detail(dto.existingDoctorId);
      if (current.cpfNormalized !== doctorCpf)
        throw new ConflictException('CPF não corresponde ao profissional selecionado; confira identidade');
      if (current.msgdeskOrganizationId && dto.integrationId) {
        const integration = await this.db.integrationApiKey.findUnique({where:{id:dto.integrationId}});
        if (!integration || integration.doctorOrganizationId !== current.msgdeskOrganizationId)
          throw new ConflictException('Profissional já pertence a outra organização');
      }
      const sameLicense = dto.doctor.licenses.every(input => current.licenses.some(
        license => license.crmNormalized === input.crmNormalized && license.state === input.state));
      if (current.licenses.length && !sameLicense)
        throw new ConflictException('CRM/UF divergente do profissional existente; revisão de identidade necessária');
      const missing: Record<string,string> = {};
      const fields = ['fullName','rg','rgIssuer','rgState','email','mobilePhone','postalCode',
        'street','streetNumber','addressComplement','neighborhood','city','state','country'] as const;
      for (const field of fields) {
        const provided = dto.doctor[field];
        if (!provided) continue;
        const original = current[field];
        if (original && original !== provided)
          throw new ConflictException('Dados profissionais divergentes; edite o cadastro existente após revisão');
        if (!original) missing[field] = provided;
      }
      if (dto.doctor.birthDate && current.birthDate &&
          current.birthDate.toISOString().slice(0,10) !== dto.doctor.birthDate.slice(0,10))
        throw new ConflictException('Nascimento divergente; revise a identidade do profissional');
      if (dto.doctor.birthDate && !current.birthDate) missing.birthDate=dto.doctor.birthDate;
      if (Object.keys(missing).length) await this.doctors.update(current.id,missing);
      if (!current.licenses.length) for (const input of dto.doctor.licenses)
        await this.doctors.addLicense(current.id,input);
      doctor = await this.doctors.detail(current.id);
    } else {
      // DOCTOR_CREATE is independently idempotent and rejects CPF/CRM duplicates.
      doctor = await this.doctors.create(
        {...dto.doctor, cpfNormalized:doctorCpf}, derivedKey(key,'professional'));
    }

    await this.db.doctorProvisioningOperation.update({where:{idempotencyKey:key},data:{doctorId:doctor.id}});

    const account = localAccount ?? (dto.mode === DoctorOnboardingFinancialMode.CREATE
      ? await this.subaccounts.create(dto.newAccount!, financialKey(key), true)
      : await this.subaccounts.linkManagedDoctorAccount(dto.accountIdentifier!));

    if (account.type !== SubaccountType.DOCTOR || !account.walletId ||
        !account.asaasId || account.asaasId.startsWith('external_') || account.deletedAt || !account.active) {
      throw new ConflictException('Conta financeira não elegível; reconciliação administrativa necessária');
    }
    // The internal administrator confirmed identity; a validated CPF-matching
    // individual wallet needs no second review. A PJ or mismatch stays exceptional.
    const sameCpf = digits(account.cpfCnpj) === doctorCpf;
    if (!sameCpf && digits(account.cpfCnpj).length === 11)
      throw new ConflictException('CPF do titular da carteira incompatível com o profissional');
    try {
      await this.db.$transaction(async tx => {
        const active = await tx.doctorFinancialLink.findMany({
          where:{active:true,OR:[{doctorId:doctor.id},{subaccountId:account.id}]},
        });
        if (active.some(link => link.doctorId !== doctor.id || link.subaccountId !== account.id))
          throw new ConflictException('Profissional ou carteira já tem outro vínculo financeiro ativo');
        if (active.length) {
          if(active[0].status==='REJECTED') throw new ConflictException('Vínculo rejeitado exige regularização excepcional');
          if(sameCpf && active[0].status==='PENDING_REVIEW')
            await tx.doctorFinancialLink.updateMany({
              where:{id:active[0].id,active:true,status:'PENDING_REVIEW'},
              data:{status:'VERIFIED',verifiedAt:new Date()},
            });
          return;
        }
        await tx.doctorFinancialLink.create({data:{
          doctorId:doctor.id,subaccountId:account.id,active:true,
          status:sameCpf?'VERIFIED':'PENDING_REVIEW',
          ...(sameCpf?{verifiedAt:new Date()}:{}),
        }});
      }, {isolationLevel:Prisma.TransactionIsolationLevel.Serializable});
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034')
        throw new ConflictException('Operação simultânea detectada; recarregue e repita com a mesma chave.');
      throw error;
    }

    // Confirm the decision taken before creating the professional, with authenticated actor and time.
    await this.doctors.confirmAdministrativeRegistration(doctor.id,actorId);
    const integrationId=await this.doctors.resolveOnboardingIntegration(dto.integrationId);
    if(integrationId)
      await this.doctors.associateOrganization(doctor.id,integrationId,actorId,dto.evidenceReference);

    await this.db.doctorProvisioningOperation.update({where:{idempotencyKey:key},data:{status:'COMPLETED',resultDoctorId:doctor.id}});
    const canonical = await this.doctors.detail(doctor.id);
    return {
      doctor:canonical,
      financialOwnershipVerified:sameCpf,
      financialAccountReused:dto.mode===DoctorOnboardingFinancialMode.LINK,
      existingProfessionalReused:!!dto.existingDoctorId,
      asaasStatus:account.asaasGeneralStatus ?? null,
      clinicalAccessActive:canonical.accessActive,
      msgdeskProvisioningStatus:canonical.provisioningStatus,
      message:!sameCpf
        ? 'Cadastro profissional confirmado. Titularidade financeira PJ ainda exige revisão excepcional.'
        : !canonical.msgdeskOrganizationId
          ? 'Cadastro e carteira confirmados. Associação MsgDesk pendente; acesso clínico ainda não habilitado.'
          : 'Cadastro, carteira e organização associados. A habilitação clínica continua separada no MsgDesk.',
    };
  }
}
