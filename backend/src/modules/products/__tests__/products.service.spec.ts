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
});
