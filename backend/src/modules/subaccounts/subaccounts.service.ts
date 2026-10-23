import { Injectable, Logger, NotFoundException, BadRequestException, ConflictException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { FulfillmentType, SubaccountType, Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { AsaasApiException } from '../../asaas/asaas.service';
import {
  CreateSubaccountDto,
  UpdateSubaccountDto,
  UpdateSubaccountMetadataDto,
  ListSubaccountsDto,
  LinkExistingSubaccountDto,
} from './subaccounts.dto';

@Injectable()
export class SubaccountsService {
  private readonly logger = new Logger(SubaccountsService.name);

  // Tempo de vida do cache do status geral do Asaas (GET /myAccount/status),
  // para evitar consultar o Asaas a cada renderização da lista de subcontas.
  private readonly STATUS_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private sanitize<T extends { apiKey?: string | null }>({ apiKey, ...rest }: T) {
    return rest;
  }

  // Subcontas "vinculadas externamente" sem correspondência real no Asaas
  // recebem um asaasId sintético (ver linkExisting). Nunca são elegíveis
  // para operações que dependem de um ID de conta Asaas real.
  private isRealAsaasId(asaasId: string | null | undefined): boolean {
    return !!asaasId && !asaasId.startsWith('external_');
  }

  private validateLocalMetadata(
    type: SubaccountType,
    fulfillmentType: FulfillmentType | null | undefined,
    requireSupplierFulfillment = false,
  ): void {
    if (type === SubaccountType.SUPPLIER) {
      if (requireSupplierFulfillment && !fulfillmentType) {
        throw new BadRequestException(
          'Fornecedores precisam ter a modalidade Nacional ou Internacional configurada.',
        );
      }
      return;
    }

    if (fulfillmentType != null) {
      throw new BadRequestException(
        'A modalidade Nacional/Internacional só pode ser configurada em subcontas do tipo Fornecedor.',
      );
    }
  }

  // Consulta GET /myAccount/status (com a apiKey DA PRÓPRIA SUBCONTA) e atualiza
  // o cache local (asaasGeneralStatus/asaasStatusCheckedAt). Nunca lança: se a
  // consulta falhar, registra um warning e preserva o último status conhecido,
  // para que uma falha isolada nunca derrube a listagem inteira de subcontas.
  private async refreshAsaasStatus<
    T extends {
      id: string;
      asaasId: string;
      apiKey: string | null;
      asaasGeneralStatus: string | null;
      asaasStatusCheckedAt: Date | null;
    },
  >(subaccount: T): Promise<T> {
    if (!subaccount.apiKey || !this.isRealAsaasId(subaccount.asaasId)) {
      return subaccount;
    }

    const isStale =
      !subaccount.asaasStatusCheckedAt ||
      Date.now() - subaccount.asaasStatusCheckedAt.getTime() > this.STATUS_CACHE_TTL_MS;

    if (!isStale) {
      return subaccount;
    }

    try {
      const status = await this.asaas.requestWithApiKey<{ general?: string }>(
        'GET',
        '/myAccount/status',
        subaccount.apiKey,
      );

      const asaasGeneralStatus = status?.general ?? null;
      const asaasStatusCheckedAt = new Date();

      await this.prisma.subaccount.update({
        where: { id: subaccount.id },
        data: { asaasGeneralStatus, asaasStatusCheckedAt },
      });

      return { ...subaccount, asaasGeneralStatus, asaasStatusCheckedAt };
    } catch (error) {
      this.logger.warn(
        `Falha ao consultar status Asaas (myAccount/status) da subconta ${subaccount.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      // Preserva o último status conhecido em vez de propagar o erro.
      return subaccount;
    }
  }

  // Calcula se a ação "Reenviar link de ativação" pode ser oferecida.
  //
  // IMPORTANTE: asaasGeneralStatus !== 'APPROVED' significa apenas que a
  // aprovação cadastral da conta ainda está em andamento — NÃO significa que
  // o e-mail de ativação não foi confirmado, nem que o link expirou. A
  // elegibilidade real do reenvio é sempre validada pelo próprio Asaas em
  // POST /accounts/{id}/resendActivationLink; este campo só controla se a
  // ação de recuperação é exibida como opção.
  private computeCanResendActivation(subaccount: {
    deletedAt: Date | null;
    asaasId: string;
    email: string | null;
    activationResentAt: Date | null;
    asaasGeneralStatus: string | null;
  }): boolean {
    if (subaccount.deletedAt) return false;
    if (!this.isRealAsaasId(subaccount.asaasId)) return false;
    if (!subaccount.email) return false;
    // O Asaas permite apenas um reenvio — se já usamos, nunca mais oferecer.
    if (subaccount.activationResentAt) return false;
    // Status desconhecido (nunca consultado com sucesso): comportamento
    // conservador — não afirma que está pendente nem que está aprovado.
    if (!subaccount.asaasGeneralStatus) return false;
    if (subaccount.asaasGeneralStatus === 'APPROVED') return false;
    return true;
  }

  /**
   * Safe remote creation: an operation is durably reserved BEFORE network I/O.
   * An uncertain remote outcome is never retried automatically. Replays either
   * return a confirmed local account or require manual reconciliation.
   */
  async create(dto: CreateSubaccountDto, key?: string, fromDoctorOnboarding = false) {
    if (dto.type === SubaccountType.DOCTOR && !fromDoctorOnboarding) {
      throw new BadRequestException('Cadastre médicos exclusivamente pelo fluxo unificado em Subcontas > Adicionar médico.');
    }
    if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
      throw new BadRequestException('Idempotency-Key UUID obrigatório para criar subconta');
    }
    const localType = dto.type as SubaccountType;
    this.validateLocalMetadata(localType, dto.fulfillmentType, true);
    if (!Number.isFinite(dto.incomeValue) || dto.incomeValue <= 0) {
      throw new BadRequestException('incomeValue deve ser positivo');
    }
    const requestHash = createHash('sha256').update(JSON.stringify({
      name:dto.name,cpfCnpj:dto.cpfCnpj,email:dto.email,
      phone:dto.phone,mobilePhone:dto.mobilePhone,companyType:dto.companyType,
      postalCode:dto.postalCode,address:dto.address,addressNumber:dto.addressNumber,
      complement:dto.complement,province:dto.province,birthDate:dto.birthDate,
      incomeValue:dto.incomeValue,type:dto.type,fulfillmentType:dto.fulfillmentType,
    })).digest('hex');

    const replay = async () => {
      const previous = await this.prisma.subaccountCreateOperation.findUnique({
        where: { idempotencyKey:key },
      });
      if (!previous) return null;
      if (previous.requestHash !== requestHash) {
        throw new BadRequestException('Idempotency-Key já usada com payload diferente');
      }
      if (previous.status === 'COMPLETED' && previous.localSubaccountId) {
        const local = await this.prisma.subaccount.findUnique({
          where:{id:previous.localSubaccountId},
        });
        if (!local) throw new HttpException('Subconta requer reconciliação',409);
        return this.sanitize(local);
      }
      throw new HttpException({
        message:'Resultado da criação de subconta incerto. Não repetir o POST no Asaas.',
        status:previous.status,operationId:previous.id,
      },409);
    };
    const existing = await replay();
    if (existing) return existing;

    // Reservation is the durable no-double-POST barrier.
    let operation:{id:string};
    try {
      operation = await this.prisma.subaccountCreateOperation.create({
        data:{idempotencyKey:key,requestHash,status:'SENDING'},
        select:{id:true},
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return (await replay())!;
      }
      throw error;
    }

    const payload:Record<string,unknown>={
      name:dto.name,cpfCnpj:dto.cpfCnpj,email:dto.email,phone:dto.phone,
      mobilePhone:dto.mobilePhone,companyType:dto.companyType,postalCode:dto.postalCode,
      address:dto.address,addressNumber:dto.addressNumber,complement:dto.complement,
      province:dto.province,incomeValue:dto.incomeValue,
    };
    if (dto.birthDate) payload.birthDate = dto.birthDate;

    let remote:{id:string;walletId:string;apiKey?:string};
    try {
      remote = await this.asaas.post<{id:string;walletId:string;apiKey?:string}>('/accounts',payload);
    } catch (error) {
      // Known email conflict may mean an EXISTING locally soft-deleted account.
      // Reactivate only after matching immutable CPF/CNPJ; no new remote POST.
      const response=error instanceof HttpException ? error.getResponse() : null;
      const details=response && typeof response==='object'
        ? (response as {details?:{errors?:Array<{description?:string}>}}).details : null;
      const emailUsed=details?.errors?.some(e=>e.description?.includes('já está em uso'));
      if (emailUsed && dto.email) {
        const deleted = await this.prisma.subaccount.findFirst({
          where:{email:dto.email,cpfCnpj:dto.cpfCnpj,deletedAt:{not:null}},
        });
        if (deleted && this.isRealAsaasId(deleted.asaasId)) {
          const updated = await this.prisma.$transaction(async tx=>{
            const result=await tx.subaccount.update({
              where:{id:deleted.id}, data:{
                name:dto.name,phone:dto.phone,mobilePhone:dto.mobilePhone,
                type:localType,fulfillmentType:localType==='SUPPLIER'
                  ? dto.fulfillmentType! : null,active:true,deletedAt:null,
              },
            });
            await tx.subaccountCreateOperation.update({
              where:{id:operation.id},data:{
                status:'COMPLETED',remoteAccountId:result.asaasId,
                localSubaccountId:result.id,
              },
            });
            return result;
          });
          return this.sanitize(updated);
        }
      }
      await this.prisma.subaccountCreateOperation.update({
        where:{id:operation.id},
        data:{status:'NEEDS_RECONCILIATION',errorCode:'REMOTE_OUTCOME_UNKNOWN'},
      });
      throw new HttpException({
        message:'Verifique a operação no Asaas antes de tentar novamente.',
        operationId:operation.id,
      },409);
    }
    if (!remote?.id || !remote.walletId) {
      await this.prisma.subaccountCreateOperation.update({
        where:{id:operation.id},data:{status:'NEEDS_RECONCILIATION',errorCode:'REMOTE_MISSING_ID'},
      });
      throw new HttpException({message:'Resposta incompleta do Asaas; reconciliação necessária',operationId:operation.id},409);
    }
    // Save provider ID before local creation: if persistence fails, a trusted
    // operator has a reference to reconcile without creating another account.
    await this.prisma.subaccountCreateOperation.update({
      where:{id:operation.id},
      data:{status:'RESPONSE_RECEIVED',remoteAccountId:remote.id},
    });
    try {
      const local=await this.prisma.$transaction(async tx=>{
        const saved=await tx.subaccount.create({
          data:{
            asaasId:remote.id,walletId:remote.walletId,apiKey:remote.apiKey??null,
            name:dto.name,cpfCnpj:dto.cpfCnpj,email:dto.email,
            phone:dto.phone,mobilePhone:dto.mobilePhone,type:localType,
            fulfillmentType:localType==='SUPPLIER' ? dto.fulfillmentType! : null,
          },
        });
        await tx.subaccountCreateOperation.update({
          where:{id:operation.id},data:{status:'COMPLETED',localSubaccountId:saved.id},
        });
        return saved;
      });
      return this.sanitize(local);
    } catch {
      await this.prisma.subaccountCreateOperation.update({
        where:{id:operation.id},data:{status:'NEEDS_RECONCILIATION',errorCode:'LOCAL_PERSIST_FAILED'},
      });
      throw new HttpException({
        message:'Asaas respondeu, mas o vínculo local requer reconciliação manual.',
        operationId:operation.id,
      },409);
    }
  }


  /**
   * Match only accounts returned by the authenticated parent Asaas account.
   * No external_ placeholders or self-declared wallet ownership for doctors.
   * May be called more than once after a partial onboarding failure.
   */
  async linkManagedDoctorAccount(identifier: string) {
    const id = identifier.trim();
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(id)) {
      throw new BadRequestException('Identificador Asaas inválido');
    }
    type ParentAccount = { id: string; walletId: string; name: string; cpfCnpj: string; email?: string };
    let account: ParentAccount | undefined;
    try {
      account = await this.asaas.get<ParentAccount>('/accounts/' + encodeURIComponent(id));
    } catch (error) {
      if (!(error instanceof AsaasApiException) || ![400,404].includes(error.providerStatus ?? 0)) throw error;
    }
    if (!account) {
      const limit = 100;
      for (let page = 0; page < 100; page++) {
        const response = await this.asaas.get<{data: ParentAccount[]; hasMore?: boolean}>(
          `/accounts?offset=${page * limit}&limit=${limit}`,
        );
        if (!Array.isArray(response.data)) throw new ConflictException('Resposta de subcontas Asaas inválida');
        account = response.data.find(a => a.id === id || a.walletId === id);
        if (account || response.hasMore === false || response.data.length < limit) break;
        if (page === 99) throw new ConflictException('Listagem Asaas excedeu limite; reconciliação necessária');
      }
    }
    if (!account || !account.id || !account.walletId || !account.cpfCnpj || !account.name) {
      throw new BadRequestException('Conta não verificável entre as subcontas da conta-pai Asaas.');
    }
    const cpfCnpj = account.cpfCnpj.replace(/\D/g, '');
    if (![11, 14].includes(cpfCnpj.length)) {
      throw new ConflictException('Titularidade Asaas indisponível para conferência; solicitar revisão.');
    }
    const previous = await this.prisma.subaccount.findFirst({
      where: { OR: [{asaasId:account.id}, {walletId:account.walletId}] },
    });
    if (previous) {
      if (previous.deletedAt || previous.type !== SubaccountType.DOCTOR ||
        previous.asaasId !== account.id || previous.walletId !== account.walletId ||
        previous.cpfCnpj.replace(/\D/g, '') !== cpfCnpj) {
        throw new ConflictException('Conta já cadastrada com vínculo, tipo ou dados conflitantes; revisão obrigatória.');
      }
      return this.sanitize(previous);
    }
    try {
      const saved = await this.prisma.subaccount.create({data:{
        asaasId:account.id,walletId:account.walletId,
        name:account.name,cpfCnpj,email:account.email || null,type:SubaccountType.DOCTOR,
      }});
      return this.sanitize(saved);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('Conta vinculada simultaneamente; recarregue e revise o vínculo.');
      }
      throw error;
    }
  }

  async linkExisting(dto: LinkExistingSubaccountDto) {
    if (dto.type === SubaccountType.DOCTOR) {
      throw new BadRequestException('Vinculação médica disponível somente pelo cadastro unificado.');
    }
    const localType = (dto.type ?? SubaccountType.OTHER) as SubaccountType;
    this.validateLocalMetadata(localType, dto.fulfillmentType, true);

    // Verifica se já existe localmente (ativa)
    const existing = await this.prisma.subaccount.findFirst({
      where: { OR: [{ walletId: dto.walletId }, { asaasId: dto.walletId }], deletedAt: null },
    });
    if (existing) {
      throw new BadRequestException(`Subconta "${existing.name}" já está vinculada com este ID`);
    }

    // Tenta buscar nas subcontas do Asaas
    let accountName = dto.name;
    let accountCpfCnpj = dto.cpfCnpj;
    let accountEmail = dto.email;
    let accountAsaasId: string | null = null;
    let accountWalletId = dto.walletId;

    try {
      let account: {id:string;walletId:string;name:string;cpfCnpj:string;email:string} | undefined;
      const limit = 100;
      for (let page = 0; page < 1000; page++) {
        const offset = page * limit;
        const response = await this.asaas.get<{
          data: Array<{id:string;walletId:string;name:string;cpfCnpj:string;email:string}>;
          hasMore?: boolean;
        }>(`/accounts?offset=${offset}&limit=${limit}`);
        if (!Array.isArray(response.data)) throw new Error('Resposta de subcontas Asaas inválida');
        account = response.data.find(a => a.walletId === dto.walletId || a.id === dto.walletId);
        if (account || response.hasMore === false || response.data.length < limit) break;
      }


      if (account) {
        accountName = account.name;
        accountCpfCnpj = account.cpfCnpj;
        accountEmail = account.email;
        accountAsaasId = account.id;
        accountWalletId = account.walletId;
      }
    } catch (error) {
      this.logger.warn('Erro ao buscar subcontas do Asaas, usando dados manuais', error);
    }

    // Se não encontrou no Asaas, exige dados manuais
    if (!accountAsaasId && (!accountName || !accountCpfCnpj)) {
      throw new BadRequestException('Conta não encontrada nas subcontas Asaas. Informe nome e CPF/CNPJ para vincular como conta externa.');
    }

    const subaccount = await this.prisma.subaccount.create({
      data: {
        asaasId: accountAsaasId || `external_${accountWalletId}`,
        walletId: accountWalletId,
        name: accountName!,
        cpfCnpj: accountCpfCnpj!,
        email: accountEmail || null,
        type: localType,
        fulfillmentType:
          localType === SubaccountType.SUPPLIER ? dto.fulfillmentType! : null,
      },
    });

    this.logger.log(`Subconta vinculada: ${subaccount.name} (${subaccount.type}) — Wallet: ${accountWalletId}`);
    return this.sanitize(subaccount);
  }

  async findAll(query: ListSubaccountsDto) {
    const { page = 1, limit = 20, search, active, type } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { deletedAt: null };
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { cpfCnpj: { contains: search } },
      ];
    }
    if (active !== undefined) where.active = active;
    if (type) where.type = type;

    const [data, total] = await Promise.all([
      this.prisma.subaccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          _count: { select: { chargeSplits: true, splitResults: true } },
        },
      }),
      this.prisma.subaccount.count({ where }),
    ]);

    // Agregar receita recebida por subconta
    const subIds = data.map(s => s.id);
    const splitAgg = await this.prisma.splitResult.groupBy({
      by: ['receiverSubaccountId'],
      where: { receiverSubaccountId: { in: subIds }, status: 'COMPLETED' },
      _sum: { value: true },
    });
    const revenueMap = new Map(splitAgg.map(a => [a.receiverSubaccountId, Number(a._sum.value || 0)]));

    // Atualiza o cache de status Asaas (com TTL) de cada subconta em paralelo.
    // refreshAsaasStatus nunca lança — uma falha isolada não derruba a listagem.
    const withStatus = await Promise.all(data.map((s) => this.refreshAsaasStatus(s)));

    return {
      data: withStatus.map(s => ({
        ...this.sanitize(s),
        totalReceived: revenueMap.get(s.id) || 0,
        canResendActivation: this.computeCanResendActivation(s),
      })),
      total, page, limit, totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const subaccount = await this.prisma.subaccount.findFirst({
      where: { id, deletedAt: null },
      include: {
        _count: { select: { chargeSplits: true, splitResults: true } },
      },
    });
    if (!subaccount) throw new NotFoundException('Subconta não encontrada');
    return { ...this.sanitize(subaccount), canResendActivation: this.computeCanResendActivation(subaccount) };
  }

  async getFinancialHistory(id: string) {
    await this.findOne(id);

    const splitResults = await this.prisma.splitResult.findMany({
      where: { receiverSubaccountId: id },
      include: {
        charge: { select: { id: true, asaasId: true, value: true, status: true, customerName: true, description: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    const totalReceived = splitResults
      .filter((s) => s.status === 'COMPLETED')
      .reduce((sum, s) => sum + Number(s.value), 0);

    const totalPending = splitResults
      .filter((s) => s.status === 'PENDING')
      .reduce((sum, s) => sum + Number(s.value), 0);

    return { splitResults, totalReceived, totalPending };
  }

  async update(id: string, dto: UpdateSubaccountDto) {
    const subaccount = await this.findOne(id);

    if (this.isRealAsaasId(subaccount.asaasId)) {
      await this.asaas.put(`/accounts/${subaccount.asaasId}`, dto);
    }

    const updated = await this.prisma.subaccount.update({ where: { id }, data: dto });
    return this.sanitize(updated);
  }

  async updateMetadata(id: string, dto: UpdateSubaccountMetadataDto) {
    const subaccount = await this.prisma.subaccount.findFirst({
      where: { id, deletedAt: null },
    });
    if (!subaccount) throw new NotFoundException('Subconta não encontrada');

    const nextType = (dto.type ?? subaccount.type) as SubaccountType;
    if (nextType === SubaccountType.DOCTOR && subaccount.type !== SubaccountType.DOCTOR) {
      throw new BadRequestException('Conversão para Médico requer o cadastro profissional e vínculo validado.');
    }

    if (subaccount.type === SubaccountType.DOCTOR && nextType !== SubaccountType.DOCTOR) {
      const linked = await this.prisma.doctorFinancialLink.count({
        where:{subaccountId:subaccount.id,active:true},
      });
      if (linked) throw new ConflictException(
        'Subconta associada a médico ativo. Revise o vínculo profissional antes de alterar o tipo.',
      );
    }

    if (nextType !== SubaccountType.SUPPLIER && dto.fulfillmentType != null) {
      this.validateLocalMetadata(nextType, dto.fulfillmentType, false);
    }

    const requestedFulfillment =
      nextType === SubaccountType.SUPPLIER
        ? dto.fulfillmentType !== undefined
          ? dto.fulfillmentType
          : subaccount.fulfillmentType
        : null;

    this.validateLocalMetadata(nextType, requestedFulfillment, true);

    const updated = await this.prisma.subaccount.update({
      where: { id },
      data: {
        type: nextType,
        fulfillmentType:
          nextType === SubaccountType.SUPPLIER ? requestedFulfillment! : null,
      },
    });

    // Deliberadamente NÃO chama Asaas: type/fulfillmentType são metadados internos.
    return this.sanitize(updated);
  }

  async toggleActive(id: string) {
    const subaccount = await this.findOne(id);
    const toggled = await this.prisma.subaccount.update({
      where: { id },
      data: { active: !subaccount.active },
    });
    return this.sanitize(toggled);
  }

  async remove(id: string) {
    const subaccount = await this.findOne(id);

    const updated = await this.prisma.subaccount.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });

    this.logger.log(`Subconta removida (soft delete): ${subaccount.name} — Asaas: ${subaccount.asaasId}`);
    return this.sanitize(updated);
  }

  // Reenvia o e-mail de ativação da subconta Asaas (POST /accounts/{asaasId}/resendActivationLink),
  // autenticado com a API Key DA CONTA-PAI (assim como as demais operações /accounts).
  // O Asaas permite apenas UM reenvio por subconta, então activationResentAt só é
  // gravado após confirmação real (204) do Asaas — nunca de forma otimista.
  async resendActivation(id: string) {
    const subaccount = await this.prisma.subaccount.findFirst({ where: { id, deletedAt: null } });
    if (!subaccount) throw new NotFoundException('Subconta não encontrada');

    if (!this.isRealAsaasId(subaccount.asaasId)) {
      throw new BadRequestException(
        'Esta subconta não possui um ID Asaas válido (conta vinculada externamente) — não é possível reenviar o link de ativação.',
      );
    }

    if (subaccount.activationResentAt) {
      throw new BadRequestException('O link de ativação desta subconta já foi reenviado anteriormente.');
    }

    if (subaccount.asaasGeneralStatus === 'APPROVED') {
      throw new BadRequestException('Esta subconta já está aprovada pelo Asaas — o reenvio do link de ativação não é necessário.');
    }

    // Fonte final de verdade: se o Asaas recusar (já ativado, já reenviado,
    // não elegível etc.), o erro é propagado com a mensagem original do Asaas
    // e activationResentAt permanece null.
    await this.asaas.post<void>(`/accounts/${subaccount.asaasId}/resendActivationLink`);

    const resentAt = new Date();
    await this.prisma.subaccount.update({
      where: { id },
      data: { activationResentAt: resentAt },
    });

    this.logger.log(`Link de ativação reenviado com sucesso — Asaas: ${subaccount.asaasId}`);

    return {
      success: true,
      message: 'Novo link de ativação enviado com sucesso.',
      resentAt,
    };
  }

  async syncFromAsaas() {
    // All pages are read. External synthetic IDs are never overwritten silently:
    // a wallet already represented locally is sent to manual reconciliation.
    let offset = 0;
    const limit = 100;
    let count = 0;
    let review = 0;
    for (let page = 0; page < 1000; page++) {
      const response = await this.asaas.get<{
        data: Array<{ id: string; walletId: string; name: string; cpfCnpj: string; email: string }>;
        hasMore?: boolean;
      }>(`/accounts?offset=${offset}&limit=${limit}`);
      if (!Array.isArray(response.data)) throw new Error('Resposta Asaas inválida na sincronização');
      for (const account of response.data) {
        const duplicateWallet = account.walletId
          ? await this.prisma.subaccount.findFirst({ where: { walletId: account.walletId } })
          : null;
        if (duplicateWallet && duplicateWallet.asaasId !== account.id) {
          review++;
          continue;
        }
        await this.prisma.subaccount.upsert({
          where: { asaasId: account.id },
          update: { name: account.name, email: account.email },
          create: {
            asaasId: account.id,
            walletId: account.walletId,
            name: account.name,
            cpfCnpj: account.cpfCnpj,
            email: account.email,
          },
        });
        count++;
      }
      offset += response.data.length;
      if (response.hasMore === false || response.data.length < limit) {
        this.logger.log(`Sincronização Asaas concluída: ${count} processadas, ${review} carteiras em revisão`);
        return {processed:count,needsReview:review};
      }
    }
    throw new Error('Paginação Asaas excedeu limite de segurança; revisar manualmente');
  }
}
