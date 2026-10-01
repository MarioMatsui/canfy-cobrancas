import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IntegrationApiKey } from '@prisma/client';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateIntegrationDto } from './integrations.dto';
import { IntegrationScope } from './integration-scopes';

const KEY_PREFIX = 'canfy_sk_';
const KEY_ID_BYTES = 8;
const KEY_SECRET_BYTES = 32;
const KEY_PATTERN = /^canfy_sk_([A-Za-z0-9_-]{11})_([A-Za-z0-9_-]{43})$/;

export interface AuthenticatedIntegration {
  id: string;
  name: string;
  scopes: IntegrationScope[];
}

@Injectable()
export class IntegrationsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const integrations = await this.prisma.integrationApiKey.findMany({
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        status: true,
        scopes: true,
        createdAt: true,
        lastUsedAt: true,
        revokedAt: true,
        createdByUserId: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return integrations.map((integration) => ({
      ...integration,
      maskedKey: this.maskKey(integration.keyPrefix),
    }));
  }

  async create(dto: CreateIntegrationDto, createdByUserId: string) {
    const credential = this.generateCredential();
    const integration = await this.prisma.integrationApiKey.create({
      data: {
        name: dto.name.trim(),
        keyPrefix: credential.keyPrefix,
        keyHash: credential.keyHash,
        scopes: this.normalizeScopes(dto.scopes),
        createdByUserId,
      },
    });

    return {
      ...this.toPublicView(integration),
      secretKey: credential.secretKey,
    };
  }

  async revoke(id: string) {
    const integration = await this.prisma.integrationApiKey.findUnique({ where: { id } });
    if (!integration) throw new NotFoundException('Integração não encontrada');

    if (integration.status === 'REVOKED') {
      return this.toPublicView(integration);
    }

    const revoked = await this.prisma.integrationApiKey.update({
      where: { id },
      data: {
        status: 'REVOKED',
        revokedAt: new Date(),
      },
    });

    return this.toPublicView(revoked);
  }

  async rotate(id: string) {
    const current = await this.prisma.integrationApiKey.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Integração não encontrada');
    if (current.status === 'REVOKED' || current.revokedAt) {
      throw new BadRequestException('Integrações revogadas não podem ter a chave rotacionada');
    }

    const credential = this.generateCredential();
    const rotated = await this.prisma.integrationApiKey.update({
      where: { id },
      data: {
        keyPrefix: credential.keyPrefix,
        keyHash: credential.keyHash,
      },
    });

    return {
      ...this.toPublicView(rotated),
      secretKey: credential.secretKey,
    };
  }

  async authenticate(rawKey: string): Promise<AuthenticatedIntegration> {
    const keyPrefix = this.extractKeyPrefix(rawKey);
    if (!keyPrefix) throw this.invalidCredential();

    const integration = await this.prisma.integrationApiKey.findUnique({
      where: { keyPrefix },
    });

    if (!integration || integration.status !== 'ACTIVE' || integration.revokedAt) {
      throw this.invalidCredential();
    }

    const presentedHash = this.hashKey(rawKey);
    const expected = Buffer.from(integration.keyHash, 'hex');
    const presented = Buffer.from(presentedHash, 'hex');

    if (expected.length !== presented.length || !crypto.timingSafeEqual(expected, presented)) {
      throw this.invalidCredential();
    }

    const usedAt = new Date();
    await this.prisma.integrationApiKey.updateMany({
      where: {
        id: integration.id,
        status: 'ACTIVE',
        revokedAt: null,
      },
      data: { lastUsedAt: usedAt },
    });

    return {
      id: integration.id,
      name: integration.name,
      scopes: integration.scopes as IntegrationScope[],
    };
  }

  private generateCredential() {
    const idPart = crypto.randomBytes(KEY_ID_BYTES).toString('base64url');
    const secretPart = crypto.randomBytes(KEY_SECRET_BYTES).toString('base64url');
    const keyPrefix = `${KEY_PREFIX}${idPart}`;
    const secretKey = `${keyPrefix}_${secretPart}`;

    return {
      keyPrefix,
      secretKey,
      keyHash: this.hashKey(secretKey),
    };
  }

  private extractKeyPrefix(rawKey: string): string | null {
    const match = KEY_PATTERN.exec(rawKey);
    return match ? `${KEY_PREFIX}${match[1]}` : null;
  }

  private hashKey(rawKey: string): string {
    return crypto.createHash('sha256').update(rawKey, 'utf8').digest('hex');
  }

  private normalizeScopes(scopes: IntegrationScope[]): string[] {
    return [...new Set(scopes)].sort();
  }

  private maskKey(keyPrefix: string): string {
    return `${keyPrefix}_••••••••••••`;
  }

  private toPublicView(integration: IntegrationApiKey) {
    return {
      id: integration.id,
      name: integration.name,
      keyPrefix: integration.keyPrefix,
      maskedKey: this.maskKey(integration.keyPrefix),
      status: integration.status,
      scopes: integration.scopes,
      createdAt: integration.createdAt,
      lastUsedAt: integration.lastUsedAt,
      createdByUserId: integration.createdByUserId,
      revokedAt: integration.revokedAt,
    };
  }

  private invalidCredential() {
    return new UnauthorizedException('Credencial de integração inválida');
  }
}
