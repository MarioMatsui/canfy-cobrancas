import { Injectable, Logger, NotFoundException, BadRequestException, HttpException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { CreateSubaccountDto, UpdateSubaccountDto, ListSubaccountsDto, LinkExistingSubaccountDto } from './subaccounts.dto';

@Injectable()
export class SubaccountsService {
  private readonly logger = new Logger(SubaccountsService.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private sanitize<T extends { apiKey?: string | null }>({ apiKey, ...rest }: T) {
    return rest;
  }

  async create(dto: CreateSubaccountDto) {
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
                type: dto.type,
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
        type: dto.type,
      },
    });

    this.logger.log(`Subconta criada: ${subaccount.name} (${subaccount.type}) — Asaas: ${asaasAccount.id}`);
    return this.sanitize(subaccount);
  }

  async linkExisting(dto: LinkExistingSubaccountDto) {
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
        type: dto.type || 'OTHER',
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

    return {
      data: data.map(s => ({ ...this.sanitize(s), totalReceived: revenueMap.get(s.id) || 0 })),
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
    return this.sanitize(subaccount);
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
