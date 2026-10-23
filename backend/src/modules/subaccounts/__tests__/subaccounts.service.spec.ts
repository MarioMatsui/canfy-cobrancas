import { BadRequestException } from '@nestjs/common';
import { FulfillmentType, SubaccountType } from '@prisma/client';
import { AsaasService } from '../../../asaas/asaas.service';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { SubaccountsService } from '../subaccounts.service';

describe('SubaccountsService metadata local', () => {
  let service: SubaccountsService;
  let prisma: any;
  let asaas: { put: jest.Mock };

  beforeEach(() => {
    prisma = {
      subaccount: {
        findFirst: jest.fn(),
        update: jest.fn(),
      },
    };
    asaas = { put: jest.fn() };
    service = new SubaccountsService(
      prisma as PrismaService,
      asaas as unknown as AsaasService,
    );
  });

  const base = (overrides: Record<string, unknown> = {}) => ({
    id: 'supplier-1',
    type: SubaccountType.SUPPLIER,
    fulfillmentType: FulfillmentType.NATIONAL,
    deletedAt: null,
    apiKey: 'secret-never-returned',
    ...overrides,
  });

  it('atualiza metadados locais sem chamar o Asaas', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(base());
    prisma.subaccount.update.mockResolvedValue(
      base({ fulfillmentType: FulfillmentType.INTERNATIONAL }),
    );

    const result = await service.updateMetadata('supplier-1', {
      type: 'SUPPLIER' as any,
      fulfillmentType: FulfillmentType.INTERNATIONAL,
    });

    expect(asaas.put).not.toHaveBeenCalled();
    expect(prisma.subaccount.update).toHaveBeenCalledWith({
      where: { id: 'supplier-1' },
      data: {
        type: SubaccountType.SUPPLIER,
        fulfillmentType: FulfillmentType.INTERNATIONAL,
      },
    });
    expect(result).not.toHaveProperty('apiKey');
  });

  it('exige fulfillment ao transformar uma conta em fornecedor', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(
      base({ type: SubaccountType.DOCTOR, fulfillmentType: null }),
    );

    await expect(
      service.updateMetadata('supplier-1', {
        type: 'SUPPLIER' as any,
        fulfillmentType: null,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.subaccount.update).not.toHaveBeenCalled();
    expect(asaas.put).not.toHaveBeenCalled();
  });

  it('impede transformar fornecedor em médico sem identidade profissional', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(base());
    await expect(service.updateMetadata('supplier-1', {
      type: 'DOCTOR' as any, fulfillmentType:null,
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.subaccount.update).not.toHaveBeenCalled();
    expect(asaas.put).not.toHaveBeenCalled();
  });

  it('preserva edição de metadata de médico já cadastrado', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(base({type:SubaccountType.DOCTOR,fulfillmentType:null}));
    prisma.subaccount.update.mockResolvedValue(base({type:SubaccountType.DOCTOR,fulfillmentType:null}));
    await service.updateMetadata('supplier-1',{type:'DOCTOR' as any});
    expect(prisma.subaccount.update).toHaveBeenCalled();
  });

  it('protege carteira de médico que possui vínculo ativo contra troca para fornecedor', async () => {
    prisma.doctorFinancialLink={count:jest.fn().mockResolvedValue(1)};
    prisma.subaccount.findFirst.mockResolvedValue(
      base({type:SubaccountType.DOCTOR,fulfillmentType:null}),
    );
    await expect(service.updateMetadata('supplier-1',{
      type:'SUPPLIER' as any, fulfillmentType:FulfillmentType.NATIONAL,
    })).rejects.toThrow('Subconta associada a médico ativo');
    expect(prisma.subaccount.update).not.toHaveBeenCalled();
  });

  it('rejeita modalidade de fornecedor em médico/outro', async () => {
    prisma.subaccount.findFirst.mockResolvedValue(
      base({ type: SubaccountType.DOCTOR, fulfillmentType: null }),
    );

    await expect(
      service.updateMetadata('supplier-1', {
        type: 'DOCTOR' as any,
        fulfillmentType: FulfillmentType.NATIONAL,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
