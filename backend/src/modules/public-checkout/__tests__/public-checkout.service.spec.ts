import {
  GoneException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  AsaasApiException,
  AsaasService,
} from '../../../asaas/asaas.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PublicCheckoutService } from '../public-checkout.service';

const D = (value: string) => ({ toString: () => value }) as any;

const token = '42495a27-9d2d-4cc4-8aaf-dcc6bd95c248';

const publicCharge = {
  publicToken: token,
  orderStatus: 'READY',
  orderKind: 'PRODUCT',
  customerName: 'Mario Matsui',
  description: 'Pedido de medicamentos',
  subtotal: D('100.00'),
  discountAmount: D('10.00'),
  shippingAmount: D('20.00'),
  totalAmount: D('110.00'),
  value: D('110.00'),
  billingType: 'UNDEFINED',
  asaasId: null,
  invoiceUrl: null,
  pixQrCode: null,
  pixCopiaECola: null,
  maxInstallments: 6,
  expiresAt: new Date(Date.now() + 86_400_000),
  isActive: true,
  items: [
    {
      productName: 'Produto teste',
      productType: 'OIL',
      quantity: 2,
      unitPrice: D('50.00'),
      lineTotal: D('100.00'),
      fulfillmentType: 'NATIONAL',
    },
  ],
  shipments: [
    {
      type: 'NATIONAL',
      shippingAmount: D('20.00'),
      estimatedDaysMin: 3,
      estimatedDaysMax: 5,
    },
  ],
  payments: [],
};

function startCharge(overrides: Record<string, unknown> = {}) {
  return {
    id: 'charge-1',
    publicToken: token,
    orderStatus: 'READY',
    orderKind: 'PRODUCT',
    isActive: true,
    expiresAt: new Date(Date.now() + 86_400_000),
    dueDate: null,
    description: 'Pedido de medicamentos',
    totalAmount: D('110.00'),
    customer: {
      id: 'customer-1',
      name: 'Mario Matsui',
      email: 'mario@example.com',
      cpfCnpj: '12345678901',
      asaasCustomerId: 'cus_existing',
    },
    splits: [
      {
        subaccountId: 'supplier-1',
        recipientType: 'SUPPLIER',
        calculatedValue: D('90.00'),
        subaccount: { walletId: 'wallet_supplier' },
      },
    ],
    payments: [],
    ...overrides,
  };
}

describe('PublicCheckoutService', () => {
  let service: PublicCheckoutService;
  let prisma: any;
  let tx: any;
  let asaas: {
    get: jest.Mock;
    post: jest.Mock;
    delete: jest.Mock;
  };
  let configGet: jest.Mock;

  beforeEach(async () => {
    tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      charge: {
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      customer: {
        findUnique: jest.fn().mockResolvedValue(startCharge().customer),
        update: jest.fn().mockResolvedValue({}),
      },
      payment: {
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
      },
    };

    prisma = {
      charge: { findUnique: jest.fn() },
      $transaction: jest.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    };

    asaas = {
      get: jest.fn(),
      post: jest.fn(),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    configGet = jest.fn((key: string) =>
      key === 'CHECKOUT_FRONTEND_URL' ? 'https://pagar.canfy.com.br' : undefined,
    );

    const mod = await Test.createTestingModule({
      providers: [
        PublicCheckoutService,
        { provide: PrismaService, useValue: prisma },
        { provide: AsaasService, useValue: asaas },
        {
          provide: ConfigService,
          useValue: { get: configGet },
        },
      ],
    }).compile();

    service = mod.get(PublicCheckoutService);
  });

  function mockStartCharge(charge = startCharge()) {
    tx.charge.findUnique.mockResolvedValue(charge);
    tx.customer.findUnique.mockResolvedValue(charge.customer);
    return charge;
  }

  it('mantem GET publico estritamente sem efeitos colaterais', async () => {
    prisma.charge.findUnique.mockResolvedValue(publicCharge);

    const result = await service.findByToken(token);

    expect(result.orderStatus).toBe('READY');
    expect(result.availablePayments).toEqual([]);
    expect(result.totalAmount).toBe(110);
    expect(result.items[0]).toMatchObject({
      quantity: 2,
      unitPrice: 50,
      lineTotal: 100,
      productType: 'OIL',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(asaas.post).not.toHaveBeenCalled();
    expect(asaas.delete).not.toHaveBeenCalled();
  });

  it('mantem compatibilidade com item legado sem productType', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      items: [{ ...publicCharge.items[0], productType: null }],
    });

    const result = await service.findByToken(token);

    expect(result.items[0]).not.toHaveProperty('productType');
  });

  it('nao expoe productType em cobranca de consulta', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      orderKind: 'CONSULTATION',
    });

    const result = await service.findByToken(token);

    expect(result.orderKind).toBe('CONSULTATION');
    expect(result.items[0]).not.toHaveProperty('productType');
  });

  it('usa allowlist e nao expoe dados financeiros internos no GET', async () => {
    prisma.charge.findUnique.mockResolvedValue(publicCharge);

    const result = await service.findByToken(token);
    const query = prisma.charge.findUnique.mock.calls[0][0];
    const json = JSON.stringify(result).toLowerCase();

    for (const forbidden of [
      'cpf',
      'cnpj',
      'asaasid',
      'providerpaymentid',
      'wallet',
      'split',
      'doctor',
      'supplier',
      'netvalue',
      'calculatedvalue',
    ]) {
      expect(json).not.toContain(forbidden);
    }
    expect(query.select.customerCpfCnpj).toBeUndefined();
    expect(query.select.splits).toBeUndefined();
  });

  it('404 para token invalido sem consultar banco', async () => {
    await expect(service.findByToken('invalido')).rejects.toThrow(NotFoundException);
    expect(prisma.charge.findUnique).not.toHaveBeenCalled();
  });

  it('404 para cobranca inexistente ou inativa', async () => {
    prisma.charge.findUnique.mockResolvedValueOnce(null);
    await expect(service.findByToken(token)).rejects.toThrow(NotFoundException);

    prisma.charge.findUnique.mockResolvedValueOnce({ ...publicCharge, isActive: false });
    await expect(service.findByToken(token)).rejects.toThrow(NotFoundException);
  });

  it('410 para cobranca expirada', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      expiresAt: new Date(Date.now() - 1_000),
    });
    await expect(service.findByToken(token)).rejects.toThrow(GoneException);
  });

  it('mantem a confirmacao PAID acessivel mesmo depois da validade do link', async () => {
    const expiredAt = new Date(Date.now() - 1_000);
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      orderStatus: 'PAID',
      expiresAt: expiredAt,
    });

    const loaded = await service.findByToken(token);
    expect(loaded.orderStatus).toBe('PAID');

    mockStartCharge(
      startCharge({
        orderStatus: 'PAID',
        expiresAt: expiredAt,
      }),
    );

    await expect(
      service.startPayment(token, { method: 'PIX' }),
    ).resolves.toEqual({ orderStatus: 'PAID' });
    expect(asaas.post).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('nao inicia nova tentativa quando a Charge ja esta PAID', async () => {
    mockStartCharge(startCharge({ orderStatus: 'PAID' }));

    const result = await service.startPayment(token, { method: 'PIX' });

    expect(result).toEqual({ orderStatus: 'PAID' });
    expect(asaas.post).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it.each(['0.00', '-0.01'])(
    'nao inicia pagamento quando o total persistido e invalido (%s)',
    async (total) => {
      mockStartCharge(startCharge({ totalAmount: D(total) }));

      await expect(
        service.startPayment(token, { method: 'PIX' }),
      ).rejects.toThrow(GoneException);

      expect(asaas.post).not.toHaveBeenCalled();
      expect(tx.payment.create).not.toHaveBeenCalled();
    },
  );

  it('inicia Pix real, persiste Payment e usa o calculatedValue travado no split', async () => {
    mockStartCharge();
    asaas.post.mockResolvedValue({
      id: 'pay_pix',
      status: 'PENDING',
      billingType: 'PIX',
      value: 110,
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_pix',
    });
    asaas.get.mockImplementation(async (path: string) => {
      if (path.includes('/pixQrCode')) {
        return {
          encodedImage: 'BASE64_REAL_DO_PROVIDER',
          payload: 'PIX-COPIA-E-COLA-REAL',
          expirationDate: '2026-09-23T03:00:00.000Z',
        };
      }
      return { data: [] };
    });

    const result = await service.startPayment(token, { method: 'PIX' });

    expect(result.orderStatus).toBe('PENDING_PAYMENT');
    expect(result.activePayment).toMatchObject({
      method: 'PIX',
      amount: 110,
      pixQrCode: 'BASE64_REAL_DO_PROVIDER',
      pixCopyPaste: 'PIX-COPIA-E-COLA-REAL',
    });
    expect(tx.payment.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          chargeId: 'charge-1',
          billingType: 'PIX',
          amount: expect.anything(),
          status: 'PENDING',
        }),
      }),
    );

    const providerBody = asaas.post.mock.calls.find(
      (call) => call[0] === '/payments',
    )?.[1];
    expect(providerBody).toMatchObject({
      customer: 'cus_existing',
      billingType: 'PIX',
      value: 110,
      split: [{ walletId: 'wallet_supplier', fixedValue: 90 }],
    });
    expect(providerBody).not.toHaveProperty('installmentCount');
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ orderStatus: 'PENDING_PAYMENT' }),
      }),
    );
  });

  it('mantem o frete ja incorporado ao repasse do fornecedor e aceita medico ausente', async () => {
    mockStartCharge();
    asaas.post.mockResolvedValue({
      id: 'pay_pix',
      status: 'PENDING',
      invoiceUrl: null,
    });
    asaas.get.mockResolvedValue({
      encodedImage: 'QR',
      payload: 'PAYLOAD',
      expirationDate: null,
    });

    await service.startPayment(token, { method: 'PIX' });

    const body = asaas.post.mock.calls.find((call) => call[0] === '/payments')?.[1];
    expect(body.split).toEqual([
      { walletId: 'wallet_supplier', fixedValue: 90 },
    ]);
  });

  it('inicia Cartao hospedado sem coletar dados de cartao e retorna somente invoiceUrl publico', async () => {
    mockStartCharge();
    asaas.post.mockResolvedValue({
      id: 'pay_card',
      status: 'PENDING',
      billingType: 'CREDIT_CARD',
      value: 110,
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_card',
    });

    const result = await service.startPayment(token, { method: 'CARD' });

    expect(result).toEqual({
      orderStatus: 'PENDING_PAYMENT',
      activePayment: {
        method: 'CARD',
        status: 'PENDING',
        amount: 110,
        invoiceUrl: 'https://sandbox.asaas.com/i/pay_card',
      },
    });

    const providerBody = asaas.post.mock.calls.find(
      (call) => call[0] === '/payments',
    )?.[1];
    expect(providerBody).toMatchObject({
      billingType: 'CREDIT_CARD',
    });
    expect(providerBody).not.toHaveProperty('callback');
    expect(providerBody).not.toHaveProperty('creditCard');
    expect(providerBody).not.toHaveProperty('creditCardHolderInfo');
    expect(providerBody).not.toHaveProperty('installmentCount');
  });

  it('inclui callback de retorno somente quando configurado explicitamente', async () => {
    configGet.mockImplementation((key: string) => {
      if (key === 'ASAAS_PAYMENT_CALLBACK_BASE_URL') {
        return 'https://pagar.canfy.com.br/pagamento';
      }
      if (key === 'CHECKOUT_FRONTEND_URL') {
        return 'https://pagar.canfy.com.br';
      }
      return undefined;
    });
    mockStartCharge();
    asaas.post.mockResolvedValue({
      id: 'pay_card_callback',
      status: 'PENDING',
      billingType: 'CREDIT_CARD',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_card_callback',
    });

    await service.startPayment(token, { method: 'CARD' });

    const providerBody = asaas.post.mock.calls.find(
      (call) => call[0] === '/payments',
    )?.[1];
    expect(providerBody.callback).toEqual({
      successUrl: 'https://pagar.canfy.com.br/pagamento/' + token,
      autoRedirect: true,
    });
  });

  it('reutiliza Pix pendente sem criar outra cobranca Asaas', async () => {
    const existing = {
      id: 'payment-1',
      providerPaymentId: 'pay_pix',
      billingType: 'PIX',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: null,
      pixQrCode: 'QR_SALVO',
      pixCopyPaste: 'PAYLOAD_SALVO',
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    mockStartCharge(startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [existing] }));

    const result = await service.startPayment(token, { method: 'PIX' });

    expect(result.activePayment).toMatchObject({
      method: 'PIX',
      pixQrCode: 'QR_SALVO',
      pixCopyPaste: 'PAYLOAD_SALVO',
    });
    expect(asaas.post).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
  });

  it('reutiliza Cartao pendente e o invoiceUrl existente', async () => {
    const existing = {
      id: 'payment-card',
      providerPaymentId: 'pay_card',
      billingType: 'CREDIT_CARD',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_card',
      pixQrCode: null,
      pixCopyPaste: null,
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    mockStartCharge(startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [existing] }));

    const result = await service.startPayment(token, { method: 'CARD' });

    expect(result.activePayment?.invoiceUrl).toBe(
      'https://sandbox.asaas.com/i/pay_card',
    );
    expect(asaas.post).not.toHaveBeenCalled();
  });

  it('serializa o inicio no banco e um retry reutiliza a tentativa pendente', async () => {
    mockStartCharge();
    asaas.post.mockResolvedValue({
      id: 'pay_once',
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_once',
    });

    await service.startPayment(token, { method: 'CARD' });

    const existing = {
      id: 'payment-once',
      providerPaymentId: 'pay_once',
      billingType: 'CREDIT_CARD',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_once',
      pixQrCode: null,
      pixCopyPaste: null,
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    tx.charge.findUnique.mockResolvedValue(
      startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [existing] }),
    );

    await service.startPayment(token, { method: 'CARD' });

    expect(asaas.post).toHaveBeenCalledTimes(1);
    expect(tx.$queryRaw).toHaveBeenCalled();
  });

  it('mantem Pix pendente ao iniciar Cartao e nao remove a cobranca anterior no Asaas', async () => {
    const pix = {
      id: 'payment-pix',
      providerPaymentId: 'pay_old_pix',
      billingType: 'PIX',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: null,
      pixQrCode: 'QR',
      pixCopyPaste: 'PAYLOAD',
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    mockStartCharge(startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [pix] }));
    asaas.get.mockResolvedValue({ id: 'pay_old_pix', status: 'PENDING' });
    asaas.post.mockResolvedValue({
      id: 'pay_new_card',
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_new_card',
    });

    const result = await service.startPayment(token, { method: 'CARD' });

    expect(result.activePayment).toMatchObject({
      method: 'CARD',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_new_card',
    });
    expect(asaas.delete).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalledWith({
      where: { id: 'payment-pix' },
      data: { status: 'CANCELLED' },
    });
    expect(asaas.post).toHaveBeenCalledWith(
      '/payments',
      expect.objectContaining({ billingType: 'CREDIT_CARD' }),
    );
  });

  it('preserva Pix e mantem a Charge pendente se a criacao do Cartao falhar', async () => {
    const pix = {
      id: 'payment-pix',
      providerPaymentId: 'pay_old_pix',
      billingType: 'PIX',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: null,
      pixQrCode: 'QR',
      pixCopyPaste: 'PAYLOAD',
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    mockStartCharge(
      startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [pix] }),
    );
    tx.payment.count.mockResolvedValue(1);
    asaas.get.mockResolvedValue({ id: 'pay_old_pix', status: 'PENDING' });
    asaas.post.mockRejectedValue(
      new AsaasApiException(400, ['invalid_callback']),
    );

    await expect(
      service.startPayment(token, { method: 'CARD' }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(asaas.delete).not.toHaveBeenCalled();
    expect(tx.payment.update).not.toHaveBeenCalledWith({
      where: { id: 'payment-pix' },
      data: { status: 'CANCELLED' },
    });
    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'ASAAS_HTTP_400_INVALID_CALLBACK',
        }),
      }),
    );
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { orderStatus: 'PENDING_PAYMENT' } }),
    );
  });

  it('reutiliza o Pix original mesmo quando tambem existe Cartao pendente', async () => {
    const card = {
      id: 'payment-card',
      providerPaymentId: 'pay_card',
      billingType: 'CREDIT_CARD',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: 'https://sandbox.asaas.com/i/pay_card',
      pixQrCode: null,
      pixCopyPaste: null,
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    const pix = {
      id: 'payment-pix',
      providerPaymentId: 'pay_pix',
      billingType: 'PIX',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: null,
      pixQrCode: 'QR_ORIGINAL',
      pixCopyPaste: 'PAYLOAD_ORIGINAL',
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(Date.now() - 1_000),
    };
    mockStartCharge(
      startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [card, pix] }),
    );

    const result = await service.startPayment(token, { method: 'PIX' });

    expect(result.activePayment).toMatchObject({
      method: 'PIX',
      pixQrCode: 'QR_ORIGINAL',
      pixCopyPaste: 'PAYLOAD_ORIGINAL',
    });
    expect(asaas.post).not.toHaveBeenCalled();
    expect(asaas.delete).not.toHaveBeenCalled();
  });

  it('nao troca de metodo se a tentativa anterior ja foi confirmada no provider', async () => {
    const pix = {
      id: 'payment-pix',
      providerPaymentId: 'pay_paid',
      billingType: 'PIX',
      amount: D('110.00'),
      status: 'PENDING',
      invoiceUrl: null,
      pixQrCode: 'QR',
      pixCopyPaste: 'PAYLOAD',
      dueDate: new Date(Date.now() + 86_400_000),
      createdAt: new Date(),
    };
    mockStartCharge(startCharge({ orderStatus: 'PENDING_PAYMENT', payments: [pix] }));
    asaas.get.mockResolvedValue({ id: 'pay_paid', status: 'CONFIRMED' });

    const result = await service.startPayment(token, { method: 'CARD' });

    expect(result).toEqual({ orderStatus: 'PAID' });
    expect(asaas.delete).not.toHaveBeenCalled();
    expect(asaas.post).not.toHaveBeenCalled();
  });

  it('registra falha generica do provider no Payment e devolve erro publico generico', async () => {
    mockStartCharge();
    asaas.post.mockRejectedValue(new Error('erro interno provider'));

    await expect(
      service.startPayment(token, { method: 'PIX' }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'PROVIDER_REQUEST_FAILED',
        }),
      }),
    );
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { orderStatus: 'READY' } }),
    );
  });

  it('preserva codigo Asaas sanitizado quando a criacao do pagamento e rejeitada', async () => {
    mockStartCharge();
    asaas.post.mockRejectedValue(
      new AsaasApiException(400, ['invalid_callback']),
    );

    await expect(
      service.startPayment(token, { method: 'CARD' }),
    ).rejects.toThrow(ServiceUnavailableException);

    expect(tx.payment.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'FAILED',
          failureReason: 'ASAAS_HTTP_400_INVALID_CALLBACK',
        }),
      }),
    );
    expect(tx.charge.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { orderStatus: 'READY' } }),
    );
  });

  it('cria e persiste Customer Asaas quando ainda nao existe', async () => {
    const customer = { ...startCharge().customer, asaasCustomerId: null };
    mockStartCharge(startCharge({ customer }));
    tx.customer.findUnique.mockResolvedValue(customer);
    asaas.get
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({ data: [] });
    asaas.post
      .mockResolvedValueOnce({ id: 'cus_created' })
      .mockResolvedValueOnce({
        id: 'pay_card',
        status: 'PENDING',
        invoiceUrl: 'https://sandbox.asaas.com/i/pay_card',
      });

    await service.startPayment(token, { method: 'CARD' });

    expect(asaas.post).toHaveBeenNthCalledWith(
      1,
      '/customers',
      expect.objectContaining({
        name: 'Mario Matsui',
        cpfCnpj: '12345678901',
        externalReference: 'customer-1',
      }),
    );
    expect(tx.customer.update).toHaveBeenCalledWith({
      where: { id: 'customer-1' },
      data: { asaasCustomerId: 'cus_created' },
    });
  });

  it('retoma Pix no GET PENDING_PAYMENT usando o Payment sem expor providerPaymentId', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      orderStatus: 'PENDING_PAYMENT',
      payments: [
        {
          providerPaymentId: 'pay_internal',
          billingType: 'PIX',
          amount: D('110.00'),
          status: 'PENDING',
          invoiceUrl: null,
          pixQrCode: 'QR_SALVO',
          pixCopyPaste: 'PAYLOAD_SALVO',
          createdAt: new Date(),
        },
      ],
    });
    asaas.get.mockResolvedValue({
      encodedImage: 'QR_ATUAL',
      payload: 'PAYLOAD_ATUAL',
      expirationDate: '2026-09-23T03:00:00.000Z',
    });

    const result = await service.findByToken(token);

    expect(result.availablePayments).toHaveLength(1);
    expect(result.availablePayments[0]).toMatchObject({
      method: 'PIX',
      pixQrCode: 'QR_ATUAL',
      pixCopyPaste: 'PAYLOAD_ATUAL',
    });
    expect(result.activePayment).toMatchObject({
      method: 'PIX',
      pixQrCode: 'QR_ATUAL',
      pixCopyPaste: 'PAYLOAD_ATUAL',
    });
    expect(JSON.stringify(result)).not.toContain('pay_internal');
  });

  it('retorna Pix e Cartao reutilizaveis no mesmo GET sem efeitos colaterais', async () => {
    prisma.charge.findUnique.mockResolvedValue({
      ...publicCharge,
      orderStatus: 'PENDING_PAYMENT',
      payments: [
        {
          providerPaymentId: 'pay_card_internal',
          billingType: 'CREDIT_CARD',
          amount: D('110.00'),
          status: 'PENDING',
          invoiceUrl: 'https://sandbox.asaas.com/i/card',
          pixQrCode: null,
          pixCopyPaste: null,
          createdAt: new Date(),
        },
        {
          providerPaymentId: 'pay_pix_internal',
          billingType: 'PIX',
          amount: D('110.00'),
          status: 'PENDING',
          invoiceUrl: null,
          pixQrCode: 'QR_PIX',
          pixCopyPaste: 'PAYLOAD_PIX',
          createdAt: new Date(Date.now() - 1_000),
        },
      ],
    });
    asaas.get.mockResolvedValue({
      encodedImage: 'QR_PIX_ATUAL',
      payload: 'PAYLOAD_PIX_ATUAL',
      expirationDate: '2026-09-23T03:00:00.000Z',
    });

    const result = await service.findByToken(token);

    expect(result.availablePayments.map((payment) => payment.method)).toEqual([
      'CARD',
      'PIX',
    ]);
    expect(
      result.availablePayments.find((payment) => payment.method === 'PIX'),
    ).toMatchObject({
      pixQrCode: 'QR_PIX_ATUAL',
      pixCopyPaste: 'PAYLOAD_PIX_ATUAL',
    });
    expect(
      result.availablePayments.find((payment) => payment.method === 'CARD'),
    ).toMatchObject({
      invoiceUrl: 'https://sandbox.asaas.com/i/card',
    });
    expect(result.activePayment?.method).toBe('CARD');
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.payment.create).not.toHaveBeenCalled();
    expect(asaas.post).not.toHaveBeenCalled();
    expect(asaas.delete).not.toHaveBeenCalled();
    expect(JSON.stringify(result)).not.toContain('pay_card_internal');
    expect(JSON.stringify(result)).not.toContain('pay_pix_internal');
  });
});
