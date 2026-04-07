import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { AsaasService } from '../../asaas/asaas.service';
import { CreateSubaccountDto, UpdateSubaccountDto, ListSubaccountsDto } from './subaccounts.dto';

@Injectable()
export class SubaccountsService {
  private readonly logger = new Logger(SubaccountsService.name);

  constructor(
    private prisma: PrismaService,
    private asaas: AsaasService,
  ) {}

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
      province: dto.province,
    };

    if (dto.birthDate) asaasPayload.birthDate = dto.birthDate;
    if (dto.incomeValue) asaasPayload.incomeValue = dto.incomeValue;

    const asaasAccount = await this.asaas.post<{ id: string; walletId: string }>('/accounts', asaasPayload);

    // Persiste localmente
    const subaccount = await this.prisma.subaccount.create({
      data: {
        asaasId: asaasAccount.id,
        walletId: asaasAccount.walletId,
        name: dto.name,
        cpfCnpj: dto.cpfCnpj,
        email: dto.email,
        phone: dto.phone,
        mobilePhone: dto.mobilePhone,
        type: dto.type,
      },
    });

    this.logger.log(`Subconta criada: ${subaccount.name} (${subaccount.type}) — Asaas: ${asaasAccount.id}`);
    return subaccount;
  }

  async findAll(query: ListSubaccountsDto) {
    const { page = 1, limit = 20, search, active, type } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
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

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const subaccount = await this.prisma.subaccount.findUnique({
      where: { id },
      include: {
        _count: { select: { chargeSplits: true, splitResults: true } },
      },
    });
    if (!subaccount) throw new NotFoundException('Subconta não encontrada');
    return subaccount;
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

    return this.prisma.subaccount.update({ where: { id }, data: dto });
  }

  async toggleActive(id: string) {
    const subaccount = await this.findOne(id);
    return this.prisma.subaccount.update({
      where: { id },
      data: { active: !subaccount.active },
    });
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
