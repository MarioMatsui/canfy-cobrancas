import { Injectable, NotFoundException } from '@nestjs/common';
import { FulfillmentType, Prisma } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { ListProductsDto } from './products.dto';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(query: ListProductsDto) {
    const { page = 1, limit = 100, search, active, fulfillmentType, supplierSubaccountId } = query;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {};
    if (active !== undefined) where.active = active;
    if (fulfillmentType) where.fulfillmentType = fulfillmentType as FulfillmentType;
    if (supplierSubaccountId) where.supplierSubaccountId = supplierSubaccountId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
        include: {
          supplier: {
            select: { id: true, name: true, type: true, active: true, walletId: true },
          },
        },
      }),
      this.prisma.product.count({ where }),
    ]);

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findOne(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        supplier: {
          select: { id: true, name: true, type: true, active: true, walletId: true },
        },
      },
    });
    if (!product) throw new NotFoundException('Produto não encontrado');
    return product;
  }
}
