import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma/prisma.service';
import { CreateChargeDto } from '../charges/charges.dto';
import { ChargesService } from '../charges/charges.service';
import {
  IntegrationChargeCreateResponseDto,
  IntegrationCreateChargeDto,
} from './integration-api.dto';
import { AuthenticatedIntegration } from './integrations.service';

@Injectable()
export class IntegrationWriteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chargesService: ChargesService,
  ) {}

  async createCharge(
    dto: IntegrationCreateChargeDto,
    integration: AuthenticatedIntegration,
    rawIdempotencyKey: string | undefined,
  ): Promise<IntegrationChargeCreateResponseDto> {
    const idempotencyKey = this.normalizeIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.hashPayload(dto);

    const existing = await this.findExisting(integration.id, idempotencyKey);
    if (existing) {
      return this.replay(existing, requestHash);
    }

    const internalDto: CreateChargeDto = {
      ...dto,
      items: dto.items.map((item) => ({ ...item })),
      splits: dto.splits?.map((split) => ({ ...split })),
    };

    try {
      const created = await this.chargesService.create(internalDto, null, {
        integrationId: integration.id,
        idempotencyKey,
        requestHash,
      });

      return this.toPublicResponse(created);
    } catch (error) {
      // Duas requisições concorrentes com a mesma chave podem passar pelo
      // pre-check. A constraint UNIQUE na própria Charge decide a vencedora.
      if (this.isUniqueConstraintError(error)) {
        const winner = await this.findExisting(integration.id, idempotencyKey);
        if (winner) {
          return this.replay(winner, requestHash);
        }
      }

      throw error;
    }
  }

  private async findExisting(integrationId: string, idempotencyKey: string) {
    return this.prisma.charge.findFirst({
      where: {
        createdByIntegrationId: integrationId,
        integrationIdempotencyKey: idempotencyKey,
      },
      select: {
        id: true,
        integrationRequestHash: true,
      },
    });
  }

  private async replay(
    existing: { id: string; integrationRequestHash: string | null },
    requestHash: string,
  ): Promise<IntegrationChargeCreateResponseDto> {
    if (!existing.integrationRequestHash || existing.integrationRequestHash !== requestHash) {
      throw new ConflictException(
        'Idempotency-Key já utilizada por esta integração com um payload diferente',
      );
    }

    const charge = await this.chargesService.findOne(existing.id);
    return this.toPublicResponse(charge);
  }

  private normalizeIdempotencyKey(value: string | undefined) {
    const key = value?.trim();
    if (!key) {
      throw new BadRequestException('O header Idempotency-Key é obrigatório');
    }
    if (key.length > 200) {
      throw new BadRequestException('Idempotency-Key deve ter no máximo 200 caracteres');
    }
    if (/[\s\x00-\x1F\x7F]/.test(key)) {
      throw new BadRequestException('Idempotency-Key não pode conter espaços ou caracteres de controle');
    }
    return key;
  }

  private hashPayload(dto: IntegrationCreateChargeDto) {
    const canonical = this.canonicalize(dto);
    return crypto
      .createHash('sha256')
      .update(JSON.stringify(canonical), 'utf8')
      .digest('hex');
  }

  private canonicalize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((entry) => this.canonicalize(entry));
    }
    if (value && typeof value === 'object') {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          const child = (value as Record<string, unknown>)[key];
          if (child !== undefined) {
            acc[key] = this.canonicalize(child);
          }
          return acc;
        }, {});
    }
    return value;
  }

  private isUniqueConstraintError(error: unknown) {
    return Boolean(
      error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2002',
    );
  }

  private toPublicResponse(charge: any): IntegrationChargeCreateResponseDto {
    return {
      id: charge.id,
      status: charge.orderStatus,
      publicToken: charge.publicToken,
      checkoutUrl: charge.checkoutUrl,
      customer: {
        id: charge.customerId ?? null,
        name: charge.customerName,
        email: charge.customerEmail ?? null,
        cpfCnpj: charge.customerCpfCnpj ?? null,
      },
      totals: {
        subtotal: this.decimalString(charge.subtotal),
        discount: this.decimalString(charge.discountAmount),
        shipping: this.decimalString(charge.shippingAmount),
        total: this.decimalString(charge.totalAmount),
      },
      createdAt: charge.createdAt,
    };
  }

  private decimalString(value: unknown) {
    if (value === null || value === undefined) return '0.00';
    if (typeof value === 'object' && value && 'toFixed' in value) {
      const toFixed = (value as { toFixed: (digits: number) => string }).toFixed;
      return toFixed.call(value, 2);
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed.toFixed(2) : String(value);
  }
}
