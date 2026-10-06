import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FulfillmentType,
  OrderStatus,
  PaymentStatus,
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
  IntegrationChargeDetailDto,
  IntegrationChargeListItemDto,
  IntegrationChargeListResponseDto,
  IntegrationDoctorDto,
  IntegrationDoctorListResponseDto,
  IntegrationListQueryDto,
  IntegrationPaginationDto,
  IntegrationProductDto,
  IntegrationProductListResponseDto,
  IntegrationSupplierDto,
  IntegrationSupplierListResponseDto,
  IntegrationSalesQueryDto,
  IntegrationSaleSummaryDto,
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

const COMPLETED_PAYMENT_STATUSES = [
  PaymentStatus.CONFIRMED,
  PaymentStatus.RECEIVED,
] as const;

const CHARGE_LIST_SELECT = Prisma.validator<Prisma.ChargeSelect>()({
  id: true,
  customerId: true,
  customerName: true,
  customerEmail: true,
  customerCpfCnpj: true,
  orderKind: true,
  orderStatus: true,
  subtotal: true,
  discountAmount: true,
  shippingAmount: true,
  totalAmount: true,
  createdAt: true,
  customer: {
    select: {
      id: true,
      phone: true,
    },
  },
  items: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      productName: true,
      productSku: true,
      productType: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      fulfillmentType: true,
      supplier: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
  payments: {
    where: {
      status: { in: [...COMPLETED_PAYMENT_STATUSES] },
    },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      provider: true,
      billingType: true,
      status: true,
      amount: true,
      installments: true,
      paidAt: true,
      netValue: true,
      createdAt: true,
    },
  },
  createdByIntegration: {
    select: {
      id: true,
      name: true,
    },
  },
  createdBy: {
    select: {
      id: true,
      name: true,
    },
  },
});

const CHARGE_DETAIL_SELECT = Prisma.validator<Prisma.ChargeSelect>()({
  ...CHARGE_LIST_SELECT,
  description: true,
  notes: true,
  doctor: {
    select: {
      id: true,
      name: true,
    },
  },
  payments: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      provider: true,
      billingType: true,
      status: true,
      amount: true,
      installments: true,
      paidAt: true,
      netValue: true,
      createdAt: true,
    },
  },
  splits: {
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: {
      id: true,
      recipientType: true,
      calculationType: true,
      chargeItemId: true,
      percentage: true,
      fixedValue: true,
      basisAmount: true,
      calculatedValue: true,
      subaccount: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  },
});

type ChargeListRow = Prisma.ChargeGetPayload<{ select: typeof CHARGE_LIST_SELECT }>;
type ChargeDetailRow = Prisma.ChargeGetPayload<{ select: typeof CHARGE_DETAIL_SELECT }>;

interface ChargeIndexRow {
  id: string;
  paidAt: Date | null;
  paidPaymentsCount: number;
}

interface ChargeSummaryRow {
  salesCount: number;
  grossRevenue: string;
  averageTicket: string;
  itemsSold: number;
}


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


  async listCharges(query: IntegrationSalesQueryDto): Promise<IntegrationChargeListResponseDto> {
    const { page, limit, skip } = this.page(query);
    const where = this.salesWhere(query);
    const direction = query.sortDirection === 'asc' ? Prisma.sql`ASC` : Prisma.sql`DESC`;

    const [indexRows, summaryRows] = await Promise.all([
      this.prisma.$queryRaw<ChargeIndexRow[]>(Prisma.sql`
        WITH paid_payment AS (
          SELECT
            p.charge_id,
            MIN(p.paid_at) FILTER (
              WHERE p.status IN ('CONFIRMED', 'RECEIVED')
            ) AS paid_at,
            COUNT(*) FILTER (
              WHERE p.status IN ('CONFIRMED', 'RECEIVED')
            )::int AS paid_payments_count
          FROM payments p
          GROUP BY p.charge_id
        )
        SELECT
          c.id,
          pp.paid_at AS "paidAt",
          COALESCE(pp.paid_payments_count, 0)::int AS "paidPaymentsCount"
        FROM charges c
        LEFT JOIN paid_payment pp ON pp.charge_id = c.id
        WHERE ${where}
        ORDER BY
          pp.paid_at ${direction} NULLS LAST,
          c.created_at ${direction},
          c.id ${direction}
        LIMIT ${limit}
        OFFSET ${skip}
      `),
      this.prisma.$queryRaw<ChargeSummaryRow[]>(Prisma.sql`
        WITH paid_payment AS (
          SELECT
            p.charge_id,
            MIN(p.paid_at) FILTER (
              WHERE p.status IN ('CONFIRMED', 'RECEIVED')
            ) AS paid_at
          FROM payments p
          GROUP BY p.charge_id
        ),
        item_quantity AS (
          SELECT
            ci.charge_id,
            SUM(ci.quantity)::int AS total_quantity
          FROM charge_items ci
          GROUP BY ci.charge_id
        )
        SELECT
          COUNT(*)::int AS "salesCount",
          COALESCE(SUM(c.total_amount), 0)::text AS "grossRevenue",
          COALESCE(AVG(c.total_amount), 0)::text AS "averageTicket",
          COALESCE(SUM(COALESCE(iq.total_quantity, 0)), 0)::int AS "itemsSold"
        FROM charges c
        LEFT JOIN paid_payment pp ON pp.charge_id = c.id
        LEFT JOIN item_quantity iq ON iq.charge_id = c.id
        WHERE ${where}
      `),
    ]);

    const summary: IntegrationSaleSummaryDto = summaryRows[0] ?? {
      salesCount: 0,
      grossRevenue: '0',
      averageTicket: '0',
      itemsSold: 0,
    };

    if (indexRows.length === 0) {
      return {
        data: [],
        pagination: this.pagination(page, limit, summary.salesCount),
        summary: this.normaliseSummary(summary),
      };
    }

    const ids = indexRows.map((row) => row.id);
    const rows = await this.prisma.charge.findMany({
      where: {
        id: { in: ids },
        orderStatus: OrderStatus.PAID,
      },
      select: CHARGE_LIST_SELECT,
    });

    const byId = new Map(rows.map((row) => [row.id, row]));
    const indexById = new Map(indexRows.map((row) => [row.id, row]));

    const data = ids
      .map((id) => {
        const row = byId.get(id);
        if (!row) return null;
        return this.chargeListItem(row, indexById.get(id));
      })
      .filter((row): row is IntegrationChargeListItemDto => row !== null);

    return {
      data,
      pagination: this.pagination(page, limit, summary.salesCount),
      summary: this.normaliseSummary(summary),
    };
  }

  async getCharge(id: string): Promise<IntegrationChargeDetailDto> {
    const row = await this.prisma.charge.findFirst({
      where: {
        id,
        orderStatus: OrderStatus.PAID,
      },
      select: CHARGE_DETAIL_SELECT,
    });

    if (!row) throw new NotFoundException('Venda paga não encontrada');

    const completed = this.completedPayments(row.payments);
    const canonicalPaidAt =
      completed
        .map((payment) => payment.paidAt)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ?? null;

    const base = this.chargeListItem(row, {
      id: row.id,
      paidAt: canonicalPaidAt,
      paidPaymentsCount: completed.length,
    });

    return {
      ...base,
      payments: row.payments.map((payment) => ({
        id: payment.id,
        provider: payment.provider,
        billingType: payment.billingType,
        status: payment.status,
        amount: payment.amount.toFixed(2),
        installments: payment.installments,
        paidAt: payment.paidAt,
        netValue: payment.netValue?.toFixed(2) ?? null,
        createdAt: payment.createdAt,
      })),
      doctor: row.doctor
        ? {
            id: row.doctor.id,
            name: row.doctor.name,
          }
        : null,
      splits: row.splits.map((split) => ({
        id: split.id,
        recipientType: split.recipientType,
        calculationType: split.calculationType,
        chargeItemId: split.chargeItemId,
        percentage: split.percentage?.toString() ?? null,
        fixedValue: split.fixedValue?.toFixed(2) ?? null,
        basisAmount: split.basisAmount?.toFixed(2) ?? null,
        calculatedValue: split.calculatedValue?.toFixed(2) ?? null,
        recipient: {
          id: split.subaccount.id,
          name: split.subaccount.name,
        },
      })),
      description: row.description,
      notes: row.notes,
    };
  }

  private chargeListItem(
    row: ChargeListRow | ChargeDetailRow,
    indexed?: ChargeIndexRow,
  ): IntegrationChargeListItemDto {
    const completed = this.completedPayments(row.payments);
    const payment = completed[0] ?? null;
    const canonicalPaidAt =
      indexed?.paidAt ??
      completed
        .map((candidate) => candidate.paidAt)
        .filter((value): value is Date => value !== null)
        .sort((a, b) => a.getTime() - b.getTime())[0] ??
      null;

    return {
      id: row.id,
      orderKind: row.orderKind,
      orderStatus: 'PAID',
      createdAt: row.createdAt,
      paidAt: canonicalPaidAt,
      customer: {
        id: row.customer?.id ?? row.customerId,
        name: row.customerName,
        email: row.customerEmail,
        cpfCnpj: row.customerCpfCnpj,
        phone: row.customer?.phone ?? null,
      },
      items: row.items.map((item) => ({
        id: item.id,
        name: item.productName,
        sku: item.productSku,
        productType: item.productType,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toFixed(2),
        lineTotal: item.lineTotal.toFixed(2),
        fulfillmentType: item.fulfillmentType ?? null,
        supplier: item.supplier
          ? {
              id: item.supplier.id,
              name: item.supplier.name,
            }
          : null,
      })),
      payment: payment
        ? {
            id: payment.id,
            provider: payment.provider,
            billingType: payment.billingType,
            status: payment.status,
            amount: payment.amount.toFixed(2),
            installments: payment.installments,
            paidAt: payment.paidAt,
            netValue: payment.netValue?.toFixed(2) ?? null,
          }
        : {
            id: null,
            provider: null,
            billingType: null,
            status: null,
            amount: null,
            installments: null,
            paidAt: null,
            netValue: null,
          },
      totals: {
        subtotal: row.subtotal.toFixed(2),
        discount: row.discountAmount.toFixed(2),
        shipping: row.shippingAmount.toFixed(2),
        total: row.totalAmount.toFixed(2),
      },
      totalQuantity: row.items.reduce((total, item) => total + item.quantity, 0),
      paidPaymentsCount: indexed?.paidPaymentsCount ?? completed.length,
      origin: row.createdByIntegration
        ? {
            type: 'INTEGRATION',
            name: row.createdByIntegration.name,
          }
        : row.createdBy
          ? {
              type: 'PANEL',
              name: row.createdBy.name,
            }
          : {
              type: 'UNKNOWN',
              name: null,
            },
    };
  }

  private completedPayments<T extends {
    id: string;
    status: PaymentStatus;
    paidAt: Date | null;
    createdAt: Date;
  }>(payments: T[]): T[] {
    return payments
      .filter((payment) =>
        COMPLETED_PAYMENT_STATUSES.includes(
          payment.status as (typeof COMPLETED_PAYMENT_STATUSES)[number],
        ),
      )
      .sort((a, b) => {
        const aPaid = a.paidAt?.getTime() ?? Number.POSITIVE_INFINITY;
        const bPaid = b.paidAt?.getTime() ?? Number.POSITIVE_INFINITY;
        if (aPaid !== bPaid) return aPaid - bPaid;
        const created = a.createdAt.getTime() - b.createdAt.getTime();
        return created !== 0 ? created : a.id.localeCompare(b.id);
      });
  }

  private normaliseSummary(summary: ChargeSummaryRow): IntegrationSaleSummaryDto {
    return {
      salesCount: Number(summary.salesCount ?? 0),
      grossRevenue: new Prisma.Decimal(summary.grossRevenue ?? '0')
        .toDecimalPlaces(2)
        .toFixed(2),
      averageTicket: new Prisma.Decimal(summary.averageTicket ?? '0')
        .toDecimalPlaces(2)
        .toFixed(2),
      itemsSold: Number(summary.itemsSold ?? 0),
    };
  }

  private salesWhere(query: IntegrationSalesQueryDto): Prisma.Sql {
    const conditions: Prisma.Sql[] = [Prisma.sql`c.order_status = 'PAID'`];

    if (query.search) {
      const escaped = query.search.replace(/[\\%_]/g, '\\  private productWhere(search?: string): Prisma.ProductWhereInput {');
      const pattern = '%' + escaped + '%';
      conditions.push(Prisma.sql`(
        c.customer_name ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(c.customer_email, '') ILIKE ${pattern} ESCAPE '\\'
        OR COALESCE(c.customer_cpf_cnpj, '') ILIKE ${pattern} ESCAPE '\\'
        OR EXISTS (
          SELECT 1
          FROM customers cu
          WHERE cu.id = c.customer_id
            AND COALESCE(cu.phone, '') ILIKE ${pattern} ESCAPE '\\'
        )
        OR EXISTS (
          SELECT 1
          FROM charge_items ci_search
          WHERE ci_search.charge_id = c.id
            AND (
              ci_search.product_name ILIKE ${pattern} ESCAPE '\\'
              OR COALESCE(ci_search.product_sku, '') ILIKE ${pattern} ESCAPE '\\'
            )
        )
      )`);
    }

    if (query.dateFrom) {
      conditions.push(Prisma.sql`pp.paid_at >= ${this.dateBoundary(query.dateFrom, false)}`);
    }
    if (query.dateTo) {
      conditions.push(Prisma.sql`pp.paid_at <= ${this.dateBoundary(query.dateTo, true)}`);
    }
    if (query.dateFrom && query.dateTo) {
      const from = this.dateBoundary(query.dateFrom, false);
      const to = this.dateBoundary(query.dateTo, true);
      if (from.getTime() > to.getTime()) {
        throw new BadRequestException('dateFrom não pode ser posterior a dateTo');
      }
    }

    if (query.paymentMethod) {
      if (query.paymentMethod === 'OTHER') {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1
          FROM payments pm
          WHERE pm.charge_id = c.id
            AND pm.status IN ('CONFIRMED', 'RECEIVED')
            AND pm.billing_type NOT IN ('PIX', 'CREDIT_CARD', 'BOLETO')
        )`);
      } else {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1
          FROM payments pm
          WHERE pm.charge_id = c.id
            AND pm.status IN ('CONFIRMED', 'RECEIVED')
            AND pm.billing_type = ${query.paymentMethod}
        )`);
      }
    }

    if (query.productType) {
      if (query.productType === 'UNCLASSIFIED') {
        conditions.push(Prisma.sql`(
          c.order_kind IS NULL
          OR (
            c.order_kind = 'PRODUCT'
            AND EXISTS (
              SELECT 1
              FROM charge_items ci_type
              WHERE ci_type.charge_id = c.id
                AND ci_type.product_type IS NULL
            )
          )
        )`);
      } else {
        conditions.push(Prisma.sql`EXISTS (
          SELECT 1
          FROM charge_items ci_type
          WHERE ci_type.charge_id = c.id
            AND ci_type.product_type = ${query.productType}
        )`);
      }
    }

    if (query.orderKind) {
      conditions.push(
        Prisma.sql`c.order_kind = ${query.orderKind}::"OrderKind"`,
      );
    }

    return Prisma.join(conditions, ' AND ');
  }

  private dateBoundary(value: string, endOfDay: boolean): Date {
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
    const parsed = new Date(
      dateOnly
        ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00.000'}-03:00`
        : value,
    );
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException('Data de filtro inválida');
    }
    return parsed;
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
