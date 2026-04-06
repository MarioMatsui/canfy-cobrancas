import { Injectable, Logger, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateServiceTypeDto, UpdateServiceTypeDto } from './service-types.dto';

@Injectable()
export class ServiceTypesService {
  private readonly logger = new Logger(ServiceTypesService.name);

  constructor(private prisma: PrismaService) {}

  async create(dto: CreateServiceTypeDto) {
    const existing = await this.prisma.serviceType.findUnique({
      where: { name: dto.name },
    });
    if (existing) {
      throw new ConflictException(`Tipo de serviço "${dto.name}" já existe`);
    }

    const serviceType = await this.prisma.serviceType.create({
      data: {
        name: dto.name,
        description: dto.description,
        splitPercentage: dto.splitPercentage,
      },
    });

    this.logger.log(`Tipo de serviço criado: ${serviceType.name} (${serviceType.splitPercentage}%)`);
    return serviceType;
  }

  async findAll() {
    return this.prisma.serviceType.findMany({
      orderBy: { name: 'asc' },
      include: {
        _count: { select: { charges: true } },
      },
    });
  }

  async findOne(id: string) {
    const serviceType = await this.prisma.serviceType.findUnique({
      where: { id },
      include: {
        _count: { select: { charges: true } },
      },
    });
    if (!serviceType) throw new NotFoundException('Tipo de serviço não encontrado');
    return serviceType;
  }

  async update(id: string, dto: UpdateServiceTypeDto) {
    await this.findOne(id);
    const updated = await this.prisma.serviceType.update({
      where: { id },
      data: dto,
    });
    this.logger.log(`Tipo de serviço atualizado: ${updated.name} → ${updated.splitPercentage}%`);
    return updated;
  }

  async toggleActive(id: string) {
    const serviceType = await this.findOne(id);
    return this.prisma.serviceType.update({
      where: { id },
      data: { active: !serviceType.active },
    });
  }
}
