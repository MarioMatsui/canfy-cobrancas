import { Injectable, NotFoundException } from '@nestjs/common';
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
  IntegrationDoctorDto,
  IntegrationDoctorListResponseDto,
  IntegrationListQueryDto,
  IntegrationPaginationDto,
  IntegrationProductDto,
  IntegrationProductListResponseDto,
  IntegrationSupplierDto,
  IntegrationSupplierListResponseDto,
} from './integration-api.dto';

const SUPPLIER_ELIGIBILITY: Prisma.SubaccountWhereInput = {
  type: SubaccountType.SUPPLIER,
  active: true,
  deletedAt: null,
  walletId: { not: null },
  fulfillmentType: { not: null },
};

const DOCTOR_ELIGIBILITY: Prisma.SubaccountWhereInput = {
  type: SubaccountType.DOCTOR,
  active: true,
  deletedAt: null,
  walletId: { not: null },
};

@Injectable()
export class IntegrationReadService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly exchangeRates: ExchangeRateService,
  ) {}

  async listProducts(query: IntegrationListQueryDto): Promise<IntegrationProductListResponseDto> {
    const { page, limit, skip } = this.page(query);
    const where = this.productWhere(query.search);

    const [rows, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          defaultPrice: true,
          priceCurrency: true,
          productType: true,
          active: true,
          supplier: {
            select: {
              id: true,
              name: true,
              fulfillmentType: true,
            },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    const quote = rows.some((row) => row.priceCurrency === ProductPriceCurrency.USD)
      ? await this.exchangeRates.getUsdBrlQuote()
      : null;

    return {
      data: rows.map((row) => this.product(row, quote)),
      pagination: this.pagination(page, limit, total),
    };
  }

  async getProduct(id: string): Promise<IntegrationProductDto> {
    const row = await this.prisma.product.findFirst({
      where: {
        id,
        ...this.productWhere(),
      },
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        defaultPrice: true,
        priceCurrency: true,
        productType: true,
        active: true,
        supplier: {
          select: {
            id: true,
            name: true,
            fulfillmentType: true,
          },
        },
      },
    });

    if (!row) throw new NotFoundException('Produto não encontrado');
    const quote =
      row.priceCurrency === ProductPriceCurrency.USD
        ? await this.exchangeRates.getUsdBrlQuote()
        : null;
    return this.product(row, quote);
  }

  async listSuppliers(query: IntegrationListQueryDto): Promise<IntegrationSupplierListResponseDto> {
    const { page, limit, skip } = this.page(query);
    const where: Prisma.SubaccountWhereInput = {
      ...SUPPLIER_ELIGIBILITY,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.subaccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          active: true,
          fulfillmentType: true,
        },
      }),
      this.prisma.subaccount.count({ where }),
    ]);

    return {
      data: rows.map((row) => ({
        id: row.id,
        name: row.name,
        active: row.active,
        fulfillmentType: row.fulfillmentType!,
      })),
      pagination: this.pagination(page, limit, total),
    };
  }

  async getSupplier(id: string): Promise<IntegrationSupplierDto> {
    const row = await this.prisma.subaccount.findFirst({
      where: { id, ...SUPPLIER_ELIGIBILITY },
      select: {
        id: true,
        name: true,
        active: true,
        fulfillmentType: true,
      },
    });

    if (!row) throw new NotFoundException('Fornecedor não encontrado');

    return {
      id: row.id,
      name: row.name,
      active: row.active,
      fulfillmentType: row.fulfillmentType!,
    };
  }

  async listDoctors(query: IntegrationListQueryDto): Promise<IntegrationDoctorListResponseDto> {
    const { page, limit, skip } = this.page(query);
    const where: Prisma.SubaccountWhereInput = {
      ...DOCTOR_ELIGIBILITY,
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.subaccount.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          active: true,
        },
      }),
      this.prisma.subaccount.count({ where }),
    ]);

    return {
      data: rows,
      pagination: this.pagination(page, limit, total),
    };
  }

  async getDoctor(id: string): Promise<IntegrationDoctorDto> {
    const row = await this.prisma.subaccount.findFirst({
      where: { id, ...DOCTOR_ELIGIBILITY },
      select: {
        id: true,
        name: true,
        active: true,
      },
    });

    if (!row) throw new NotFoundException('Médico não encontrado');
    return row;
  }

  private productWhere(search?: string): Prisma.ProductWhereInput {
    return {
      active: true,
      productType: { not: null },
      supplierSubaccountId: { not: null },
      AND: [
        {
          supplier: { is: SUPPLIER_ELIGIBILITY },
        },
        {
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
        },
        ...(search
          ? [
              {
                OR: [
                  { name: { contains: search, mode: 'insensitive' as const } },
                  { sku: { contains: search, mode: 'insensitive' as const } },
                ],
              } satisfies Prisma.ProductWhereInput,
            ]
          : []),
      ],
    };
  }

  private product(row: {
    id: string;
    name: string;
    sku: string | null;
    description: string | null;
    defaultPrice: Prisma.Decimal;
    priceCurrency: ProductPriceCurrency;
    productType: ProductType | null;
    active: boolean;
    supplier: {
      id: string;
      name: string;
      fulfillmentType: 'NATIONAL' | 'INTERNATIONAL' | null;
    } | null;
  }, quote: UsdBrlQuote | null): IntegrationProductDto {
    const priceBrl =
      row.priceCurrency === ProductPriceCurrency.BRL
        ? row.defaultPrice.toDecimalPlaces(2).toFixed(2)
        : row.defaultPrice.mul(quote!.rate).toDecimalPlaces(2).toFixed(2);

    return {
      id: row.id,
      name: row.name,
      sku: row.sku,
      description: row.description,
      defaultPrice: row.defaultPrice.toString(),
      priceCurrency: row.priceCurrency,
      priceBrl,
      exchangeRate:
        row.priceCurrency === ProductPriceCurrency.USD ? quote!.rate.toString() : null,
      exchangeRateQuotedAt:
        row.priceCurrency === ProductPriceCurrency.USD ? quote!.quotedAt : null,
      productType: row.productType as IntegrationProductDto['productType'],
      active: row.active,
      supplier: row.supplier?.fulfillmentType
        ? {
            id: row.supplier.id,
            name: row.supplier.name,
            fulfillmentType: row.supplier.fulfillmentType,
          }
        : null,
    };
  }

  private page(query: IntegrationListQueryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { page, limit, skip: (page - 1) * limit };
  }

  private pagination(page: number, limit: number, total: number): IntegrationPaginationDto {
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
    };
  }
}
