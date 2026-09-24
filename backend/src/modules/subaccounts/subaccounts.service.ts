import { Injectable, Logger, NotFoundException, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { FulfillmentType, SubaccountType } from '@prisma/client';
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

  async create(dto: CreateSubaccountDto) {
    const localType = dto.type as SubaccountType;
    this.validateLocalMetadata(localType, dto.fulfillmentType, true);

    // Cria subconta no Asaas
    const asaasPayload: Record<string, unknown> = {
      name: dto.name,
      cpfCnpj: dto.cpfCnpj,
      email: dto.email,
      phone: dto.phone,
      mobilePhone: dto.mobilePhone,
      companyType: dto.companyType,
      postalCode: dto.postalCode,
      address: dto.address,
      addressNumber: dto.addressNumber,
      complement: dto.complement,
      province: dto.province,
    };

    if (dto.birthDate) asaasPayload.birthDate = dto.birthDate;
    if (dto.incomeValue) asaasPayload.incomeValue = dto.incomeValue;

    let asaasAccount: { id: string; walletId: string; apiKey?: string };

    try {
      asaasAccount = await this.asaas.post<{ id: string; walletId: string; apiKey?: string }>('/accounts', asaasPayload);
    } catch (error) {
      // Se o email já está em uso no Asaas, tenta reativar subconta soft-deleted
      if (dto.email && error instanceof HttpException) {
        const errorResponse = error.getResponse() as { details?: { errors?: Array<{ code: string; description: string }> } };
        const emailInUse = errorResponse?.details?.errors?.some(
          (e) => e.description?.includes('já está em uso'),
        );

        if (emailInUse) {
          const deleted = await this.prisma.subaccount.findFirst({
            where: { email: dto.email, deletedAt: { not: null } },
          });

          if (deleted) {
            const reactivated = await this.prisma.subaccount.update({
              where: { id: deleted.id },
              data: {
                name: dto.name,
                cpfCnpj: dto.cpfCnpj,
                phone: dto.phone,
                mobilePhone: dto.mobilePhone,
                type: localType,
                fulfillmentType:
                  localType === SubaccountType.SUPPLIER ? dto.fulfillmentType! : null,
                active: true,
                deletedAt: null,
              },
            });
            this.logger.log(`Subconta reativada: ${reactivated.name} (${reactivated.email}) — Asaas: ${reactivated.asaasId}`);
            return this.sanitize(reactivated);
          }
        }
      }
      throw error;
    }

    // Persiste localmente (inclui apiKey para referência futura)
    const subaccount = await this.prisma.subaccount.create({
      data: {
        asaasId: asaasAccount.id,
        walletId: asaasAccount.walletId,
        apiKey: asaasAccount.apiKey || null,
        name: dto.name,
        cpfCnpj: dto.cpfCnpj,
        email: dto.email,
        phone: dto.phone,
        mobilePhone: dto.mobilePhone,
        type: localType,
        fulfillmentType:
          localType === SubaccountType.SUPPLIER ? dto.fulfillmentType! : null,
      },
    });

    this.logger.log(`Subconta criada: ${subaccount.name} (${subaccount.type}) — Asaas: ${asaasAccount.id}`);
    return this.sanitize(subaccount);
  }

  async linkExisting(dto: LinkExistingSubaccountDto) {
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
      const accounts = await this.asaas.get<{ data: Array<{ id: string; walletId: string; name: string; cpfCnpj: string; email: string }> }>('/accounts');
      const account = accounts.data.find((a) => a.walletId === dto.walletId || a.id === dto.walletId);

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

    if (subaccount.asaasId) {
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
    const response = await this.asaas.get<{ data: Array<{ id: string; walletId: string; name: string; cpfCnpj: string; email: string }> }>('/accounts');

    for (const account of response.data) {
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
    }

    this.logger.log(`Sincronizadas ${response.data.length} subcontas do Asaas`);
  }
}
