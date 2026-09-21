import { GoneException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PublicCheckoutService } from '../public-checkout.service';

const D = (value: string) => ({ toString: () => value }) as any;

const base = {
  publicToken: '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248',
  orderStatus: 'READY',
  orderKind: 'PRODUCT',
  customerName: 'Mario',
  description: 'Pedido de medicamentos',
  subtotal: D('500.00'),
  discountAmount: D('50.00'),
  shippingAmount: D('35.00'),
  totalAmount: D('485.00'),
  value: D('485.00'),
  maxInstallments: 6,
  expiresAt: null,
  isActive: true,
  items: [
    {
      productName: 'Óleo X',
      quantity: 1,
      unitPrice: D('500.00'),
      lineTotal: D('500.00'),
      fulfillmentType: 'NATIONAL',
    },
  ],
  shipments: [
    {
      type: 'NATIONAL',
      shippingAmount: D('35.00'),
      estimatedDaysMin: null,
      estimatedDaysMax: null,
    },
  ],
};

describe('PublicCheckoutService', () => {
  let service: PublicCheckoutService;
  let findUnique: jest.Mock;

  beforeEach(async () => {
    findUnique = jest.fn();
    const mod = await Test.createTestingModule({
      providers: [
        PublicCheckoutService,
        { provide: PrismaService, useValue: { charge: { findUnique } } },
      ],
    }).compile();
    service = mod.get(PublicCheckoutService);
  });

  it('devolve o contrato definitivo de uma cobranca READY', async () => {
    findUnique.mockResolvedValue(base);
    const result = await service.findByToken(base.publicToken);

    expect(result.publicToken).toBe(base.publicToken);
    expect(result.orderStatus).toBe('READY');
    expect(result.orderKind).toBe('PRODUCT');
    expect(result.subtotal).toBe(500);
    expect(result.discountAmount).toBe(50);
    expect(result.shippingAmount).toBe(35);
    expect(result.totalAmount).toBe(485);
    expect(result.maxInstallments).toBe(6);
    expect(result.items[0].fulfillmentType).toBe('NATIONAL');
  });

  it('consulta o banco somente com campos permitidos para o checkout publico', async () => {
    findUnique.mockResolvedValue(base);
    await service.findByToken(base.publicToken);

    const query = findUnique.mock.calls[0][0];
    expect(query.where).toEqual({ publicToken: base.publicToken });
    for (const forbidden of [
      'id',
      'customerCpfCnpj',
      'customerAsaasId',
      'asaasId',
      'doctorSubaccountId',
      'splits',
      'splitResults',
      'netValue',
    ]) {
      expect(query.select[forbidden]).toBeUndefined();
    }
  });

  it('nao vaza informacao financeira interna na resposta', async () => {
    findUnique.mockResolvedValue(base);
    const result = await service.findByToken(base.publicToken);
    const json = JSON.stringify(result).toLowerCase();

    for (const forbidden of [
      'cpf',
      'cnpj',
      'asaas',
      'wallet',
      'apikey',
      'api_key',
      'split',
      'supplier',
      'fornecedor',
      'doctor',
      'medico',
      'netvalue',
      'net_value',
      'calculatedvalue',
      'basisamount',
      'margem',
    ]) {
      expect(json).not.toContain(forbidden);
    }
  });

  it('devolve todos os envios em pedido misto nacional e internacional', async () => {
    findUnique.mockResolvedValue({
      ...base,
      shippingAmount: D('185.00'),
      totalAmount: D('635.00'),
      shipments: [
        {
          type: 'NATIONAL',
          shippingAmount: D('35.00'),
          estimatedDaysMin: 3,
          estimatedDaysMax: 6,
        },
        {
          type: 'INTERNATIONAL',
          shippingAmount: D('150.00'),
          estimatedDaysMin: 12,
          estimatedDaysMax: 20,
        },
      ],
    });

    const result = await service.findByToken(base.publicToken);

    expect(result.shipments).toEqual([
      {
        type: 'NATIONAL',
        shippingAmount: 35,
        estimatedDaysMin: 3,
        estimatedDaysMax: 6,
      },
      {
        type: 'INTERNATIONAL',
        shippingAmount: 150,
        estimatedDaysMin: 12,
        estimatedDaysMax: 20,
      },
    ]);
  });

  it('nao expoe fulfillmentType em consulta e nao exige envio', async () => {
    findUnique.mockResolvedValue({
      ...base,
      orderKind: 'CONSULTATION',
      description: 'Consulta médica',
      shippingAmount: D('0.00'),
      totalAmount: D('450.00'),
      items: [
        {
          productName: 'Consulta médica',
          quantity: 1,
          unitPrice: D('500.00'),
          lineTotal: D('500.00'),
          fulfillmentType: 'NATIONAL',
        },
      ],
      shipments: [],
    });

    const result = await service.findByToken(base.publicToken);

    expect(result.orderKind).toBe('CONSULTATION');
    expect(result.shipments).toEqual([]);
    expect(result.items[0]).not.toHaveProperty('fulfillmentType');
  });

  it('mantem fallback para cobranca historica sem itens e sem orderKind', async () => {
    findUnique.mockResolvedValue({
      ...base,
      orderStatus: 'PENDING_PAYMENT',
      orderKind: null,
      description: 'Pagamento legado',
      subtotal: D('99.00'),
      discountAmount: D('0.00'),
      shippingAmount: D('0.00'),
      totalAmount: D('99.00'),
      value: D('99.00'),
      items: [],
      shipments: [],
    });

    const result = await service.findByToken(base.publicToken);

    expect(result).not.toHaveProperty('orderKind');
    expect(result.items).toEqual([
      { name: 'Pagamento legado', quantity: 1, unitPrice: 99, lineTotal: 99 },
    ]);
  });

  it('404 para token malformado sem consultar o banco', async () => {
    await expect(service.findByToken('token-invalido')).rejects.toThrow(NotFoundException);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('404 quando o token nao existe', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(NotFoundException);
  });

  it('404 quando a cobranca esta inativa', async () => {
    findUnique.mockResolvedValue({ ...base, isActive: false });
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(NotFoundException);
  });

  it.each(['DRAFT', 'CANCELLED', 'EXPIRED', 'REFUNDED'])(
    '410 para cobranca com orderStatus %s',
    async (orderStatus) => {
      findUnique.mockResolvedValue({ ...base, orderStatus });
      await expect(service.findByToken(base.publicToken)).rejects.toThrow(GoneException);
    },
  );

  it('410 quando o link expirou cronologicamente', async () => {
    findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(GoneException);
  });

  it.each(['READY', 'PENDING_PAYMENT', 'PAID'])('exibe status publico %s', async (orderStatus) => {
    findUnique.mockResolvedValue({ ...base, orderStatus });
    const result = await service.findByToken(base.publicToken);
    expect(result.orderStatus).toBe(orderStatus);
  });
});
