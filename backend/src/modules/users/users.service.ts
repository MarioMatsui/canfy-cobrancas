import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateUserDto, UpdateProfileDto } from './users.dto';
import * as crypto from 'crypto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  async findAll() {
    return this.prisma.user.findMany({
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  async create(dto: CreateUserDto) {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new BadRequestException('Email já cadastrado');

    const salt = crypto.randomBytes(32).toString('hex');
    const hashedPassword = this.hashPassword(dto.password, salt);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: hashedPassword,
        salt,
        name: dto.name,
        role: dto.role || 'ATTENDANT',
      },
    });

    return { id: user.id, email: user.email, name: user.name, role: user.role, createdAt: user.createdAt };
  }

  async remove(id: string, requesterId: string) {
    if (id === requesterId) throw new ForbiddenException('Não é possível excluir a si mesmo');
    await this.prisma.user.delete({ where: { id } });
    return { message: 'Usuário excluído' };
  }

  async updateProfile(id: string, dto: UpdateProfileDto) {
    const data: Record<string, unknown> = {};
    if (dto.name) data.name = dto.name;
    if (dto.email) {
      const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
      if (existing && existing.id !== id) throw new BadRequestException('Email já em uso');
      data.email = dto.email;
    }
    if (dto.password) {
      const salt = crypto.randomBytes(32).toString('hex');
      data.password = this.hashPassword(dto.password, salt);
      data.salt = salt;
    }

    const user = await this.prisma.user.update({
      where: { id },
      data,
      select: { id: true, email: true, name: true, role: true },
    });

    return user;
  }
}
