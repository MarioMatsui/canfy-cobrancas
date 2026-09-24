import { BadRequestException } from '@nestjs/common';
import { FulfillmentType, OrderKind, Prisma } from '@prisma/client';
import { AsaasService } from '../../../asaas/asaas.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { ChargesService } from '../charges.service';

describe('ChargesService supplier fulfillment', () => {
  let service: ChargesService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      product: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      subaccount: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    service = new ChargesService(
      prisma as PrismaService,
      {} as AsaasService,
    );
  });

  const manualItem = (overrides: Record<string, unknown> = {}) => ({
    productName: 'Óleo teste',
    productType: 'OIL',
    quantity: 1,
    unitPrice: 100,
    supplierSubaccountId: 'supplier-1',
    ...overrides,
  });

  const supplier = (overrides: Record<string, unknown> = {}) => ({
    id: 'supplier-1',
    name: 'Fornecedor teste',
    type: 'SUPPLIER',
    active: true,
    deletedAt: null,
    walletId: 'wallet-1',
    fulfillmentType: FulfillmentType.NATIONAL,
    ...overrides,
  });

  async function resolve(items: any[]) {
    return (service as any).resolveItems(items, OrderKind.PRODUCT);
  }

  it('resolve NATIONAL pelo fornecedor e ignora sobrescrita enviada pela API', async () => {
    prisma.subaccount.findMany.mockResolvedValue([supplier()]);

    const items = await resolve([
      manualItem({ fulfillmentType: FulfillmentType.INTERNATIONAL }),
    ]);

    expect(items[0].fulfillmentType).toBe(FulfillmentType.NATIONAL);
  });

  it('produto de catálogo usa o fornecedor, não Product.fulfillmentType', async () => {
    prisma.product.findMany.mockResolvedValue([
      {
        id: 'product-1',
        name: 'Produto catálogo',
        sku: 'SKU-1',
        defaultPrice: new Prisma.Decimal(120),
        supplierSubaccountId: 'supplier-1',
        fulfillmentType: FulfillmentType.INTERNATIONAL,
      },
    ]);
    prisma.subaccount.findMany.mockResolvedValue([supplier()]);

    const items = await resolve([
      {
        productId: 'product-1',
        productType: 'OIL',
        quantity: 1,
        fulfillmentType: FulfillmentType.INTERNATIONAL,
      },
    ]);

    expect(items[0].supplierSubaccountId).toBe('supplier-1');
    expect(items[0].fulfillmentType).toBe(FulfillmentType.NATIONAL);
  });

  it('resolve cobrança mista com modalidades de fornecedores diferentes', async () => {
    prisma.subaccount.findMany.mockResolvedValue([
      supplier(),
      supplier({
        id: 'supplier-2',
        name: 'Fornecedor internacional',
        walletId: 'wallet-2',
        fulfillmentType: FulfillmentType.INTERNATIONAL,
      }),
    ]);

    const items = await resolve([
      manualItem(),
      manualItem({
        productName: 'Gummy teste',
        productType: 'GUMMY',
        supplierSubaccountId: 'supplier-2',
      }),
    ]);

    expect(items.map((item: any) => item.fulfillmentType)).toEqual([
      FulfillmentType.NATIONAL,
      FulfillmentType.INTERNATIONAL,
    ]);
  });

  it('bloqueia fornecedor sem modalidade configurada com mensagem clara', async () => {
    prisma.subaccount.findMany.mockResolvedValue([
      supplier({ fulfillmentType: null }),
    ]);

    await expect(resolve([manualItem()])).rejects.toThrow(
      'ainda não possui modalidade Nacional/Internacional configurada',
    );
  });

  it.each([
    ['inativo', { active: false }],
    ['tipo inválido', { type: 'DOCTOR' }],
    ['excluído', { deletedAt: new Date() }],
    ['sem wallet', { walletId: null }],
  ])('bloqueia fornecedor %s', async (_label, overrides) => {
    prisma.subaccount.findMany.mockResolvedValue([supplier(overrides)]);

    await expect(resolve([manualItem()])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('mantém o fluxo de frete nacional, internacional e misto usando os snapshots resolvidos', async () => {
    prisma.subaccount.findMany.mockResolvedValue([
      supplier(),
      supplier({
        id: 'supplier-2',
        name: 'Fornecedor internacional',
        walletId: 'wallet-2',
        fulfillmentType: FulfillmentType.INTERNATIONAL,
      }),
    ]);

    const resolved = await resolve([
      manualItem(),
      manualItem({
        productName: 'Gummy teste',
        productType: 'GUMMY',
        supplierSubaccountId: 'supplier-2',
      }),
    ]);

    const rules = { internationalShipping: new Prisma.Decimal(150) };
    const nationalOnly = (service as any).calculateShipping(
      { nationalShippingAmount: 25 },
      OrderKind.PRODUCT,
      [resolved[0]],
      rules,
    );
    expect(nationalOnly.rows.map((row: any) => row.type)).toEqual(['NATIONAL']);

    const internationalOnly = (service as any).calculateShipping(
      {},
      OrderKind.PRODUCT,
      [resolved[1]],
      rules,
    );
    expect(internationalOnly.rows.map((row: any) => row.type)).toEqual(['INTERNATIONAL']);
    expect(Number(internationalOnly.total)).toBe(150);

    const mixed = (service as any).calculateShipping(
      { nationalShippingAmount: 25, internationalShippingAmount: 150 },
      OrderKind.PRODUCT,
      resolved,
      rules,
    );
    expect(mixed.rows.map((row: any) => row.type)).toEqual([
      'NATIONAL',
      'INTERNATIONAL',
    ]);
    expect(Number(mixed.total)).toBe(175);
  });

  it('mantém o valor resolvido como snapshot mesmo se o fornecedor mudar depois', async () => {
    const storedSupplier = supplier();
    prisma.subaccount.findMany.mockResolvedValue([storedSupplier]);

    const items = await resolve([manualItem()]);
    const supplierAfterChange = {
      ...storedSupplier,
      fulfillmentType: FulfillmentType.INTERNATIONAL,
    };

    expect(supplierAfterChange.fulfillmentType).toBe(FulfillmentType.INTERNATIONAL);
    expect(items[0].fulfillmentType).toBe(FulfillmentType.NATIONAL);
  });

  it('consulta não consulta fornecedor e continua sem frete', async () => {
    const consultationItems = await (service as any).resolveItems(
      [
        {
          productName: 'Consulta médica',
          quantity: 1,
          unitPrice: 99,
        },
      ],
      OrderKind.CONSULTATION,
    );

    expect(prisma.subaccount.findMany).not.toHaveBeenCalled();

    const shipping = (service as any).calculateShipping(
      { nationalShippingAmount: 0, internationalShippingAmount: 0 },
      OrderKind.CONSULTATION,
      consultationItems,
      {},
    );

    expect(shipping.rows).toEqual([]);
    expect(Number(shipping.total)).toBe(0);
  });
});
