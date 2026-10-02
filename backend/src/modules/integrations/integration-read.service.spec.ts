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
});
