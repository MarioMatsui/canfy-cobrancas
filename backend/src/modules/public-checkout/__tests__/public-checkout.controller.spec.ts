import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test } from '@nestjs/testing';
import { PublicCheckoutController } from '../public-checkout.controller';
import { PublicCheckoutService } from '../public-checkout.service';

const token = '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248';

const response = {
  publicToken: token,
  orderStatus: 'READY' as const,
  orderKind: 'PRODUCT' as const,
  customerName: 'Mario',
  items: [],
  subtotal: 10,
  discountAmount: 1,
  shippingAmount: 1,
  totalAmount: 10,
  maxInstallments: 1,
  shipments: [],
};

describe('PublicCheckoutController', () => {
  let controller: PublicCheckoutController;
  let findByToken: jest.Mock;

  beforeEach(async () => {
    findByToken = jest.fn().mockResolvedValue(response);
    const mod = await Test.createTestingModule({
      controllers: [PublicCheckoutController],
      providers: [{ provide: PublicCheckoutService, useValue: { findByToken } }],
    }).compile();

    controller = mod.get(PublicCheckoutController);
  });

  it('delega a leitura ao service usando somente o token publico', async () => {
    await expect(controller.findByToken(token)).resolves.toEqual(response);
    expect(findByToken).toHaveBeenCalledWith(token);
  });

  it('nao possui JwtAuthGuard no controller nem na rota publica', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PublicCheckoutController)).toBeUndefined();
    expect(
      Reflect.getMetadata(GUARDS_METADATA, PublicCheckoutController.prototype.findByToken),
    ).toBeUndefined();
  });
});
