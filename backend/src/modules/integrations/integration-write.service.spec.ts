import { BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ChargesService } from '../charges/charges.service';
import { IntegrationWriteService } from './integration-write.service';

describe('IntegrationWriteService', () => {
  let service: IntegrationWriteService;
  let prisma: any;
  let charges: any;

  const integration = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    name: 'MsgDesk',
    scopes: ['charges:create'],
  };

  const dto: any = {
    orderKind: 'PRODUCT',
    customerName: 'João Silva',
    customerEmail: 'joao@example.com',
    customerCpfCnpj: '12345678901',
    customerPhone: '11999999999',
    items: [
      {
        productId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
        quantity: 1,
      },
    ],
  };

  const charge = {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    orderStatus: 'READY',
    publicToken: 'public-token',
    checkoutUrl: 'https://pagar.canfy.com.br/public-token',
    customerId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    customerName: 'João Silva',
    customerEmail: 'joao@example.com',
    customerCpfCnpj: '12345678901',
    subtotal: { toFixed: () => '399.90' },
    discountAmount: { toFixed: () => '0.00' },
    shippingAmount: { toFixed: () => '35.00' },
    totalAmount: { toFixed: () => '434.90' },
    createdAt: new Date('2026-10-02T01:30:00.000Z'),
  };

  beforeEach(() => {
    prisma = {
      charge: {
        findFirst: jest.fn(),
      },
    };

    charges = {
      create: jest.fn(),
      findOne: jest.fn(),
    };

    service = new IntegrationWriteService(
      prisma as PrismaService,
      charges as ChargesService,
    );
  });

  it('exige Idempotency-Key', async () => {
    await expect(
      service.createCharge(dto, integration as any, undefined),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(charges.create).not.toHaveBeenCalled();
  });

  it('cria via ChargesService e registra contexto da integração', async () => {
    prisma.charge.findFirst.mockResolvedValue(null);
    charges.create.mockResolvedValue(charge);

    const result = await service.createCharge(dto, integration as any, 'msgdesk-001');

    expect(charges.create).toHaveBeenCalledTimes(1);
    expect(charges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        orderKind: 'PRODUCT',
        items: dto.items,
        splits: undefined,
      }),
      null,
      expect.objectContaining({
        integrationId: integration.id,
        idempotencyKey: 'msgdesk-001',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );

    expect(result).toEqual({
      id: charge.id,
      status: 'READY',
      publicToken: 'public-token',
      checkoutUrl: 'https://pagar.canfy.com.br/public-token',
      customer: {
        id: charge.customerId,
        name: 'João Silva',
        email: 'joao@example.com',
        cpfCnpj: '12345678901',
      },
      totals: {
        subtotal: '399.90',
        discount: '0.00',
        shipping: '35.00',
        total: '434.90',
      },
      createdAt: charge.createdAt,
    });
  });

  it('encaminha overrides de split validados para o domínio de cobranças', async () => {
    prisma.charge.findFirst.mockResolvedValue(null);
    charges.create.mockResolvedValue(charge);

    const splitDto = {
      ...dto,
      doctorSubaccountId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      splits: [
        {
          subaccountId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          calculationType: 'PERCENTAGE',
          value: 70,
        },
        {
          subaccountId: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
          calculationType: 'FIXED',
          value: 25,
        },
      ],
    };

    await service.createCharge(splitDto, integration as any, 'split-key');

    expect(charges.create).toHaveBeenCalledWith(
      expect.objectContaining({
        doctorSubaccountId: splitDto.doctorSubaccountId,
        splits: splitDto.splits,
      }),
      null,
      expect.objectContaining({
        integrationId: integration.id,
        idempotencyKey: 'split-key',
        requestHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    );
  });

  it('repete a resposta sem criar outra Charge quando chave e payload são iguais', async () => {
    charges.create.mockResolvedValue(charge);

    prisma.charge.findFirst.mockResolvedValueOnce(null);
    await service.createCharge(dto, integration as any, 'same-key');

    const firstContext = charges.create.mock.calls[0][2];
    prisma.charge.findFirst.mockResolvedValue({
      id: charge.id,
      integrationRequestHash: firstContext.requestHash,
    });
    charges.findOne.mockResolvedValue(charge);

    const replay = await service.createCharge(dto, integration as any, 'same-key');

    expect(charges.create).toHaveBeenCalledTimes(1);
    expect(charges.findOne).toHaveBeenCalledWith(charge.id);
    expect(replay.id).toBe(charge.id);
  });

  it('retorna 409 quando a mesma chave é usada com payload diferente', async () => {
    prisma.charge.findFirst.mockResolvedValue({
      id: charge.id,
      integrationRequestHash: '0'.repeat(64),
    });

    await expect(
      service.createCharge(dto, integration as any, 'same-key'),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(charges.create).not.toHaveBeenCalled();
  });

  it('resolve corrida de concorrência pela constraint única e retorna a vencedora', async () => {
    prisma.charge.findFirst.mockResolvedValueOnce(null);

    charges.create.mockImplementation(async (_dto: unknown, _userId: unknown, context: any) => {
      prisma.charge.findFirst.mockResolvedValue({
        id: charge.id,
        integrationRequestHash: context.requestHash,
      });
      const error: any = new Error('Unique constraint');
      error.code = 'P2002';
      throw error;
    });
    charges.findOne.mockResolvedValue(charge);

    const result = await service.createCharge(dto, integration as any, 'race-key');

    expect(charges.create).toHaveBeenCalledTimes(1);
    expect(charges.findOne).toHaveBeenCalledWith(charge.id);
    expect(result.id).toBe(charge.id);
  });

  it('isola idempotência pela integração', async () => {
    prisma.charge.findFirst.mockResolvedValue(null);
    charges.create.mockResolvedValue(charge);

    await service.createCharge(dto, integration as any, 'shared-key');

    expect(prisma.charge.findFirst).toHaveBeenCalledWith({
      where: {
        createdByIntegrationId: integration.id,
        integrationIdempotencyKey: 'shared-key',
      },
      select: {
        id: true,
        integrationRequestHash: true,
      },
    });
  });
});
