import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma/prisma.service';
import * as crypto from 'crypto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  private hashPassword(password: string, salt: string): string {
    return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
  }

  async register(email: string, password: string, name: string) {
    const salt = crypto.randomBytes(32).toString('hex');
    const hashedPassword = this.hashPassword(password, salt);

    const user = await this.prisma.user.create({
      data: {
        email,
        password: hashedPassword,
        salt,
        name,
      },
    });

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async login(email: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });

    if (!user) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const hashedPassword = this.hashPassword(password, user.salt);

    if (hashedPassword !== user.password) {
      throw new UnauthorizedException('Credenciais inválidas');
    }

    const token = this.jwtService.sign({ sub: user.id, email: user.email });
    return { access_token: token, user: { id: user.id, email: user.email, name: user.name } };
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
  }
}
