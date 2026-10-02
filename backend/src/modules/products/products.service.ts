import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentType, Prisma, ProductType, SubaccountType } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  CreateProductDto,
  ListProductsDto,
  ProductAdminStatusDto,
  UpdateProductDto,
} from './products.dto';

const ELIGIBLE_SUPPLIER: Prisma.SubaccountWhereInput = {
  type: SubaccountType.SUPPLIER,
  active: true,
  deletedAt: null,
  walletId: { not: null },
  fulfillmentType: { not: null },
};

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  private eligibleWhere(): Prisma.ProductWhereInput {
    return {
      productType: { not: null },
      supplierSubaccountId: { not: null },
      supplier: { is: ELIGIBLE_SUPPLIER },
    };
  }

  private listWhere(query: ListProductsDto): Prisma.ProductWhereInput {
    const filters: Prisma.ProductWhereInput[] = [];
    if (query.active !== undefined) filters.push({ active: query.active });
    if (query.productType) filters.push({ productType: query.productType as ProductType });
    if (query.supplierSubaccountId) {
      filters.push({ supplierSubaccountId: query.supplierSubaccountId });
    }
    if (query.fulfillmentType) {
      filters.push({
        supplier: {
          is: { fulfillmentType: query.fulfillmentType as FulfillmentType },
        },
      });
    }
    if (query.search) {
      filters.push({
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
        ],
      });
    }
    if (query.eligible === true) filters.push(this.eligibleWhere());

    if (query.status === ProductAdminStatusDto.ACTIVE) {
      filters.push({ active: true }, this.eligibleWhere());
    } else if (query.status === ProductAdminStatusDto.INACTIVE) {
      filters.push({ active: false });
    } else if (query.status === ProductAdminStatusDto.PENDING) {
      filters.push({
        active: true,
        NOT: this.eligibleWhere(),
      });
    }

    return filters.length ? { AND: filters } : {};
  }

  private supplierSelect() {
    return {
      id: true,
      name: true,
      type: true,
      active: true,
      deletedAt: true,
      walletId: true,
      fulfillmentType: true,
    } as const;
  }

  private eligibility(product: {
    productType: ProductType | null;
    supplierSubaccountId: string | null;
    supplier: {
      type: SubaccountType;
      active: boolean;
      deletedAt: Date | null;
      walletId: string | null;
      fulfillmentType: FulfillmentType | null;
    } | null;
  }) {
    const issues: string[] = [];
    if (!product.productType) issues.push('Tipo não configurado');
    if (!product.supplierSubaccountId || !product.supplier) {
      issues.push('Fornecedor não configurado');
    } else {
      if (product.supplier.type !== SubaccountType.SUPPLIER) issues.push('Subconta não é fornecedor');
      if (product.supplier.deletedAt) issues.push('Fornecedor excluído');
      if (!product.supplier.active) issues.push('Fornecedor inativo');
      if (!product.supplier.walletId) issues.push('Fornecedor sem walletId');
      if (!product.supplier.fulfillmentType) issues.push('Fornecedor sem modalidade logística');
    }
    return { eligible: issues.length === 0, eligibilityIssues: issues };
  }

  private decorate<T extends {
    productType: ProductType | null;
    supplierSubaccountId: string | null;
    supplier: {
      type: SubaccountType;
      active: boolean;
      deletedAt: Date | null;
      walletId: string | null;
      fulfillmentType: FulfillmentType | null;
    } | null;
  }>(product: T) {
    return { ...product, ...this.eligibility(product) };
  }

  async findAll(query: ListProductsDto) {
    const { page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where = this.listWhere(query);

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: { supplier: { select: this.supplierSelect() } },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data: data.map((product) => this.decorate(product)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: { supplier: { select: this.supplierSelect() } },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return this.decorate(product);
  }

  private async requireEligibleSupplier(id: string) {
    const supplier = await this.prisma.subaccount.findFirst({
      where: { id },
      select: this.supplierSelect(),
    });

    if (!supplier) throw new BadRequestException('Fornecedor não encontrado');
    if (supplier.deletedAt) throw new BadRequestException('O fornecedor selecionado foi excluído');
    if (supplier.type !== SubaccountType.SUPPLIER) {
      throw new BadRequestException('A subconta selecionada não está classificada como Fornecedor');
    }
    if (!supplier.active) throw new BadRequestException('O fornecedor selecionado está inativo');
    if (!supplier.walletId) {
      throw new BadRequestException('O fornecedor selecionado não possui walletId do Asaas');
    }
    if (!supplier.fulfillmentType) {
      throw new BadRequestException(
        'O fornecedor selecionado não possui modalidade logística configurada',
      );
    }
    return supplier;
  }

  private async assertSkuAvailable(sku: string | null | undefined, exceptId?: string) {
    if (!sku) return;
    const existing = await this.prisma.product.findFirst({
      where: {
        sku,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (existing) throw new BadRequestException('Já existe um produto utilizando este SKU.');
  }

  async create(dto: CreateProductDto) {
    const sku = dto.sku?.trim() || null;
    const description = dto.description?.trim() || null;
    await Promise.all([
      this.requireEligibleSupplier(dto.supplierSubaccountId),
      this.assertSkuAvailable(sku),
    ]);

    try {
      const created = await this.prisma.product.create({
        data: {
          name: dto.name.trim(),
          sku,
          description,
          productType: dto.productType as ProductType,
          supplierSubaccountId: dto.supplierSubaccountId,
          defaultPrice: new Prisma.Decimal(dto.defaultPrice),
          weightKg: dto.weightKg == null ? null : new Prisma.Decimal(dto.weightKg),
          heightCm: dto.heightCm == null ? null : new Prisma.Decimal(dto.heightCm),
          widthCm: dto.widthCm == null ? null : new Prisma.Decimal(dto.widthCm),
          lengthCm: dto.lengthCm == null ? null : new Prisma.Decimal(dto.lengthCm),
          active: dto.active ?? true,
        },
      });
      return this.findOne(created.id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Já existe um produto utilizando este SKU.');
      }
      throw error;
    }
  }

  async update(id: string, dto: UpdateProductDto) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Produto não encontrado');

    const supplierSubaccountId = dto.supplierSubaccountId ?? current.supplierSubaccountId;
    if (!supplierSubaccountId) {
      throw new BadRequestException('Selecione um fornecedor.');
    }
    const productType = (dto.productType ?? current.productType) as ProductType | null;
    if (!productType) {
      throw new BadRequestException('Selecione o tipo do produto.');
    }

    const sku = dto.sku === undefined ? current.sku : dto.sku?.trim() || null;
    await Promise.all([
      this.requireEligibleSupplier(supplierSubaccountId),
      this.assertSkuAvailable(sku, id),
    ]);

    try {
      await this.prisma.product.update({
        where: { id },
        data: {
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.sku !== undefined ? { sku } : {}),
          ...(dto.description !== undefined
            ? { description: dto.description?.trim() || null }
            : {}),
          productType,
          supplierSubaccountId,
          ...(dto.defaultPrice !== undefined
            ? { defaultPrice: new Prisma.Decimal(dto.defaultPrice) }
            : {}),
          ...(dto.weightKg !== undefined
            ? { weightKg: dto.weightKg == null ? null : new Prisma.Decimal(dto.weightKg) }
            : {}),
          ...(dto.heightCm !== undefined
            ? { heightCm: dto.heightCm == null ? null : new Prisma.Decimal(dto.heightCm) }
            : {}),
          ...(dto.widthCm !== undefined
            ? { widthCm: dto.widthCm == null ? null : new Prisma.Decimal(dto.widthCm) }
            : {}),
          ...(dto.lengthCm !== undefined
            ? { lengthCm: dto.lengthCm == null ? null : new Prisma.Decimal(dto.lengthCm) }
            : {}),
          ...(dto.active !== undefined ? { active: dto.active } : {}),
        },
      });
      return this.findOne(id);
    } catch (error) {
      if (this.isUniqueConstraintError(error)) {
        throw new BadRequestException('Já existe um produto utilizando este SKU.');
      }
      throw error;
    }
  }

  async toggleActive(id: string) {
    const current = await this.prisma.product.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Produto não encontrado');
    await this.prisma.product.update({
      where: { id },
      data: { active: !current.active },
    });
    return this.findOne(id);
  }

  async remove(id: string) {
    const current = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        _count: { select: { chargeItems: true } },
      },
    });
    if (!current) throw new NotFoundException('Produto não encontrado');

    if (current._count.chargeItems > 0) {
      throw new BadRequestException(
        'Este produto possui histórico de cobranças e não pode ser excluído. Desative-o.',
      );
    }

    await this.prisma.product.delete({ where: { id } });
    return { success: true, message: 'Produto excluído com sucesso.' };
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }
}
