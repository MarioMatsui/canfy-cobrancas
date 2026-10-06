import { NotFoundException } from '@nestjs/common';
import { Prisma, ProductPriceCurrency } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ExchangeRateService } from '../../common/exchange-rate/exchange-rate.service';
import { IntegrationReadService } from './integration-read.service';

describe('IntegrationReadService', () => {
  let service: IntegrationReadService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      product: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      subaccount: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
      },
      charge: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
      },
      $queryRaw: jest.fn(),
    };

    service = new IntegrationReadService(
      prisma as PrismaService,
      {
        getUsdBrlQuote: jest.fn().mockResolvedValue({
          pair: 'USD-BRL',
          rate: new Prisma.Decimal('5.30'),
          quotedAt: new Date('2026-10-02T03:00:00Z'),
          source: 'AWESOME_API',
        }),
      } as unknown as ExchangeRateService,
    );
  });

  it('lista somente o contrato público de produtos com paginação', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'CBD 3000',
        sku: 'CBD-3000',
        description: 'Óleo',
        defaultPrice: new Prisma.Decimal('99.90'),
        priceCurrency: ProductPriceCurrency.USD,
        productType: 'OIL',
        active: true,
        supplier: {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Fornecedor A',
          fulfillmentType: 'INTERNATIONAL',
        },
      },
    ]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.listProducts({ page: 2, limit: 10, search: 'CBD' });

    expect(result).toEqual({
      data: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'CBD 3000',
          sku: 'CBD-3000',
          description: 'Óleo',
          defaultPrice: '99.9',
          priceCurrency: ProductPriceCurrency.USD,
          priceBrl: '529.47',
          exchangeRate: '5.3',
          exchangeRateQuotedAt: new Date('2026-10-02T03:00:00Z'),
          productType: 'OIL',
          active: true,
          supplier: {
            id: '22222222-2222-4222-8222-222222222222',
            name: 'Fornecedor A',
            fulfillmentType: 'INTERNATIONAL',
          },
        },
      ],
      pagination: { page: 2, limit: 10, total: 1, totalPages: 1 },
    });

    expect(prisma.product.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        select: expect.not.objectContaining({
          weightKg: expect.anything(),
          heightCm: expect.anything(),
          widthCm: expect.anything(),
          lengthCm: expect.anything(),
        }),
      }),
    );
    expect(JSON.stringify(result)).not.toContain('walletId');
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });

  it('filtra produtos ativos e impede produto vinculado a fornecedor inelegível', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.listProducts({});

    const call = prisma.product.findMany.mock.calls[0][0];
    expect(call.where.active).toBe(true);
    expect(call.where.productType).toEqual({ not: null });
    expect(call.where.supplierSubaccountId).toEqual({ not: null });
    expect(call.where.AND[0]).toEqual({
      supplier: {
        is: expect.objectContaining({
          type: 'SUPPLIER',
          active: true,
          deletedAt: null,
          walletId: { not: null },
          fulfillmentType: { not: null },
        }),
      },
    });
  });

  it('lista apenas fornecedores elegíveis sem expor campos internos', async () => {
    prisma.subaccount.findMany.mockResolvedValue([
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Fornecedor B',
        active: true,
        fulfillmentType: 'NATIONAL',
      },
    ]);
    prisma.subaccount.count.mockResolvedValue(1);

    const result = await service.listSuppliers({ search: 'Fornecedor' });

    expect(result.data).toEqual([
      {
        id: '33333333-3333-4333-8333-333333333333',
        name: 'Fornecedor B',
        active: true,
        fulfillmentType: 'NATIONAL',
      },
    ]);

    const call = prisma.subaccount.findMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        type: 'SUPPLIER',
        active: true,
        deletedAt: null,
        walletId: { not: null },
        fulfillmentType: { not: null },
      }),
    );
    expect(call.select).toEqual({
      id: true,
      name: true,
      active: true,
      fulfillmentType: true,
    });
    expect(JSON.stringify(result)).not.toContain('cpfCnpj');
    expect(JSON.stringify(result)).not.toContain('walletId');
    expect(JSON.stringify(result)).not.toContain('apiKey');
  });

  it('lista apenas médicos elegíveis e usa consulta mínima', async () => {
    prisma.subaccount.findMany.mockResolvedValue([
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Dra. Maria',
        active: true,
      },
    ]);
    prisma.subaccount.count.mockResolvedValue(1);

    const result = await service.listDoctors({});

    expect(result.data).toEqual([
      {
        id: '44444444-4444-4444-8444-444444444444',
        name: 'Dra. Maria',
        active: true,
      },
    ]);

    const call = prisma.subaccount.findMany.mock.calls[0][0];
    expect(call.where).toEqual(
      expect.objectContaining({
        type: 'DOCTOR',
        active: true,
        deletedAt: null,
        walletId: { not: null },
      }),
    );
    expect(call.select).toEqual({ id: true, name: true, active: true });
  });

  it('retorna 404 para recurso que não está disponível na API externa', async () => {
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.getProduct('55555555-5555-4555-8555-555555555555'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('lista uma Charge paga uma única vez mesmo com múltiplos pagamentos concluídos', async () => {
    const chargeId = '66666666-6666-4666-8666-666666666666';
    prisma.$queryRaw
      .mockResolvedValueOnce([
        {
          id: chargeId,
          paidAt: new Date('2026-10-06T17:32:00Z'),
          paidPaymentsCount: 2,
        },
      ])
      .mockResolvedValueOnce([
        {
          salesCount: 1,
          grossRevenue: '549.90',
          averageTicket: '549.90',
          itemsSold: 2,
        },
      ]);

    prisma.charge.findMany.mockResolvedValue([
      {
        id: chargeId,
        customerId: '77777777-7777-4777-8777-777777777777',
        customerName: 'Mario Matsui',
        customerEmail: 'mario@example.com',
        customerCpfCnpj: '12345678901',
        orderKind: 'PRODUCT',
        orderStatus: 'PAID',
        subtotal: new Prisma.Decimal('549.90'),
        discountAmount: new Prisma.Decimal('0'),
        shippingAmount: new Prisma.Decimal('0'),
        totalAmount: new Prisma.Decimal('549.90'),
        createdAt: new Date('2026-10-06T17:00:00Z'),
        customer: {
          id: '77777777-7777-4777-8777-777777777777',
          phone: '5511999999999',
        },
        items: [
          {
            id: '88888888-8888-4888-8888-888888888888',
            productName: 'Óleo CBD 3000mg',
            productSku: 'CBD-3000',
            productType: 'OIL',
            quantity: 2,
            unitPrice: new Prisma.Decimal('274.95'),
            lineTotal: new Prisma.Decimal('549.90'),
            fulfillmentType: 'NATIONAL',
            supplier: {
              id: '99999999-9999-4999-8999-999999999999',
              name: 'Fornecedor A',
            },
          },
        ],
        payments: [
          {
            id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            provider: 'ASAAS',
            billingType: 'PIX',
            status: 'CONFIRMED',
            amount: new Prisma.Decimal('549.90'),
            installments: 1,
            paidAt: new Date('2026-10-06T17:32:00Z'),
            netValue: new Prisma.Decimal('537.41'),
            createdAt: new Date('2026-10-06T17:01:00Z'),
          },
          {
            id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
            provider: 'ASAAS',
            billingType: 'CREDIT_CARD',
            status: 'RECEIVED',
            amount: new Prisma.Decimal('549.90'),
            installments: 3,
            paidAt: new Date('2026-10-06T17:33:00Z'),
            netValue: new Prisma.Decimal('530.00'),
            createdAt: new Date('2026-10-06T17:02:00Z'),
          },
        ],
        createdByIntegration: {
          id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
          name: 'MsgDesk',
        },
        createdBy: null,
      },
    ]);

    const result = await service.listCharges({ page: 1, limit: 25 });

    expect(result.data).toHaveLength(1);
    expect(result.data[0]).toEqual(
      expect.objectContaining({
        id: chargeId,
        orderStatus: 'PAID',
        paidPaymentsCount: 2,
        paidAt: new Date('2026-10-06T17:32:00Z'),
        totalQuantity: 2,
      }),
    );
    expect(result.data[0].payment).toEqual(
      expect.objectContaining({
        billingType: 'PIX',
        status: 'CONFIRMED',
        amount: '549.90',
      }),
    );
    expect(result.summary).toEqual({
      salesCount: 1,
      grossRevenue: '549.90',
      averageTicket: '549.90',
      itemsSold: 2,
    });
    expect(result.pagination.total).toBe(1);
  });

  it('aplica filtros de vendas na consulta server-side', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          salesCount: 0,
          grossRevenue: '0',
          averageTicket: '0',
          itemsSold: 0,
        },
      ]);

    await service.listCharges({
      page: 1,
      limit: 25,
      search: 'Maria',
      dateFrom: '2026-10-01',
      dateTo: '2026-10-06',
      paymentMethod: 'PIX',
      productType: 'OIL',
      orderKind: 'PRODUCT',
      sortDirection: 'asc',
    });

    const indexQuery = prisma.$queryRaw.mock.calls[0][0];
    const summaryQuery = prisma.$queryRaw.mock.calls[1][0];
    const indexSql = indexQuery.strings.join('?');
    const summarySql = summaryQuery.strings.join('?');

    for (const sql of [indexSql, summarySql]) {
      expect(sql).toContain("c.order_status = 'PAID'");
      expect(sql).toContain('pp.paid_at >=');
      expect(sql).toContain('pp.paid_at <=');
      expect(sql).toContain('pm.billing_type =');
      expect(sql).toContain('ci_type.product_type =');
      expect(sql).toContain('c.order_kind =');
    }

    expect(indexQuery.values).toEqual(
      expect.arrayContaining([
        '%Maria%',
        'PIX',
        'OIL',
        'PRODUCT',
      ]),
    );
  });

  it('mantém summary do conjunto filtrado mesmo quando a página atual está vazia', async () => {
    prisma.$queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          salesCount: 42,
          grossRevenue: '18492.70',
          averageTicket: '440.30',
          itemsSold: 67,
        },
      ]);

    const result = await service.listCharges({ page: 99, limit: 25 });

    expect(result.data).toEqual([]);
    expect(result.summary).toEqual({
      salesCount: 42,
      grossRevenue: '18492.70',
      averageTicket: '440.30',
      itemsSold: 67,
    });
    expect(result.pagination).toEqual(
      expect.objectContaining({
        page: 99,
        limit: 25,
        total: 42,
      }),
    );
    expect(prisma.charge.findMany).not.toHaveBeenCalled();
  });

  it('não retorna detalhe para cobrança que não esteja atualmente PAID', async () => {
    prisma.charge.findFirst.mockResolvedValue(null);

    await expect(
      service.getCharge('dddddddd-dddd-4ddd-8ddd-dddddddddddd'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.charge.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
          orderStatus: 'PAID',
        },
      }),
    );
  });


});
