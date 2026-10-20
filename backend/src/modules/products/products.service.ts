import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FulfillmentType,
  Prisma,
  ProductPriceCurrency,
  ProductType,
  SubaccountType,
} from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ExchangeRateService,
  UsdBrlQuote,
} from '../../common/exchange-rate/exchange-rate.service';
import {
  CreateProductDto,
  ListProductsDto,
  PhytocannabinoidInputDto,
  ProductAdminStatusDto,
  UpdateProductDto,
} from './products.dto';

const MAX_PRODUCT_PHYTOCANNABINOIDS = 30;

const canonicalName = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
const normalizeName = (value: string) => canonicalName(value).toLowerCase();

const PHYTOCANNABINOID_INCLUDE = {
  include: { phytocannabinoid: { select: { id: true, name: true, fullName: true } } },
} as const;

const ELIGIBLE_SUPPLIER: Prisma.SubaccountWhereInput = {
  type: SubaccountType.SUPPLIER,
  active: true,
  deletedAt: null,
  walletId: { not: null },
  fulfillmentType: { not: null },
};

@Injectable()
export class ProductsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  private eligibleWhere(): Prisma.ProductWhereInput {
    return {
      productType: { not: null },
      supplierSubaccountId: { not: null },
      supplier: { is: ELIGIBLE_SUPPLIER },
      OR: [
        {
          priceCurrency: ProductPriceCurrency.BRL,
          supplier: { is: { fulfillmentType: FulfillmentType.NATIONAL } },
        },
        {
          priceCurrency: ProductPriceCurrency.USD,
          supplier: { is: { fulfillmentType: FulfillmentType.INTERNATIONAL } },
        },
      ],
    };
  }

  private currencyForFulfillment(fulfillmentType: FulfillmentType) {
    return fulfillmentType === FulfillmentType.INTERNATIONAL
      ? ProductPriceCurrency.USD
      : ProductPriceCurrency.BRL;
  }

  private listWhere(query: ListProductsDto): Prisma.ProductWhereInput {
    const filters: Prisma.ProductWhereInput[] = [];
    if (query.active !== undefined) filters.push({ active: query.active });
    if (query.phytocannabinoidIds?.length) {
      const ids = [...new Set(query.phytocannabinoidIds)];
      if (query.phytocannabinoidMode === 'all') {
        for (const id of ids) {
          filters.push({ phytocannabinoids: { some: { phytocannabinoidId: id } } });
        }
      } else {
        filters.push({ phytocannabinoids: { some: { phytocannabinoidId: { in: ids } } } });
      }
    }
    if (query.brand) filters.push({ brand: { equals: query.brand, mode: 'insensitive' } });
    if (query.hasImage !== undefined) filters.push({ imageUrl: query.hasImage ? { not: null } : null });
    if (query.hasCoa !== undefined) filters.push({ coaUrl: query.hasCoa ? { not: null } : null });
    if (query.productType) filters.push({ productType: query.productType as ProductType });
    if (query.supplierSubaccountId) {
      filters.push({ supplierSubaccountId: query.supplierSubaccountId });
    }
    if (query.fulfillmentType) {
      filters.push({
        supplier: {
          is: { fulfillmentType: query.fulfillmentType as FulfillmentType },
        },
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { brand: { contains: query.search, mode: 'insensitive' } },
          { description: { contains: query.search, mode: 'insensitive' } },
          { supplier: { is: { name: { contains: query.search, mode: 'insensitive' } } } },
        ],
      });
    }
    if (query.eligible === true) filters.push(this.eligibleWhere());

    if (query.status === ProductAdminStatusDto.ACTIVE) {
      filters.push({ active: true }, this.eligibleWhere());
    } else if (query.status === ProductAdminStatusDto.INACTIVE) {
      filters.push({ active: false });
    } else if (query.status === ProductAdminStatusDto.PENDING) {
      filters.push({
        active: true,
        NOT: this.eligibleWhere(),
      });
    }

    return filters.length ? { AND: filters } : {};
  }

  private supplierSelect() {
    return {
      id: true,
      name: true,
      type: true,
      active: true,
      deletedAt: true,
      walletId: true,
      fulfillmentType: true,
    } as const;
  }

  private eligibility(product: {
    productType: ProductType | null;
    priceCurrency: ProductPriceCurrency;
    supplierSubaccountId: string | null;
    supplier: {
      type: SubaccountType;
      active: boolean;
      deletedAt: Date | null;
      walletId: string | null;
      fulfillmentType: FulfillmentType | null;
    } | null;
  }) {
    const issues: string[] = [];
    if (!product.productType) issues.push('Tipo não configurado');
    if (!product.supplierSubaccountId || !product.supplier) {
      issues.push('Fornecedor não configurado');
    } else {
      if (product.supplier.type !== SubaccountType.SUPPLIER) issues.push('Subconta não é fornecedor');
      if (product.supplier.deletedAt) issues.push('Fornecedor excluído');
      if (!product.supplier.active) issues.push('Fornecedor inativo');
      if (!product.supplier.walletId) issues.push('Fornecedor sem walletId');
      if (!product.supplier.fulfillmentType) {
        issues.push('Fornecedor sem modalidade logística');
      } else {
        const expectedCurrency = this.currencyForFulfillment(product.supplier.fulfillmentType);
        if (product.priceCurrency !== expectedCurrency) {
          issues.push(
            expectedCurrency === ProductPriceCurrency.USD
              ? 'Preço do produto importado precisa ser informado em USD'
              : 'Preço do produto nacional precisa ser informado em BRL',
          );
        }
      }
    }
    return { eligible: issues.length === 0, eligibilityIssues: issues };
  }

  private decorate<T extends {
    defaultPrice: Prisma.Decimal;
    priceCurrency: ProductPriceCurrency;
    productType: ProductType | null;
    supplierSubaccountId: string | null;
    supplier: {
      type: SubaccountType;
      active: boolean;
      deletedAt: Date | null;
      walletId: string | null;
      fulfillmentType: FulfillmentType | null;
    } | null;
    phytocannabinoids?: Array<{ phytocannabinoid: { id: string; name: string; fullName: string | null } }>;
  }>(product: T, quote: UsdBrlQuote | null = null) {
    const { phytocannabinoids: links, ...attributes } = product;
    const priceBrl =
      product.priceCurrency === ProductPriceCurrency.BRL
        ? product.defaultPrice.toDecimalPlaces(2).toFixed(2)
        : quote
          ? product.defaultPrice.mul(quote.rate).toDecimalPlaces(2).toFixed(2)
          : null;

    return {
      ...attributes,
      phytocannabinoids: (links ?? []).map(link => link.phytocannabinoid)
        .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')),
      ...this.eligibility(product),
      marketRate: product.priceCurrency === ProductPriceCurrency.USD && quote ? (quote.marketRate ?? quote.rate).toString() : null,
      exchangeRateMarkup: product.priceCurrency === ProductPriceCurrency.USD && quote ? (quote.markup ?? new Prisma.Decimal('0.03')).toString() : null,
      appliedRate: product.priceCurrency === ProductPriceCurrency.USD && quote ? quote.rate.toString() : null,
      priceBrl,
      exchangeRate:
        product.priceCurrency === ProductPriceCurrency.USD && quote
          ? quote.rate.toString()
          : null,
      exchangeRateQuotedAt:
        product.priceCurrency === ProductPriceCurrency.USD && quote
          ? quote.quotedAt
          : null,
    };
  }

  private async quoteForProducts(
    products: Array<{ priceCurrency: ProductPriceCurrency }>,
  ): Promise<UsdBrlQuote | null> {
    return products.some((product) => product.priceCurrency === ProductPriceCurrency.USD)
      ? this.exchangeRates.tryGetUsdBrlQuote()
      : null;
  }

  async getUsdBrlQuote() {
    const quote = await this.exchangeRates.getUsdBrlQuote();
    return {
      pair: quote.pair,
      rate: quote.rate.toString(),
      marketRate: quote.marketRate.toString(),
      exchangeRateMarkup: quote.markup.toString(),
      appliedRate: quote.rate.toString(),
      quotedAt: quote.quotedAt,
      source: quote.source,
    };
  }

  async findAll(query: ListProductsDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where = this.listWhere(query);

    const direction = query.sortDirection === 'desc' ? 'desc' : 'asc';
    const priceSort = query.sortBy === 'price';
    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        ...(priceSort ? {} : { skip, take: limit }),
        orderBy: (priceSort ? { name: 'asc' } : { [query.sortBy || 'name']: direction }) as Prisma.ProductOrderByWithRelationInput,
        include: { supplier: { select: this.supplierSelect() }, phytocannabinoids: PHYTOCANNABINOID_INCLUDE },
      }),
      this.prisma.product.count({ where }),
    ]);
    const quote = await this.quoteForProducts(data);
    // Cross-currency price comparison is performed before pagination.
    const sorted = priceSort ? [...data].sort((a,b) => {
      const price = (p: typeof a): Prisma.Decimal | null => p.priceCurrency === ProductPriceCurrency.BRL
        ? p.defaultPrice : quote ? p.defaultPrice.mul(quote.rate) : null;
      const x = price(a), y = price(b);
      if (!x || !y) return !x && !y ? a.id.localeCompare(b.id) : x ? -1 : 1;
      const comparison = x.comparedTo(y);
      return comparison === 0 ? a.id.localeCompare(b.id) : direction === 'desc' ? -comparison : comparison;
    }) : data;
    const pageRows = priceSort ? sorted.slice(skip, skip+limit) : sorted;

    return {
      data: pageRows.map((product) => this.decorate(product, quote)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async catalogSummary(eligibleOnly = false) {
    const eligible = this.eligibleWhere();
    const visible: Prisma.ProductWhereInput = eligibleOnly ? {active:true, AND:[eligible]} : {};
    const [total, available, national, international, pending, inactive, withoutImage, withoutCoa, suppliers, recent] = await Promise.all([
      this.prisma.product.count({where:visible}),
      this.prisma.product.count({where:{AND:[visible,{active:true},eligible]}}),
      this.prisma.product.count({where:{AND:[visible,{supplier:{is:{fulfillmentType:FulfillmentType.NATIONAL}}}]}}),
      this.prisma.product.count({where:{AND:[visible,{supplier:{is:{fulfillmentType:FulfillmentType.INTERNATIONAL}}}]}}),
      eligibleOnly ? Promise.resolve(0) : this.prisma.product.count({where:{active:true,NOT:eligible}}),
      eligibleOnly ? Promise.resolve(0) : this.prisma.product.count({where:{active:false}}),
      this.prisma.product.count({where:{AND:[visible,{imageUrl:null}]}}),
      this.prisma.product.count({where:{AND:[visible,{coaUrl:null}]}}),
      this.prisma.product.groupBy({by:['supplierSubaccountId'],where:{AND:[visible,{supplierSubaccountId:{not:null}}]}}),
      this.prisma.product.count({where:{AND:[visible,{createdAt:{gte:new Date(Date.now()-30*86400000)}}]}}),
    ]);
    return {total,available,national,international,pending,inactive,withoutImage,withoutCoa,suppliers:suppliers.length,recent};
  }

  async catalogFacets(eligibleOnly = false) {
    const where: Prisma.ProductWhereInput = eligibleOnly ? {active:true,AND:[this.eligibleWhere()]} : {};
    const [brands, suppliers] = await Promise.all([
      this.prisma.product.findMany({
        where:{AND:[where,{brand:{not:null}}]},distinct:['brand'],select:{brand:true},
      }),
      this.prisma.product.findMany({
        where:{AND:[where,{supplierSubaccountId:{not:null}}]},
        distinct:['supplierSubaccountId'],
        select:{supplier:{select:{id:true,name:true}}},
      }),
    ]);
    return {
      brands:brands.map(p=>p.brand).filter((v):v is string=>Boolean(v)).sort((a,b)=>a.localeCompare(b,'pt-BR')),
      suppliers:suppliers.flatMap(p=>p.supplier ? [{id:p.supplier.id,name:p.supplier.name}] : [])
        .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR')),
    };
  }

  async listPhytocannabinoids(search?: string) {
    const query = typeof search === 'string' ? canonicalName(search) : '';
    if (query.length > 100) throw new BadRequestException('Busca longa demais.');
    return this.prisma.phytocannabinoid.findMany({
      where: query ? {
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
        ],
      } : undefined,
      select: { id: true, name: true, fullName: true, isDefault: true },
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Resolve todas as tags no MESMO transaction client do salvamento.
   * createMany(skipDuplicates) gera ON CONFLICT DO NOTHING no PostgreSQL,
   * inclusive para cadastros concorrentes da mesma forma normalizada.
   */
  private async resolvePhytocannabinoids(
    tx: Prisma.TransactionClient,
    selections: PhytocannabinoidInputDto[],
  ): Promise<string[]> {
    if (!Array.isArray(selections) || selections.length > MAX_PRODUCT_PHYTOCANNABINOIDS) {
      throw new BadRequestException('Informe até 30 fitocanabinoides.');
    }
    const names: Array<{ name: string; normalized: string }> = [];
    const existingIds: string[] = [];
    for (const entry of selections) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new BadRequestException('Fitocanabinoide inválido.');
      }
      const hasId = typeof entry.id === 'string' && entry.id.length > 0;
      const hasName = typeof entry.name === 'string';
      if (hasId === hasName) {
        throw new BadRequestException('Informe somente id ou name em cada fitocanabinoide.');
      }
      if (hasId) {
        existingIds.push(entry.id!);
      } else {
        const name = canonicalName(entry.name!);
        if (!name || name.length > 80 || /[\u0000-\u001F\u007F]/u.test(name)) {
          throw new BadRequestException('O nome do fitocanabinoide deve conter de 1 a 80 caracteres válidos.');
        }
        names.push({ name, normalized: normalizeName(name) });
      }
    }

    const savedById = existingIds.length ? await tx.phytocannabinoid.findMany({
      where: { id: { in: existingIds } },
      select: { id: true },
    }) : [];
    if (savedById.length !== new Set(existingIds).size) {
      throw new BadRequestException('Um ou mais fitocanabinoides selecionados não existem.');
    }

    const globalMatches = names.length ? await tx.phytocannabinoid.findMany({
      where: { OR: [
        { normalizedName: { in: names.map(item => item.normalized) } },
        { fullName: { in: names.map(item => item.name), mode: 'insensitive' } },
      ] },
      select: { id: true, normalizedName: true, fullName: true },
    }) : [];
    const matchName = (normalized: string) => globalMatches.find(item =>
      item.normalizedName === normalized ||
      (item.fullName && normalizeName(item.fullName) === normalized));

    const toInsert = new Map<string, string>();
    for (const item of names) {
      if (!matchName(item.normalized)) toInsert.set(item.normalized, item.name);
    }
    if (toInsert.size) {
      await tx.phytocannabinoid.createMany({
        data: [...toInsert].map(([normalizedName, name]) => ({
          normalizedName, name, isDefault: false,
        })),
        skipDuplicates: true,
      });
    }
    const inserted = toInsert.size ? await tx.phytocannabinoid.findMany({
      where: { normalizedName: { in: [...toInsert.keys()] } },
      select: { id: true, normalizedName: true },
    }) : [];
    const insertedByName = new Map(inserted.map(item => [item.normalizedName, item.id]));

    const ids = [
      ...existingIds,
      ...names.map(item => matchName(item.normalized)?.id ?? insertedByName.get(item.normalized)),
    ];
    if (ids.some(id => !id) || new Set(ids).size !== ids.length) {
      throw new BadRequestException('A seleção contém fitocanabinoides duplicados ou inválidos.');
    }
    return ids as string[];
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { supplier: { select: this.supplierSelect() }, phytocannabinoids: PHYTOCANNABINOID_INCLUDE },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    const quote = await this.quoteForProducts([product]);
    return this.decorate(product, quote);
  }

  private async requireEligibleSupplier(id: string) {
    const supplier = await this.prisma.subaccount.findFirst({
      where: { id },
      select: this.supplierSelect(),
    });

    if (!supplier) throw new BadRequestException('Fornecedor não encontrado');
    if (supplier.deletedAt) throw new BadRequestException('O fornecedor selecionado foi excluído');
    if (supplier.type !== SubaccountType.SUPPLIER) {
      throw new BadRequestException('A subconta selecionada não está classificada como Fornecedor');
    }
    if (!supplier.active) throw new BadRequestException('O fornecedor selecionado está inativo');
    if (!supplier.walletId) {
      throw new BadRequestException('O fornecedor selecionado não possui walletId do Asaas');
    }
    if (!supplier.fulfillmentType) {
      throw new BadRequestException(
        'O fornecedor selecionado não possui modalidade logística configurada',
      );
    }
    return supplier;
  }

  private async assertSkuAvailable(sku: string | null | undefined, exceptId?: string) {
    if (!sku) return;
    const existing = await this.prisma.product.findFirst({
      where: {
        sku,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Já existe um produto utilizando este SKU.');
  }

  async create(dto: CreateProductDto) {
    const sku = dto.sku?.trim() || null;
    const description = dto.description?.trim() || null;
    const [supplier] = await Promise.all([
      this.requireEligibleSupplier(dto.supplierSubaccountId),
      this.assertSkuAvailable(sku),
    ]);
    const priceCurrency = this.currencyForFulfillment(supplier.fulfillmentType!);

    try {
      const created = await this.prisma.product.create({
        data: {
          name: dto.name.trim(),
          sku,
          description,
          brand: dto.brand?.trim() || null,
          imageUrl: dto.imageUrl || null,
          coaUrl: dto.coaUrl || null,
          coaBatch: dto.coaBatch?.trim() || null,
          coaAnalyzedAt: dto.coaAnalyzedAt ? new Date(dto.coaAnalyzedAt) : null,
          coaValidUntil: dto.coaValidUntil ? new Date(dto.coaValidUntil) : null,
          productType: dto.productType as ProductType,
          supplierSubaccountId: dto.supplierSubaccountId,
          defaultPrice: new Prisma.Decimal(dto.defaultPrice),
          priceCurrency,
          weightKg: dto.weightKg == null ? null : new Prisma.Decimal(dto.weightKg),
          heightCm: dto.heightCm == null ? null : new Prisma.Decimal(dto.heightCm),
          widthCm: dto.widthCm == null ? null : new Prisma.Decimal(dto.widthCm),
          lengthCm: dto.lengthCm == null ? null : new Prisma.Decimal(dto.lengthCm),
          active: dto.active ?? true,
        },
      });
      return this.findOne(created.id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Já existe um produto utilizando este SKU.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Produto não encontrado');

    const supplierSubaccountId = dto.supplierSubaccountId ?? current.supplierSubaccountId;
    if (!supplierSubaccountId) {
      throw new BadRequestException('Selecione um fornecedor.');
    }
    const productType = (dto.productType ?? current.productType) as ProductType | null;
    if (!productType) {
      throw new BadRequestException('Selecione o tipo do produto.');
    }

    const sku = dto.sku === undefined ? current.sku : dto.sku?.trim() || null;
    const [supplier] = await Promise.all([
      this.requireEligibleSupplier(supplierSubaccountId),
      this.assertSkuAvailable(sku, id),
    ]);
    const priceCurrency = this.currencyForFulfillment(supplier.fulfillmentType!);
    if (current.priceCurrency !== priceCurrency && dto.defaultPrice === undefined) {
      throw new BadRequestException(
        priceCurrency === ProductPriceCurrency.USD
          ? 'Informe o preço em USD ao vincular o produto a um fornecedor importado.'
          : 'Informe o preço em BRL ao vincular o produto a um fornecedor nacional.',
      );
    }

    try {
      await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sku !== undefined ? { sku } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          productType,
          supplierSubaccountId,
          ...(dto.brand !== undefined ? { brand: dto.brand?.trim() || null } : {}),
          ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl || null } : {}),
          ...(dto.coaUrl !== undefined ? { coaUrl: dto.coaUrl || null } : {}),
          ...(dto.coaBatch !== undefined ? { coaBatch: dto.coaBatch?.trim() || null } : {}),
          ...(dto.coaAnalyzedAt !== undefined ? { coaAnalyzedAt: dto.coaAnalyzedAt ? new Date(dto.coaAnalyzedAt) : null } : {}),
          ...(dto.coaValidUntil !== undefined ? { coaValidUntil: dto.coaValidUntil ? new Date(dto.coaValidUntil) : null } : {}),
          priceCurrency,
          ...(dto.defaultPrice !== undefined
            ? { defaultPrice: new Prisma.Decimal(dto.defaultPrice) }
            : {}),
          ...(dto.weightKg !== undefined
            ? { weightKg: dto.weightKg == null ? null : new Prisma.Decimal(dto.weightKg) }
            : {}),
          ...(dto.heightCm !== undefined
            ? { heightCm: dto.heightCm == null ? null : new Prisma.Decimal(dto.heightCm) }
            : {}),
          ...(dto.widthCm !== undefined
            ? { widthCm: dto.widthCm == null ? null : new Prisma.Decimal(dto.widthCm) }
            : {}),
          ...(dto.lengthCm !== undefined
            ? { lengthCm: dto.lengthCm == null ? null : new Prisma.Decimal(dto.lengthCm) }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      return this.findOne(id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Já existe um produto utilizando este SKU.');
      }
      throw error;
    }
  }

  async toggleActive(id: string) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Produto não encontrado');
    await this.prisma.product.update({
      where: { id },
      data: { active: !current.active },
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { chargeItems: true } },
      },
    });
    if (!current) throw new NotFoundException('Produto não encontrado');

    if (current._count.chargeItems > 0) {
      throw new BadRequestException(
        'Este produto possui histórico de cobranças e não pode ser excluído. Desative-o.',
      );
    }

    await this.prisma.product.delete({ where: { id } });
    return { success: true, message: 'Produto excluído com sucesso.' };
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }
}
