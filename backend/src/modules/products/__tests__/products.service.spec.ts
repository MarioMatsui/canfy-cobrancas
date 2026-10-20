import { BadRequestException } from '@nestjs/common';
import {
  FulfillmentType,
  Prisma,
  ProductPriceCurrency,
  ProductType,
  SubaccountType,
} from '@prisma/client';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ExchangeRateService } from '../../../common/exchange-rate/exchange-rate.service';
import { ProductsService } from '../products.service';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: any;

  const supplier = (overrides: Record<string, unknown> = {}) => ({
    id: '11111111-1111-4111-8111-111111111111',
    name: 'Fornecedor A',
    type: SubaccountType.SUPPLIER,
    active: true,
    deletedAt: null,
    walletId: 'wallet-1',
    fulfillmentType: FulfillmentType.INTERNATIONAL,
    ...overrides,
  });

  const product = (overrides: Record<string, unknown> = {}) => ({
    id: '22222222-2222-4222-8222-222222222222',
    name: 'Óleo CBD',
    sku: 'CBD-01',
    description: null,
    productType: ProductType.OIL,
    supplierSubaccountId: '11111111-1111-4111-8111-111111111111',
    defaultPrice: new Prisma.Decimal(99.9),
    priceCurrency: ProductPriceCurrency.USD,
    weightKg: null,
    heightCm: null,
    widthCm: null,
    lengthCm: null,
    fulfillmentType: FulfillmentType.NATIONAL,
    active: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    supplier: supplier(),
    ...overrides,
  });

  beforeEach(() => {
    prisma = {
      product: {
        findMany: jest.fn(),
        count: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      subaccount: {
        findFirst: jest.fn(),
      },
      phytocannabinoid: {
        findMany: jest.fn(),
        createMany: jest.fn(),
      },
      $transaction: jest.fn((fn: (tx: any) => Promise<any>) => fn(prisma)),
    };
    service = new ProductsService(
      prisma as PrismaService,
      {
        tryGetUsdBrlQuote: jest.fn().mockResolvedValue({
          pair: 'USD-BRL',
          rate: new Prisma.Decimal('5.30'),
          quotedAt: new Date('2026-10-02T03:00:00Z'),
          source: 'AWESOME_API',
        }),
        getUsdBrlQuote: jest.fn(),
      } as unknown as ExchangeRateService,
    );
  });

  it('lista catálogo com elegibilidade derivada pelo fornecedor atual', async () => {
    prisma.product.findMany.mockResolvedValue([product()]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll({ page: 1, limit: 20 });

    expect(result.data[0]).toEqual(
      expect.objectContaining({
        eligible: true,
        eligibilityIssues: [],
      }),
    );
  });

  it('marca produto legado sem productType como configuração pendente', async () => {
    prisma.product.findMany.mockResolvedValue([product({ productType: null })]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.data[0].eligible).toBe(false);
    expect(result.data[0].eligibilityIssues).toContain('Tipo não configurado');
  });

  it('cria produto somente com fornecedor elegível e não usa Product.fulfillmentType como entrada', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.product.findFirst.mockResolvedValue(null);
    prisma.product.create.mockResolvedValue(product());
    prisma.product.findUnique.mockResolvedValue(product());

    const result = await service.create({
      name: ' Óleo CBD ',
      sku: ' CBD-01 ',
      productType: 'OIL' as any,
      supplierSubaccountId: '11111111-1111-4111-8111-111111111111',
      defaultPrice: 399.9,
      active: true,
    });

    expect(prisma.product.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        name: 'Óleo CBD',
        sku: 'CBD-01',
        productType: ProductType.OIL,
        supplierSubaccountId: '11111111-1111-4111-8111-111111111111',
        priceCurrency: ProductPriceCurrency.USD,
      }),
    });
    expect(result.eligible).toBe(true);
  });

  it('converte o preço USD para BRL na resposta sem alterar o valor-base salvo', async () => {
    prisma.product.findMany.mockResolvedValue([product()]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.data[0].defaultPrice.toString()).toBe('99.9');
    expect(result.data[0].priceCurrency).toBe(ProductPriceCurrency.USD);
    expect(result.data[0].priceBrl).toBe('529.47');
    expect(result.data[0].exchangeRate).toBe('5.3');
  });

  it('mantém produto internacional legado em BRL como pendente até o preço ser informado em USD', async () => {
    prisma.product.findMany.mockResolvedValue([
      product({ priceCurrency: ProductPriceCurrency.BRL }),
    ]);
    prisma.product.count.mockResolvedValue(1);

    const result = await service.findAll({});

    expect(result.data[0].eligible).toBe(false);
    expect(result.data[0].eligibilityIssues).toContain(
      'Preço do produto importado precisa ser informado em USD',
    );
  });

  it.each([
    ['não SUPPLIER', { type: SubaccountType.DOCTOR }],
    ['inativo', { active: false }],
    ['excluído', { deletedAt: new Date() }],
    ['sem wallet', { walletId: null }],
    ['sem modalidade', { fulfillmentType: null }],
  ])('rejeita fornecedor %s', async (_label, overrides) => {
    prisma.subaccount.findFirst.mockResolvedValue(supplier(overrides));
    prisma.product.findFirst.mockResolvedValue(null);

    await expect(
      service.create({
        name: 'Óleo CBD',
        productType: 'OIL' as any,
        supplierSubaccountId: '11111111-1111-4111-8111-111111111111',
        defaultPrice: 399.9,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('trata SKU duplicado com mensagem de domínio', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.product.findFirst.mockResolvedValue({ id: 'other-product' });

    await expect(
      service.create({
        name: 'Óleo CBD',
        sku: 'CBD-01',
        productType: 'OIL' as any,
        supplierSubaccountId: '11111111-1111-4111-8111-111111111111',
        defaultPrice: 399.9,
      }),
    ).rejects.toThrow('Já existe um produto utilizando este SKU.');
  });

  it('não exclui produto com histórico em ChargeItem', async () => {
    prisma.product.findUnique.mockResolvedValue({
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Óleo CBD',
      _count: { chargeItems: 1 },
    });

    await expect(
      service.remove('22222222-2222-4222-8222-222222222222'),
    ).rejects.toThrow('possui histórico de cobranças');

    expect(prisma.product.delete).not.toHaveBeenCalled();
  });

  it('filtro eligible exige productType e fornecedor operacional', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);

    await service.findAll({ eligible: true });

    const where = prisma.product.findMany.mock.calls[0][0].where;
    expect(where.AND).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          productType: { not: null },
          supplierSubaccountId: { not: null },
          supplier: {
            is: expect.objectContaining({
              type: SubaccountType.SUPPLIER,
              active: true,
              deletedAt: null,
              walletId: { not: null },
              fulfillmentType: { not: null },
            }),
          },
        }),
      ]),
    );
  });

  it('retorna opções globais ordenadas, incluindo busca por nome completo', async () => {
    prisma.phytocannabinoid.findMany.mockResolvedValue([{ id: 'cbd', name: 'CBD', fullName: 'Canabidiol' }]);
    const result = await service.listPhytocannabinoids('cana');
    expect(result[0].name).toBe('CBD');
    expect(prisma.phytocannabinoid.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { OR: [
          { name: { contains: 'cana', mode: 'insensitive' } },
          { fullName: { contains: 'cana', mode: 'insensitive' } },
        ] },
        orderBy: { name: 'asc' },
      }),
    );
  });

  it('cria produto com múltiplos fitocanabinoides dentro de transação', async () => {
    const ids = [
      '33333333-3333-4333-8333-333333333331',
      '33333333-3333-4333-8333-333333333332',
      '33333333-3333-4333-8333-333333333333',
    ];
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.phytocannabinoid.findMany.mockResolvedValue(ids.map(id => ({ id })));
    prisma.product.create.mockResolvedValue(product());
    prisma.product.findUnique.mockResolvedValue(product({
      phytocannabinoids: ids.map((id, i) => ({ phytocannabinoid: {
        id, name: ['CBD', 'CBG', 'CBN'][i], fullName: null,
      } })),
    }));

    const result = await service.create({
      name: 'Óleo com 3 componentes',
      productType: 'OIL' as any,
      supplierSubaccountId: supplier().id,
      defaultPrice: 55,
      phytocannabinoids: ids.map(id => ({ id })),
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phytocannabinoids: {
          create: ids.map(phytocannabinoidId => ({ phytocannabinoidId })),
        },
      }),
    }));
    expect(result.phytocannabinoids.map((item: any) => item.name)).toEqual(['CBD', 'CBG', 'CBN']);
  });

  it('normaliza novo termo, cria de forma idempotente e o associa ao produto', async () => {
    const id = '44444444-4444-4444-8444-444444444444';
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.phytocannabinoid.findMany
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id, normalizedName: 'cbl' }]);
    prisma.phytocannabinoid.createMany.mockResolvedValue({ count: 1 });
    prisma.product.create.mockResolvedValue(product());
    prisma.product.findUnique.mockResolvedValue(product());

    await service.create({
      name: 'Óleo novo',
      productType: 'OIL' as any,
      supplierSubaccountId: supplier().id,
      defaultPrice: 60,
      phytocannabinoids: [{ name: '  CBL   ' }],
    });

    expect(prisma.phytocannabinoid.createMany).toHaveBeenCalledWith({
      data: [{ normalizedName: 'cbl', name: 'CBL', isDefault: false }],
      skipDuplicates: true,
    });
    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phytocannabinoids: { create: [{ phytocannabinoidId: id }] },
      }),
    }));
  });

  it('reutiliza termo que corresponde ao nome completo oficial', async () => {
    const id = '33333333-3333-4333-8333-333333333331';
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.phytocannabinoid.findMany.mockResolvedValueOnce([
      { id, normalizedName: 'cbd', fullName: 'Canabidiol' },
    ]);
    prisma.product.create.mockResolvedValue(product());
    prisma.product.findUnique.mockResolvedValue(product());

    await service.create({
      name: 'Óleo',
      productType: 'OIL' as any,
      supplierSubaccountId: supplier().id,
      defaultPrice: 99,
      phytocannabinoids: [{ name: 'canabidiol' }],
    });

    expect(prisma.phytocannabinoid.createMany).not.toHaveBeenCalled();
    expect(prisma.product.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ phytocannabinoids: { create: [{ phytocannabinoidId: id }] } }),
    }));
  });

  it('PATCH sem fitocanabinoides não modifica relações existentes', async () => {
    prisma.product.findUnique.mockResolvedValue(product());
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.product.update.mockResolvedValue(product());

    await service.update(product().id, { brand: 'Nova marca' });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.product.update.mock.calls[0][0].data).not.toHaveProperty('phytocannabinoids');
  });

  it('PATCH com lista vazia remove apenas associações', async () => {
    prisma.product.findUnique.mockResolvedValue(product());
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.product.update.mockResolvedValue(product());

    await service.update(product().id, { phytocannabinoids: [] });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.product.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        phytocannabinoids: { deleteMany: {}, create: [] },
      }),
    }));
  });

  it('rejeita UUID inexistente e tags repetidas sem persistir o produto', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(supplier());
    prisma.phytocannabinoid.findMany.mockResolvedValue([]);
    await expect(service.create({
      name: 'Teste',
      productType: 'OIL' as any,
      supplierSubaccountId: supplier().id,
      defaultPrice: 50,
      phytocannabinoids: [{ id: '55555555-5555-4555-8555-555555555555' }],
    })).rejects.toThrow('não existem');
    expect(prisma.product.create).not.toHaveBeenCalled();

    await expect(service.create({
      name: 'Teste',
      productType: 'OIL' as any,
      supplierSubaccountId: supplier().id,
      defaultPrice: 50,
      phytocannabinoids: [{ name: 'CBD' }, { name: 'cbd' }],
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.product.create).not.toHaveBeenCalled();
  });

  it('filtra por qualquer um e por todos no banco antes da paginação', async () => {
    prisma.product.findMany.mockResolvedValue([]);
    prisma.product.count.mockResolvedValue(0);
    const ids = [
      '33333333-3333-4333-8333-333333333331',
      '33333333-3333-4333-8333-333333333332',
    ];

    await service.findAll({ phytocannabinoidIds: ids, phytocannabinoidMode: 'any' });
    expect(prisma.product.findMany.mock.calls[0][0].where.AND).toContainEqual({
      phytocannabinoids: { some: { phytocannabinoidId: { in: ids } } },
    });
    await service.findAll({ phytocannabinoidIds: ids, phytocannabinoidMode: 'all' });
    expect(prisma.product.count.mock.calls[1][0].where.AND).toEqual(expect.arrayContaining(
      ids.map(phytocannabinoidId => ({
        phytocannabinoids: { some: { phytocannabinoidId } },
      })),
    ));
  });

});
