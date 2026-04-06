import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertSettingDto } from './settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private prisma: PrismaService) {}

  async getAll() {
    return this.prisma.setting.findMany({ orderBy: { key: 'asc' } });
  }

  async get(key: string): Promise<string | null> {
    const setting = await this.prisma.setting.findUnique({ where: { key } });
    return setting?.value ?? null;
  }

  async upsert(dto: UpsertSettingDto) {
    const setting = await this.prisma.setting.upsert({
      where: { key: dto.key },
      update: { value: dto.value, description: dto.description },
      create: { key: dto.key, value: dto.value, description: dto.description },
    });
    this.logger.log(`Configuração atualizada: ${dto.key} = ${dto.value}`);
    return setting;
  }

  async delete(key: string) {
    return this.prisma.setting.delete({ where: { key } });
  }

  async seedDefaults() {
    const defaults = [
      { key: 'default_doctor_percentage', value: '15', description: 'Percentual padrão para médicos em cobranças reutilizáveis' },
      { key: 'default_supplier_percentage', value: '70', description: 'Percentual padrão para fornecedores em cobranças avulsas' },
      { key: 'max_installments_custom', value: '5', description: 'Máximo de parcelas para cobranças avulsas' },
      { key: 'max_installments_reusable', value: '3', description: 'Máximo de parcelas para cobranças reutilizáveis' },
      { key: 'default_reusable_value', value: '99', description: 'Valor padrão para consulta médica (reutilizável)' },
    ];

    for (const d of defaults) {
      await this.prisma.setting.upsert({
        where: { key: d.key },
        update: {},
        create: d,
      });
    }

    this.logger.log('Configurações padrão criadas/verificadas');
    return { message: 'Configurações padrão aplicadas' };
  }
}
