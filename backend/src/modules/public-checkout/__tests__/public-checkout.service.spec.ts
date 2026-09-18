import { Test } from '@nestjs/testing';
import { NotFoundException, GoneException } from '@nestjs/common';
import { PublicCheckoutService } from '../public-checkout.service';
import { PrismaService } from '../../../common/prisma/prisma.service';

const D = (v: string) => ({ toString: () => v }) as any;

const base = {
  publicToken: '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248',
  orderStatus: 'PENDING_PAYMENT',
  customerName: 'Mario',
  description: 'Óleo CBDMD',
  subtotal: D('500.00'),
  discountAmount: D('50.00'),
  shippingAmount: D('50.00'),
  totalAmount: D('500.00'),
  value: D('500.00'),
  maxInstallments: 6,
  expiresAt: null,
  isActive: true,
  items: [],
  shipments: [],
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

  it('devolve os valores corretos', async () => {
    findUnique.mockResolvedValue(base);
    const r = await service.findByToken(base.publicToken);

    expect(r.subtotal).toBe(500);
    expect(r.discount).toBe(50);
    expect(r.shipping).toBe(50);
    expect(r.total).toBe(500);
    expect(r.maxInstallments).toBe(6);
  });

  // Este e o teste que mais importa. Se alguem adicionar um campo
  // sensivel ao select do service, ele quebra.
  it('nao vaza nenhum dado sensivel', async () => {
    findUnique.mockResolvedValue(base);
    const r = await service.findByToken(base.publicToken);
    const json = JSON.stringify(r).toLowerCase();

    for (const proibido of [
      'cpf',
      'cnpj',
      'asaas',
      'wallet',
      'apikey',
      'api_key',
      'split',
      'netvalue',
      'net_value',
      'margem',
    ]) {
      expect(json).not.toContain(proibido);
    }
  });

  it('monta uma linha de fallback para cobranca antiga sem itens', async () => {
    findUnique.mockResolvedValue(base);
    const r = await service.findByToken(base.publicToken);

    expect(r.items).toHaveLength(1);
    expect(r.items[0].name).toBe('Óleo CBDMD');
    expect(r.items[0].lineTotal).toBe(500);
  });

  it('usa os itens reais quando existem', async () => {
    findUnique.mockResolvedValue({
      ...base,
      items: [
        { productName: 'Óleo X', quantity: 1, unitPrice: D('500.00'), lineTotal: D('500.00') },
        { productName: 'Gomas', quantity: 2, unitPrice: D('75.00'), lineTotal: D('150.00') },
      ],
    });
    const r = await service.findByToken(base.publicToken);

    expect(r.items).toHaveLength(2);
    expect(r.items[1].quantity).toBe(2);
  });

  it('devolve o prazo de entrega quando ha envio', async () => {
    findUnique.mockResolvedValue({
      ...base,
      shipments: [{ estimatedDaysMin: 3, estimatedDaysMax: 6 }],
    });
    const r = await service.findByToken(base.publicToken);

    expect(r.delivery).toEqual({ minDays: 3, maxDays: 6 });
  });

  it('404 quando o token nao existe', async () => {
    findUnique.mockResolvedValue(null);
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(NotFoundException);
  });

  it('410 para cobranca em DRAFT', async () => {
    findUnique.mockResolvedValue({ ...base, orderStatus: 'DRAFT' });
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(GoneException);
  });

  it('410 para cobranca cancelada', async () => {
    findUnique.mockResolvedValue({ ...base, orderStatus: 'CANCELLED' });
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(GoneException);
  });

  it('410 quando o link expirou', async () => {
    findUnique.mockResolvedValue({ ...base, expiresAt: new Date(Date.now() - 1000) });
    await expect(service.findByToken(base.publicToken)).rejects.toThrow(GoneException);
  });

  it('exibe normalmente cobranca ja paga', async () => {
    findUnique.mockResolvedValue({ ...base, orderStatus: 'PAID' });
    const r = await service.findByToken(base.publicToken);
    expect(r.status).toBe('PAID');
  });
});
