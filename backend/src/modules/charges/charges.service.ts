import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DiscountType,
  FulfillmentType,
  OrderKind,
  OrderStatus,
  Prisma,
  QuoteSource,
  ShipmentType,
  SplitCalculationType,
  SplitRecipientType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AsaasService } from '../../asaas/asaas.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateChargeDto,
  CreateChargeItemDto,
  DiscountTypeDto,
  ListChargesDto,
} from './charges.dto';

type Rules = {
  productSupplier: Prisma.Decimal;
  productDoctor: Prisma.Decimal;
  productPlatform: Prisma.Decimal;
  consultationDoctor: Prisma.Decimal;
  consultationPlatform: Prisma.Decimal;
  internationalShipping: Prisma.Decimal;
  expirationDays: number;
  checkoutBaseUrl: string;
};

type Item = {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  supplierSubaccountId: string | null;
  fulfillmentType: FulfillmentType;
};

@Injectable()
export class ChargesService {
  private readonly logger = new Logger(ChargesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  async create(dto: CreateChargeDto, createdByUserId: string) {
    const rules = await this.loadRules();
    const orderKind = dto.orderKind as OrderKind;
    const cpfCnpj = this.normalizeCpfCnpj(dto.customerCpfCnpj);
    const items = await this.resolveItems(dto.items, orderKind);
    const subtotal = this.sum(items.map((item) => item.lineTotal));

    const doctor = await this.prisma.subaccount.findFirst({
      where: { id: dto.doctorSubaccountId, type: 'DOCTOR', active: true, deletedAt: null },
      select: { id: true, name: true, walletId: true },
    });
    if (!doctor) throw new BadRequestException('Médico não encontrado, inativo ou com tipo inválido');
    if (!doctor.walletId) throw new BadRequestException('Médico "' + doctor.name + '" não possui walletId do Asaas');

    if (orderKind === OrderKind.PRODUCT) await this.validateSuppliers(items);

    const discount = this.calculateDiscount(dto, subtotal);
    const platformPercentage =
      orderKind === OrderKind.PRODUCT ? rules.productPlatform : rules.consultationPlatform;
    const platformMargin = this.percent(subtotal, platformPercentage);
    if (discount.amount.gt(platformMargin)) {
      throw new BadRequestException(
        'O desconto de R$ ' + discount.amount.toFixed(2) +
        ' excede a margem da CanFy de R$ ' + platformMargin.toFixed(2) +
        '. Fornecedor e médico não podem ter seus repasses reduzidos pelo desconto.',
      );
    }

    const shipping = this.calculateShipping(dto, orderKind, items, rules);
    const totalAmount = this.money(subtotal.minus(discount.amount).plus(shipping.total));
    if (totalAmount.lte(0)) throw new BadRequestException('O total da cobrança deve ser maior que zero');

    const chargeId = randomUUID();
    const publicToken = randomUUID();
    const expiresAt = this.resolveExpiration(dto.expiresAt, rules.expirationDays);
    const description =
      dto.description?.trim() || items.map((item) => item.productName).slice(0, 3).join(', ');

    const splits = this.buildSplits(orderKind, items, doctor.id, subtotal, rules);
    const distributed = this.sum(splits.map((split) => split.calculatedValue));
    const mainAccountValue = this.money(totalAmount.minus(distributed));
    if (mainAccountValue.lt(0)) {
      throw new BadRequestException('As regras de split resultaram em valor negativo para a conta principal');
    }

    const created = await this.prisma.$transaction(async (tx) => {
      const customer = await this.upsertCustomer(tx, {
        name: dto.customerName.trim(),
        email: dto.customerEmail?.trim() || null,
        cpfCnpj,
        phone: dto.customerPhone?.trim() || null,
      });

      await tx.charge.create({
        data: {
          id: chargeId,
          customerId: customer.id,
          customerName: dto.customerName.trim(),
          customerEmail: dto.customerEmail?.trim() || null,
          customerCpfCnpj: cpfCnpj,
          createdByUserId,
          orderKind,
          subtotal,
          discountType: discount.type,
          discountValue: discount.value,
          discountAmount: discount.amount,
          shippingAmount: shipping.total,
          totalAmount,
          orderStatus: 'READY',
          maxInstallments: dto.maxInstallments ?? 1,
          publicToken,
          expiresAt,
          doctorSubaccountId: doctor.id,
          description,
          notes: dto.notes?.trim() || null,

          // Compatibilidade temporária com telas/rotinas históricas.
          chargeType: 'CUSTOM',
          customerAsaasId: customer.asaasCustomerId,
          billingType: 'UNDEFINED',
          value: totalAmount,
          status: 'PENDING',
          dueDate: null,
          asaasId: null,
          invoiceUrl: null,
          bankSlipUrl: null,
          pixQrCode: null,
          pixCopiaECola: null,
          netValue: null,
          isActive: true,
        },
      });

      await tx.chargeItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          chargeId,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          supplierSubaccountId: item.supplierSubaccountId,
          fulfillmentType: item.fulfillmentType,
        })),
      });

      if (shipping.rows.length) {
        await tx.shipment.createMany({
          data: shipping.rows.map((row) => ({
            id: randomUUID(),
            chargeId,
            type: row.type,
            shippingAmount: row.amount,
            quoteSource: row.source,
            status: 'PENDING',
          })),
        });
      }

      if (splits.length) {
        await tx.chargeSplit.createMany({
          data: splits.map((split) => ({
            id: randomUUID(),
            chargeId,
            subaccountId: split.subaccountId,
            recipientType: split.recipientType,
            calculationType: SplitCalculationType.PERCENTAGE,
            chargeItemId: split.chargeItemId,
            percentage: split.percentage,
            fixedValue: null,
            basisAmount: split.basisAmount,
            calculatedValue: split.calculatedValue,
          })),
        });
      }

      return tx.charge.findUnique({
        where: { id: chargeId },
        include: this.include(),
      });
    });

    if (!created) throw new NotFoundException('Cobrança criada, mas não foi possível recarregá-la');

    const checkoutUrl = this.checkoutUrl(rules.checkoutBaseUrl, publicToken);
    const mainAccountPercentage = totalAmount.gt(0)
      ? Number(mainAccountValue.div(totalAmount).mul(100).toDecimalPlaces(2).toString())
      : 0;

    this.logger.log(
      'Pedido criado: ' + chargeId +
      ' | ' + orderKind +
      ' | total R$ ' + totalAmount.toFixed(2) +
      ' | splits R$ ' + distributed.toFixed(2) +
      ' | principal R$ ' + mainAccountValue.toFixed(2) +
      ' | sem pagamento Asaas',
    );

    return { ...created, checkoutUrl, mainAccountValue, mainAccountPercentage };
  }

  async findAll(query: ListChargesDto) {
    const { page = 1, limit = 20, status, orderStatus, orderKind, dateFrom, dateTo, search } = query;
    const where: Prisma.ChargeWhereInput = {};

    if (status) where.status = status;
    if (orderStatus) where.orderStatus = orderStatus as OrderStatus;
    if (orderKind) where.orderKind = orderKind as OrderKind;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerCpfCnpj: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [data, total, baseUrl] = await Promise.all([
      this.prisma.charge.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.include(),
      }),
      this.prisma.charge.count({ where }),
      this.getCheckoutBaseUrl(),
    ]);

    return {
      data: data.map((charge) => this.decorate(charge, baseUrl)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const [charge, baseUrl] = await Promise.all([
      this.prisma.charge.findUnique({
        where: { id },
        include: {
          ...this.include(),
          splitResults: {
            include: { receiver: { select: { name: true, type: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.getCheckoutBaseUrl(),
    ]);
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    return this.decorate(charge, baseUrl);
  }

  async cancel(id: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');

    // Somente o fluxo legado possui asaasId neste ponto.
    if (charge.asaasId) await this.asaas.delete('/payments/' + charge.asaasId);

    return this.prisma.charge.update({
      where: { id },
      data: { orderStatus: 'CANCELLED', status: 'CANCELLED', isActive: false },
    });
  }

  async toggleActive(id: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    if (charge.chargeType !== 'REUSABLE') {
      throw new BadRequestException('Apenas cobranças reutilizáveis legadas podem ser ativadas/desativadas');
    }
    return this.prisma.charge.update({
      where: { id },
      data: { isActive: !charge.isActive },
    });
  }

  async getReusableCharges() {
    const [charges, baseUrl] = await Promise.all([
      this.prisma.charge.findMany({
        where: { chargeType: 'REUSABLE' },
        include: this.include(),
        orderBy: { createdAt: 'desc' },
      }),
      this.getCheckoutBaseUrl(),
    ]);
    return charges.map((charge) => this.decorate(charge, baseUrl));
  }

  private async resolveItems(input: CreateChargeItemDto[], orderKind: OrderKind): Promise<Item[]> {
    const ids = [...new Set(input.map((item) => item.productId).filter((id): id is string => Boolean(id)))];
    const products = ids.length
      ? await this.prisma.product.findMany({ where: { id: { in: ids }, active: true } })
      : [];
    if (products.length !== ids.length) {
      throw new BadRequestException('Um ou mais produtos do catálogo não existem ou estão inativos');
    }
    const byId = new Map(products.map((product) => [product.id, product]));

    return input.map((entry, index) => {
      const product = entry.productId ? byId.get(entry.productId) : undefined;
      const name = product?.name ?? entry.productName?.trim();
      if (!name) {
        throw new BadRequestException('Item ' + (index + 1) + ': informe um produto do catálogo ou o nome do item');
      }

      const unitPrice = this.money(entry.unitPrice ?? product?.defaultPrice ?? 0);
      if (unitPrice.lte(0)) {
        throw new BadRequestException('Item ' + (index + 1) + ': o valor unitário deve ser maior que zero');
      }

      let supplierSubaccountId: string | null = null;
      let fulfillmentType: FulfillmentType = FulfillmentType.NATIONAL;
      if (orderKind === OrderKind.PRODUCT) {
        supplierSubaccountId = product?.supplierSubaccountId ?? entry.supplierSubaccountId ?? null;
        if (!supplierSubaccountId) {
          throw new BadRequestException('Item ' + (index + 1) + ' (' + name + '): informe o fornecedor');
        }
        const fulfillment = product?.fulfillmentType ?? entry.fulfillmentType;
        if (!fulfillment) {
          throw new BadRequestException('Item ' + (index + 1) + ' (' + name + '): informe se é nacional ou internacional');
        }
        fulfillmentType = fulfillment as FulfillmentType;
      }

      return {
        id: randomUUID(),
        productId: product?.id ?? null,
        productName: name,
        productSku: product?.sku ?? null,
        quantity: entry.quantity,
        unitPrice,
        lineTotal: this.money(unitPrice.mul(entry.quantity)),
        supplierSubaccountId,
        fulfillmentType,
      };
    });
  }

  private async validateSuppliers(items: Item[]) {
    const ids = [...new Set(items.map((item) => item.supplierSubaccountId).filter((id): id is string => Boolean(id)))];
    const suppliers = await this.prisma.subaccount.findMany({
      where: { id: { in: ids }, type: 'SUPPLIER', active: true, deletedAt: null },
      select: { id: true, name: true, walletId: true },
    });
    if (suppliers.length !== ids.length) {
      throw new BadRequestException('Um ou mais fornecedores não existem, estão inativos ou têm tipo inválido');
    }
    const withoutWallet = suppliers.find((supplier) => !supplier.walletId);
    if (withoutWallet) {
      throw new BadRequestException('Fornecedor "' + withoutWallet.name + '" não possui walletId do Asaas');
    }
  }

  private calculateDiscount(dto: CreateChargeDto, subtotal: Prisma.Decimal) {
    const type = (dto.discountType ?? DiscountTypeDto.NONE) as DiscountType;
    const value = this.money(dto.discountValue ?? 0);

    if (type === DiscountType.NONE) {
      return { type, value: this.money(0), amount: this.money(0) };
    }
    if (value.lte(0)) throw new BadRequestException('Informe um valor de desconto maior que zero');

    let amount: Prisma.Decimal;
    if (type === DiscountType.PERCENTAGE) {
      if (value.gt(100)) throw new BadRequestException('O desconto percentual não pode ser maior que 100%');
      amount = this.percent(subtotal, value);
    } else {
      amount = value;
    }
    if (amount.gt(subtotal)) throw new BadRequestException('O desconto não pode ser maior que o subtotal');
    return { type, value, amount };
  }

  private calculateShipping(dto: CreateChargeDto, orderKind: OrderKind, items: Item[], rules: Rules) {
    const rows: Array<{ type: ShipmentType; amount: Prisma.Decimal; source: QuoteSource }> = [];

    if (orderKind === OrderKind.CONSULTATION) {
      if ((dto.nationalShippingAmount ?? 0) > 0 || (dto.internationalShippingAmount ?? 0) > 0) {
        throw new BadRequestException('Consulta médica não deve possuir frete');
      }
      return { rows, total: this.money(0) };
    }

    const national = items.some((item) => item.fulfillmentType === FulfillmentType.NATIONAL);
    const international = items.some((item) => item.fulfillmentType === FulfillmentType.INTERNATIONAL);

    if (!national && (dto.nationalShippingAmount ?? 0) > 0) {
      throw new BadRequestException('Frete nacional informado, mas o pedido não possui item nacional');
    }
    if (!international && (dto.internationalShippingAmount ?? 0) > 0) {
      throw new BadRequestException('Frete internacional informado, mas o pedido não possui item internacional');
    }

    if (national) {
      rows.push({
        type: ShipmentType.NATIONAL,
        amount: this.money(dto.nationalShippingAmount ?? 0),
        source: QuoteSource.MANUAL,
      });
    }
    if (international) {
      rows.push({
        type: ShipmentType.INTERNATIONAL,
        amount: this.money(dto.internationalShippingAmount ?? rules.internationalShipping),
        source: QuoteSource.FIXED,
      });
    }

    return { rows, total: this.sum(rows.map((row) => row.amount)) };
  }

  private buildSplits(
    orderKind: OrderKind,
    items: Item[],
    doctorId: string,
    subtotal: Prisma.Decimal,
    rules: Rules,
  ) {
    const rows: Array<{
      subaccountId: string;
      recipientType: SplitRecipientType;
      chargeItemId: string | null;
      percentage: Prisma.Decimal;
      basisAmount: Prisma.Decimal;
      calculatedValue: Prisma.Decimal;
    }> = [];

    if (orderKind === OrderKind.PRODUCT) {
      for (const item of items) {
        if (!item.supplierSubaccountId) continue;
        rows.push({
          subaccountId: item.supplierSubaccountId,
          recipientType: SplitRecipientType.SUPPLIER,
          chargeItemId: item.id,
          percentage: rules.productSupplier,
          basisAmount: item.lineTotal,
          calculatedValue: this.percent(item.lineTotal, rules.productSupplier),
        });
      }
      rows.push({
        subaccountId: doctorId,
        recipientType: SplitRecipientType.DOCTOR,
        chargeItemId: null,
        percentage: rules.productDoctor,
        basisAmount: subtotal,
        calculatedValue: this.percent(subtotal, rules.productDoctor),
      });
    } else {
      rows.push({
        subaccountId: doctorId,
        recipientType: SplitRecipientType.DOCTOR,
        chargeItemId: null,
        percentage: rules.consultationDoctor,
        basisAmount: subtotal,
        calculatedValue: this.percent(subtotal, rules.consultationDoctor),
      });
    }
    return rows;
  }

  private async upsertCustomer(
    tx: Prisma.TransactionClient,
    data: { name: string; email: string | null; cpfCnpj: string; phone: string | null },
  ) {
    const formatted = this.formatCpfCnpj(data.cpfCnpj);
    const existing = await tx.customer.findFirst({
      where: { cpfCnpj: { in: [data.cpfCnpj, formatted] } },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          email: data.email ?? undefined,
          phone: data.phone ?? undefined,
        },
      });
    }
    return tx.customer.create({ data });
  }

  private async loadRules(): Promise<Rules> {
    const keys = [
      'product_supplier_percentage',
      'product_doctor_percentage',
      'product_platform_percentage',
      'consultation_doctor_percentage',
      'consultation_platform_percentage',
      'international_shipping_default',
      'charge_link_expiration_days',
      'checkout_base_url',
    ];
    const settings = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = new Map(settings.map((setting) => [setting.key, setting.value]));

    const rules: Rules = {
      productSupplier: this.settingPercent(map, 'product_supplier_percentage', 70),
      productDoctor: this.settingPercent(map, 'product_doctor_percentage', 5),
      productPlatform: this.settingPercent(map, 'product_platform_percentage', 25),
      consultationDoctor: this.settingPercent(map, 'consultation_doctor_percentage', 85),
      consultationPlatform: this.settingPercent(map, 'consultation_platform_percentage', 15),
      internationalShipping: this.money(map.get('international_shipping_default') ?? '150'),
      expirationDays: Number(map.get('charge_link_expiration_days') ?? 7),
      checkoutBaseUrl: map.get('checkout_base_url') ?? 'https://pagar.canfy.com.br',
    };

    if (!rules.productSupplier.plus(rules.productDoctor).plus(rules.productPlatform).equals(100)) {
      throw new BadRequestException('Configuração de split de produto deve somar 100%');
    }
    if (!rules.consultationDoctor.plus(rules.consultationPlatform).equals(100)) {
      throw new BadRequestException('Configuração de split de consulta deve somar 100%');
    }
    if (!Number.isFinite(rules.expirationDays) || rules.expirationDays < 1) {
      throw new BadRequestException('charge_link_expiration_days deve ser maior ou igual a 1');
    }
    return rules;
  }

  private include(): Prisma.ChargeInclude {
    return {
      items: {
        include: {
          supplier: { select: { id: true, name: true, type: true } },
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      shipments: { orderBy: { createdAt: 'asc' } },
      splits: {
        include: { subaccount: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: 'asc' },
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      doctor: { select: { id: true, name: true, type: true } },
    };
  }

  private decorate(charge: any, baseUrl: string) {
    let mainAccountValue: Prisma.Decimal;
    const audited = charge.splits.some(
      (split: any) => split.calculatedValue !== null && split.calculatedValue !== undefined,
    );

    if (audited || charge.orderKind) {
      const distributed = this.sum(
        charge.splits.map((split: any) => this.money(split.calculatedValue ?? 0)),
      );
      mainAccountValue = this.money(this.money(charge.totalAmount).minus(distributed));
    } else {
      const value = this.money(charge.value);
      const fixed = this.sum(charge.splits.map((split: any) => this.money(split.fixedValue ?? 0)));
      const percentage = charge.splits.reduce(
        (sum: Prisma.Decimal, split: any) => sum.plus(this.money(split.percentage ?? 0)),
        new Prisma.Decimal(0),
      );
      const percentValue = this.percent(value.minus(fixed), percentage);
      mainAccountValue = this.money(value.minus(fixed).minus(percentValue));
    }

    const total = this.money(charge.totalAmount ?? charge.value);
    return {
      ...charge,
      latestPayment: charge.payments?.[0] ?? null,
      checkoutUrl: charge.orderKind ? this.checkoutUrl(baseUrl, charge.publicToken) : null,
      mainAccountValue,
      mainAccountPercentage: total.gt(0)
        ? Number(mainAccountValue.div(total).mul(100).toDecimalPlaces(2).toString())
        : 0,
    };
  }

  private resolveExpiration(value: string | undefined, days: number) {
    const date = value
      ? /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value + 'T23:59:59.999Z')
        : new Date(value)
      : new Date(Date.now() + days * 86400000);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException('A validade do link deve ser uma data futura');
    }
    return date;
  }

  private normalizeCpfCnpj(value: string) {
    const normalized = value.replace(/\D/g, '');
    if (normalized.length !== 11 && normalized.length !== 14) {
      throw new BadRequestException('CPF/CNPJ deve conter 11 ou 14 dígitos');
    }
    return normalized;
  }

  private formatCpfCnpj(value: string) {
    if (value.length === 11) {
      return value.slice(0, 3) + '.' + value.slice(3, 6) + '.' + value.slice(6, 9) + '-' + value.slice(9);
    }
    return value.slice(0, 2) + '.' + value.slice(2, 5) + '.' + value.slice(5, 8) + '/' + value.slice(8, 12) + '-' + value.slice(12);
  }

  private settingPercent(map: Map<string, string>, key: string, fallback: number) {
    const value = new Prisma.Decimal(map.get(key) ?? fallback);
    if (value.lt(0) || value.gt(100)) throw new BadRequestException(key + ' deve estar entre 0 e 100');
    return value;
  }

  private async getCheckoutBaseUrl() {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'checkout_base_url' } });
    return setting?.value ?? 'https://pagar.canfy.com.br';
  }

  private checkoutUrl(base: string, token: string) {
    return base.replace(/\/+$/, '') + '/' + token;
  }

  private percent(base: Prisma.Decimal, percentage: Prisma.Decimal) {
    return this.money(base.mul(percentage).div(100));
  }

  private money(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private sum(values: Prisma.Decimal[]) {
    return this.money(values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)));
  }
}
