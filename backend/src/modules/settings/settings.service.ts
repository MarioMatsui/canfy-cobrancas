import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { UpsertSettingDto } from './settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(private readonly prisma: PrismaService) {}

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
      { key: 'default_doctor_percentage', value: '85', description: 'Percentual legado/padrão de médico em consulta' },
      { key: 'default_supplier_percentage', value: '70', description: 'Percentual legado/padrão de fornecedor' },
      { key: 'max_installments_custom', value: '4', description: 'Máximo configurado para cobranças avulsas legadas' },
      { key: 'max_installments_reusable', value: '5', description: 'Máximo configurado para cobranças reutilizáveis legadas' },
      { key: 'default_reusable_value', value: '99', description: 'Valor padrão legado para consulta médica reutilizável' },
      { key: 'international_shipping_default', value: '150.00', description: 'Frete internacional padrão em reais' },
      { key: 'charge_link_expiration_days', value: '7', description: 'Dias padrão de validade do link CanFy' },
      { key: 'checkout_base_url', value: 'https://pagar.canfy.com.br', description: 'Base do checkout público da CanFy' },
      { key: 'product_supplier_percentage', value: '70', description: 'Percentual inicial sugerido para fornecedor em nova cobrança; pode ser alterado por cobrança' },
      { key: 'product_doctor_percentage', value: '5', description: 'Percentual inicial sugerido para médico em venda de produto; pode ser alterado por cobrança' },
      { key: 'product_platform_percentage', value: '25', description: 'Referência histórica de margem; no fluxo novo a CanFy recebe o restante após os repasses da cobrança' },
      { key: 'consultation_doctor_percentage', value: '85', description: 'Percentual inicial sugerido para médico em consulta; pode ser alterado por cobrança' },
      { key: 'consultation_platform_percentage', value: '15', description: 'Referência histórica de margem; no fluxo novo a CanFy recebe o restante após o repasse da cobrança' },
    ];

    for (const setting of defaults) {
      await this.prisma.setting.upsert({
        where: { key: setting.key },
        // Mantém valores personalizados; atualiza apenas a documentação da chave.
        update: { description: setting.description },
        create: setting,
      });
    }

    this.logger.log('Configurações padrão criadas/verificadas');
    return { message: 'Configurações padrão aplicadas' };
  }
}
