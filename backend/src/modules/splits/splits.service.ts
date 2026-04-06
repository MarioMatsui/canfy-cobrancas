import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateSplitRuleDto, ListSplitRulesDto } from './splits.dto';

@Injectable()
export class SplitsService {
  private readonly logger = new Logger(SplitsService.name);

  constructor(private prisma: PrismaService) {}

  async createRule(dto: CreateSplitRuleDto) {
    // Valida que as subcontas existem
    const [chargeSubaccount, receiverSubaccount] = await Promise.all([
      this.prisma.subaccount.findUnique({ where: { id: dto.chargeSubaccountId } }),
      this.prisma.subaccount.findUnique({ where: { id: dto.receiverSubaccountId } }),
    ]);

    if (!chargeSubaccount) throw new NotFoundException('Subconta de cobrança não encontrada');
    if (!receiverSubaccount) throw new NotFoundException('Subconta recebedora não encontrada');

    // Valida que splits percentuais não passam de 100%
    if (dto.type === 'PERCENTAGE') {
      const existingRules = await this.prisma.splitRule.findMany({
        where: { chargeSubaccountId: dto.chargeSubaccountId, type: 'PERCENTAGE', active: true },
      });
      const totalPercent = existingRules.reduce((sum, r) => sum + Number(r.value), 0) + dto.value;
      if (totalPercent > 100) {
        throw new BadRequestException(`Total de splits percentuais excede 100% (atual: ${totalPercent}%)`);
      }
    }

    const rule = await this.prisma.splitRule.create({
      data: {
        chargeSubaccountId: dto.chargeSubaccountId,
        receiverSubaccountId: dto.receiverSubaccountId,
        type: dto.type,
        value: dto.value,
        description: dto.description,
      },
      include: { receiverSubaccount: { select: { name: true } } },
    });

    this.logger.log(`Regra de split criada: ${rule.id}`);
    return rule;
  }

  async findAllRules(query: ListSplitRulesDto) {
    const { chargeSubaccountId, active } = query;

    const where: Record<string, unknown> = {};
    if (chargeSubaccountId) where.chargeSubaccountId = chargeSubaccountId;
    if (active !== undefined) where.active = active;

    return this.prisma.splitRule.findMany({
      where,
      include: {
        chargeSubaccount: { select: { name: true } },
        receiverSubaccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deleteRule(id: string) {
    const rule = await this.prisma.splitRule.findUnique({ where: { id } });
    if (!rule) throw new NotFoundException('Regra de split não encontrada');
    return this.prisma.splitRule.update({ where: { id }, data: { active: false } });
  }

  async getSplitResultsByCharge(chargeId: string) {
    return this.prisma.splitResult.findMany({
      where: { chargeId },
      include: { receiverSubaccount: { select: { name: true } } },
    });
  }

  async getSplitHistory(query: ListSplitRulesDto) {
    const where: Record<string, unknown> = {};
    if (query.chargeSubaccountId) {
      where.charge = { subaccountId: query.chargeSubaccountId };
    }

    return this.prisma.splitResult.findMany({
      where,
      include: {
        charge: { select: { asaasId: true, value: true, status: true } },
        receiverSubaccount: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }
}
