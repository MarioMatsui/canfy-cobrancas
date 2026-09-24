import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  DiscountType,
  FulfillmentType,
  OrderKind,
  OrderStatus,
  PaymentStatus,
  Prisma,
  QuoteSource,
  ShipmentType,
  SplitCalculationType,
  SplitRecipientType,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AsaasService } from '../../asaas/asaas.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import {
  ChargeSplitRuleDto,
  CreateChargeDto,
  CreateChargeItemDto,
  DiscountTypeDto,
  ListChargesDto,
  ProductTypeDto,
} from './charges.dto';

type Rules = {
  productSupplier: Prisma.Decimal;
  productDoctor: Prisma.Decimal;
  consultationDoctor: Prisma.Decimal;
  internationalShipping: Prisma.Decimal;
  expirationDays: number;
  checkoutBaseUrl: string;
};

type Item = {
  id: string;
  productId: string | null;
  productName: string;
  productSku: string | null;
  productType: ProductTypeDto | null;
  quantity: number;
  unitPrice: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  supplierSubaccountId: string | null;
  fulfillmentType: FulfillmentType;
};

type CalculatedSplit = {
  subaccountId: string;
  recipientType: SplitRecipientType;
  calculationType: SplitCalculationType;
  chargeItemId: string | null;
  percentage: Prisma.Decimal | null;
  fixedValue: Prisma.Decimal | null;
  basisAmount: Prisma.Decimal;
  commercialValue: Prisma.Decimal;
  shippingValue: Prisma.Decimal;
  calculatedValue: Prisma.Decimal;
};

type ProviderPaymentState = {
  id: string;
  status?: string;
};

type ProviderPaymentList = {
  data?: ProviderPaymentState[];
};

@Injectable()
export class ChargesService {
  private readonly logger = new Logger(ChargesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly asaas: AsaasService,
  ) {}

  async create(dto: CreateChargeDto, createdByUserId: string) {
    const rules = await this.loadRules();
    const orderKind = dto.orderKind as OrderKind;
    const cpfCnpj = this.normalizeCpfCnpj(dto.customerCpfCnpj);
    const items = await this.resolveItems(dto.items, orderKind);
    const subtotal = this.sum(items.map((item) => item.lineTotal));

    let doctor: { id: string; name: string; walletId: string | null } | null = null;
    if (dto.doctorSubaccountId) {
      doctor = await this.prisma.subaccount.findFirst({
        where: { id: dto.doctorSubaccountId, type: 'DOCTOR', active: true, deletedAt: null },
        select: { id: true, name: true, walletId: true },
      });
      if (!doctor) throw new BadRequestException('Médico não encontrado, inativo ou com tipo inválido');
      if (!doctor.walletId) {
        throw new BadRequestException('Médico "' + doctor.name + '" não possui walletId do Asaas');
      }
    }

    const shipping = this.calculateShipping(dto, orderKind, items, rules);
    const shippingBySupplier = this.allocateShippingToSuppliers(items, shipping.rows);
    const splits = this.buildSplits(
      dto.splits,
      orderKind,
      items,
      doctor?.id ?? null,
      subtotal,
      rules,
      shippingBySupplier,
    );

    // Repasses comerciais continuam limitados ao subtotal. O frete não entra
    // nessa base: ele é acrescentado depois e pertence 100% ao(s) fornecedor(es).
    const commercialDistributed = this.sum(splits.map((split) => split.commercialValue));
    if (commercialDistributed.gt(subtotal)) {
      throw new BadRequestException(
        'Os repasses comerciais desta cobrança somam R$ ' + commercialDistributed.toFixed(2) +
        ', acima do subtotal de R$ ' + subtotal.toFixed(2) + '.',
      );
    }

    // O desconto sai somente da margem da CanFy. Frete não compõe essa margem.
    const platformMarginBeforeDiscount = this.money(subtotal.minus(commercialDistributed));
    const discount = this.calculateDiscount(dto, subtotal);
    if (discount.amount.gt(platformMarginBeforeDiscount)) {
      throw new BadRequestException(
        'O desconto de R$ ' + discount.amount.toFixed(2) +
        ' excede a margem disponível da CanFy de R$ ' + platformMarginBeforeDiscount.toFixed(2) +
        ' nesta cobrança. Reduza o desconto ou os repasses.',
      );
    }

    const totalAmount = this.money(subtotal.minus(discount.amount).plus(shipping.total));
    if (totalAmount.lte(0)) throw new BadRequestException('O total da cobrança deve ser maior que zero');

    // calculatedValue já inclui, para fornecedores, a parcela de frete que lhes
    // pertence. Portanto o total de repasses deve ser comercial + 100% do frete.
    const distributed = this.sum(splits.map((split) => split.calculatedValue));
    const expectedDistributed = this.money(commercialDistributed.plus(shipping.total));
    if (!distributed.eq(expectedDistributed)) {
      throw new BadRequestException('Não foi possível distribuir integralmente o frete entre os fornecedores');
    }

    const mainAccountValue = this.money(totalAmount.minus(distributed));
    if (mainAccountValue.lt(0)) {
      throw new BadRequestException('Os repasses desta cobrança deixam a conta principal com valor negativo');
    }

    const chargeId = randomUUID();
    const publicToken = randomUUID();
    const expiresAt = this.resolveExpiration(dto.expiresAt, rules.expirationDays);
    const description =
      dto.description?.trim() || items.map((item) => item.productName).slice(0, 3).join(', ');

    const created = await this.prisma.$transaction(async (tx) => {
      const customer = await this.upsertCustomer(tx, {
        name: dto.customerName.trim(),
        email: dto.customerEmail?.trim() || null,
        cpfCnpj,
        phone: dto.customerPhone?.trim() || null,
      });

      await tx.charge.create({
        data: {
          id: chargeId,
          customerId: customer.id,
          customerName: dto.customerName.trim(),
          customerEmail: dto.customerEmail?.trim() || null,
          customerCpfCnpj: cpfCnpj,
          createdByUserId,
          orderKind,
          subtotal,
          discountType: discount.type,
          discountValue: discount.value,
          discountAmount: discount.amount,
          shippingAmount: shipping.total,
          totalAmount,
          orderStatus: 'READY',
          maxInstallments: dto.maxInstallments ?? 1,
          publicToken,
          expiresAt,
          doctorSubaccountId: doctor?.id ?? null,
          description,
          notes: dto.notes?.trim() || null,

          // Compatibilidade temporária com telas/rotinas históricas.
          chargeType: 'CUSTOM',
          customerAsaasId: customer.asaasCustomerId,
          billingType: 'UNDEFINED',
          value: totalAmount,
          status: 'PENDING',
          dueDate: null,
          asaasId: null,
          invoiceUrl: null,
          bankSlipUrl: null,
          pixQrCode: null,
          pixCopiaECola: null,
          netValue: null,
          isActive: true,
        },
      });

      await tx.chargeItem.createMany({
        data: items.map((item) => ({
          id: item.id,
          chargeId,
          productId: item.productId,
          productName: item.productName,
          productSku: item.productSku,
          productType: item.productType,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          lineTotal: item.lineTotal,
          supplierSubaccountId: item.supplierSubaccountId,
          fulfillmentType: item.fulfillmentType,
        })),
      });

      if (shipping.rows.length) {
        await tx.shipment.createMany({
          data: shipping.rows.map((row) => ({
            id: randomUUID(),
            chargeId,
            type: row.type,
            shippingAmount: row.amount,
            quoteSource: row.source,
            status: 'PENDING',
          })),
        });
      }

      if (splits.length) {
        await tx.chargeSplit.createMany({
          data: splits.map((split) => ({
            id: randomUUID(),
            chargeId,
            subaccountId: split.subaccountId,
            recipientType: split.recipientType,
            calculationType: split.calculationType,
            chargeItemId: split.chargeItemId,
            percentage: split.percentage,
            fixedValue: split.fixedValue,
            basisAmount: split.basisAmount,
            calculatedValue: split.calculatedValue,
          })),
        });
      }

      return tx.charge.findUnique({
        where: { id: chargeId },
        include: this.include(),
      });
    });

    if (!created) throw new NotFoundException('Cobrança criada, mas não foi possível recarregá-la');

    const checkoutUrl = this.checkoutUrl(rules.checkoutBaseUrl, publicToken);
    const mainAccountPercentage = totalAmount.gt(0)
      ? Number(mainAccountValue.div(totalAmount).mul(100).toDecimalPlaces(2).toString())
      : 0;

    this.logger.log(
      'Pedido criado: ' + chargeId +
      ' | ' + orderKind +
      ' | total R$ ' + totalAmount.toFixed(2) +
      ' | repasses (com frete) R$ ' + distributed.toFixed(2) +
      ' | principal R$ ' + mainAccountValue.toFixed(2) +
      ' | regras de repasse por cobrança | sem pagamento Asaas',
    );

    return {
      ...created,
      checkoutUrl,
      mainAccountValue,
      mainAccountPercentage,
      platformMarginBeforeDiscount,
    };
  }

  async findAll(query: ListChargesDto) {
    const { page = 1, limit = 20, status, orderStatus, orderKind, dateFrom, dateTo, search } = query;
    const where: Prisma.ChargeWhereInput = {};

    if (status) where.status = status;
    if (orderStatus) where.orderStatus = orderStatus as OrderStatus;
    if (orderKind) where.orderKind = orderKind as OrderKind;
    if (search) {
      where.OR = [
        { customerName: { contains: search, mode: 'insensitive' } },
        { customerCpfCnpj: { contains: search } },
      ];
    }
    if (dateFrom || dateTo) {
      where.createdAt = {
        ...(dateFrom && { gte: new Date(dateFrom) }),
        ...(dateTo && { lte: new Date(dateTo) }),
      };
    }

    const [data, total, baseUrl] = await Promise.all([
      this.prisma.charge.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: this.include(),
      }),
      this.prisma.charge.count({ where }),
      this.getCheckoutBaseUrl(),
    ]);

    return {
      data: data.map((charge) => this.decorate(charge, baseUrl)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const [charge, baseUrl] = await Promise.all([
      this.prisma.charge.findUnique({
        where: { id },
        include: {
          ...this.include(),
          splitResults: {
            include: { receiver: { select: { name: true, type: true } } },
            orderBy: { createdAt: 'desc' },
          },
        },
      }),
      this.getCheckoutBaseUrl(),
    ]);
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    return this.decorate(charge, baseUrl);
  }

  async cancel(id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const initial = await tx.charge.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!initial) throw new NotFoundException('Cobrança não encontrada');

        // Usa a mesma chave do checkout público. Assim, iniciar/trocar pagamento
        // e cancelar a cobrança não podem correr em paralelo para a mesma venda.
        await this.acquireLock(tx, 'charge:' + id);

        const charge = await tx.charge.findUnique({
          where: { id },
          select: {
            id: true,
            asaasId: true,
            orderStatus: true,
            isActive: true,
            payments: {
              select: {
                id: true,
                providerPaymentId: true,
                status: true,
              },
              orderBy: { createdAt: 'desc' },
            },
          },
        });
        if (!charge) throw new NotFoundException('Cobrança não encontrada');

        const paidLocally = charge.payments.some(
          (payment) =>
            payment.status === PaymentStatus.CONFIRMED ||
            payment.status === PaymentStatus.RECEIVED,
        );
        if (charge.orderStatus === OrderStatus.PAID || paidLocally) {
          throw new BadRequestException('Cobrança paga não pode ser cancelada');
        }
        if (charge.orderStatus === OrderStatus.REFUNDED) {
          throw new BadRequestException('Cobrança estornada não pode ser cancelada');
        }

        for (const payment of charge.payments) {
          const isPayableAttempt =
            payment.status === PaymentStatus.PENDING ||
            payment.status === PaymentStatus.OVERDUE;
          const isAmbiguousFailedAttempt =
            payment.status === PaymentStatus.FAILED && !payment.providerPaymentId;

          // Mesmo uma Charge já cancelada/inativa pode ter sido produzida pela
          // lógica antiga, que não cancelava Payment.providerPaymentId. Não
          // retornamos antes de reconciliar tentativas ainda potencialmente pagáveis.
          if (!isPayableAttempt && !isAmbiguousFailedAttempt) {
            continue;
          }

          let providerPaymentId = payment.providerPaymentId;
          let providerStatus: string | undefined;

          // Uma tentativa interrompida pode ter sido criada no Asaas antes de o
          // providerPaymentId ser persistido. Reconcilia pelo externalReference
          // antes de assumir que não existe cobrança remota pagável.
          if (!providerPaymentId) {
            const recovered = await this.asaas.get<ProviderPaymentList>(
              '/payments?externalReference=' +
                encodeURIComponent(this.externalReference(payment.id)) +
                '&limit=1',
            );
            const remote = recovered.data?.[0];
            if (remote?.id) {
              providerPaymentId = remote.id;
              providerStatus = remote.status;
              await tx.payment.update({
                where: { id: payment.id },
                data: { providerPaymentId: remote.id },
              });
            }
          }

          if (providerPaymentId) {
            if (!providerStatus) {
              const remote = await this.asaas.get<ProviderPaymentState>(
                '/payments/' + encodeURIComponent(providerPaymentId),
              );
              providerStatus = remote.status;
            }

            // Nunca apaga uma cobrança que o provedor já considera paga. A
            // atualização definitiva para PAID continuará sendo feita pelo webhook.
            if (providerStatus === 'CONFIRMED' || providerStatus === 'RECEIVED') {
              throw new BadRequestException(
                'O pagamento já foi confirmado no Asaas e a cobrança não pode ser cancelada',
              );
            }

            await this.asaas.delete<void>(
              '/payments/' + encodeURIComponent(providerPaymentId),
            );
          }

          await tx.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.CANCELLED,
              failureReason: null,
            },
          });
        }

        // Compatibilidade com cobranças antigas, que guardavam o id remoto em Charge.
        if (charge.asaasId) {
          await this.asaas.delete<void>(
            '/payments/' + encodeURIComponent(charge.asaasId),
          );
        }

        return tx.charge.update({
          where: { id },
          data: { orderStatus: 'CANCELLED', status: 'CANCELLED', isActive: false },
        });
      },
      { maxWait: 5_000, timeout: 30_000 },
    );
  }

  async toggleActive(id: string) {
    const charge = await this.prisma.charge.findUnique({ where: { id } });
    if (!charge) throw new NotFoundException('Cobrança não encontrada');
    if (charge.chargeType !== 'REUSABLE') {
      throw new BadRequestException('Apenas cobranças reutilizáveis legadas podem ser ativadas/desativadas');
    }
    return this.prisma.charge.update({
      where: { id },
      data: { isActive: !charge.isActive },
    });
  }

  async getReusableCharges() {
    const [charges, baseUrl] = await Promise.all([
      this.prisma.charge.findMany({
        where: { chargeType: 'REUSABLE' },
        include: this.include(),
        orderBy: { createdAt: 'desc' },
      }),
      this.getCheckoutBaseUrl(),
    ]);
    return charges.map((charge) => this.decorate(charge, baseUrl));
  }

  private async resolveItems(input: CreateChargeItemDto[], orderKind: OrderKind): Promise<Item[]> {
    const productIds = [
      ...new Set(
        input.map((item) => item.productId).filter((id): id is string => Boolean(id)),
      ),
    ];
    const products = productIds.length
      ? await this.prisma.product.findMany({
          where: { id: { in: productIds }, active: true },
        })
      : [];
    if (products.length !== productIds.length) {
      throw new BadRequestException('Um ou mais produtos do catálogo não existem ou estão inativos');
    }
    const productsById = new Map(products.map((product) => [product.id, product]));

    const supplierIds =
      orderKind === OrderKind.PRODUCT
        ? [
            ...new Set(
              input
                .map((entry) => {
                  const product = entry.productId
                    ? productsById.get(entry.productId)
                    : undefined;
                  return product?.supplierSubaccountId ?? entry.supplierSubaccountId ?? null;
                })
                .filter((id): id is string => Boolean(id)),
            ),
          ]
        : [];

    const suppliers = supplierIds.length
      ? await this.prisma.subaccount.findMany({
          where: { id: { in: supplierIds } },
          select: {
            id: true,
            name: true,
            type: true,
            active: true,
            deletedAt: true,
            walletId: true,
            fulfillmentType: true,
          },
        })
      : [];
    const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));

    return input.map((entry, index) => {
      const product = entry.productId ? productsById.get(entry.productId) : undefined;
      const name = product?.name ?? entry.productName?.trim();
      if (!name) {
        throw new BadRequestException(
          'Item ' + (index + 1) + ': informe um produto do catálogo ou o nome do item',
        );
      }

      const unitPrice = this.money(entry.unitPrice ?? product?.defaultPrice ?? 0);
      if (unitPrice.lte(0)) {
        throw new BadRequestException(
          'Item ' + (index + 1) + ': o valor unitário deve ser maior que zero',
        );
      }

      let supplierSubaccountId: string | null = null;
      let fulfillmentType: FulfillmentType = FulfillmentType.NATIONAL;
      let productType: ProductTypeDto | null = null;

      if (orderKind === OrderKind.PRODUCT) {
        if (!entry.productType) {
          throw new BadRequestException(
            'Item ' + (index + 1) + ' (' + name + '): informe o tipo do produto',
          );
        }
        productType = entry.productType;
        supplierSubaccountId =
          product?.supplierSubaccountId ?? entry.supplierSubaccountId ?? null;

        if (!supplierSubaccountId) {
          throw new BadRequestException(
            'Item ' + (index + 1) + ' (' + name + '): informe o fornecedor',
          );
        }

        const supplier = suppliersById.get(supplierSubaccountId);
        if (!supplier) {
          throw new BadRequestException(
            'Fornecedor do item ' + (index + 1) + ' (' + name + ') não encontrado',
          );
        }
        if (supplier.deletedAt) {
          throw new BadRequestException(
            'O fornecedor "' + supplier.name + '" foi excluído e não pode ser usado',
          );
        }
        if (supplier.type !== 'SUPPLIER') {
          throw new BadRequestException(
            'A subconta "' + supplier.name + '" não está classificada como Fornecedor',
          );
        }
        if (!supplier.active) {
          throw new BadRequestException(
            'O fornecedor "' + supplier.name + '" está inativo',
          );
        }
        if (!supplier.walletId) {
          throw new BadRequestException(
            'Fornecedor "' + supplier.name + '" não possui walletId do Asaas',
          );
        }
        if (!supplier.fulfillmentType) {
          throw new BadRequestException(
            'O fornecedor "' +
              supplier.name +
              '" ainda não possui modalidade Nacional/Internacional configurada. ' +
              'Edite a subconta antes de criar a cobrança.',
          );
        }

        // Fonte de verdade para NOVAS cobranças. Product.fulfillmentType e qualquer
        // fulfillmentType recebido no payload são deliberadamente ignorados.
        fulfillmentType = supplier.fulfillmentType;
      }

      return {
        id: randomUUID(),
        productId: product?.id ?? null,
        productName: name,
        productSku: product?.sku ?? null,
        productType,
        quantity: entry.quantity,
        unitPrice,
        lineTotal: this.money(unitPrice.mul(entry.quantity)),
        supplierSubaccountId,
        // Snapshot histórico: alterações futuras no fornecedor não mudam esta venda.
        fulfillmentType,
      };
    });
  }

  private calculateDiscount(dto: CreateChargeDto, subtotal: Prisma.Decimal) {
    const type = (dto.discountType ?? DiscountTypeDto.NONE) as DiscountType;
    const value = this.money(dto.discountValue ?? 0);

    if (type === DiscountType.NONE) {
      return { type, value: this.money(0), amount: this.money(0) };
    }
    if (value.lte(0)) throw new BadRequestException('Informe um valor de desconto maior que zero');

    let amount: Prisma.Decimal;
    if (type === DiscountType.PERCENTAGE) {
      if (value.gt(100)) throw new BadRequestException('O desconto percentual não pode ser maior que 100%');
      amount = this.percent(subtotal, value);
    } else {
      amount = value;
    }
    if (amount.gt(subtotal)) throw new BadRequestException('O desconto não pode ser maior que o subtotal');
    return { type, value, amount };
  }

  private calculateShipping(dto: CreateChargeDto, orderKind: OrderKind, items: Item[], rules: Rules) {
    const rows: Array<{ type: ShipmentType; amount: Prisma.Decimal; source: QuoteSource }> = [];

    if (orderKind === OrderKind.CONSULTATION) {
      if ((dto.nationalShippingAmount ?? 0) > 0 || (dto.internationalShippingAmount ?? 0) > 0) {
        throw new BadRequestException('Consulta médica não deve possuir frete');
      }
      return { rows, total: this.money(0) };
    }

    const national = items.some((item) => item.fulfillmentType === FulfillmentType.NATIONAL);
    const international = items.some((item) => item.fulfillmentType === FulfillmentType.INTERNATIONAL);

    if (!national && (dto.nationalShippingAmount ?? 0) > 0) {
      throw new BadRequestException('Frete nacional informado, mas o pedido não possui item nacional');
    }
    if (!international && (dto.internationalShippingAmount ?? 0) > 0) {
      throw new BadRequestException('Frete internacional informado, mas o pedido não possui item internacional');
    }

    if (national) {
      rows.push({
        type: ShipmentType.NATIONAL,
        amount: this.money(dto.nationalShippingAmount ?? 0),
        source: QuoteSource.MANUAL,
      });
    }
    if (international) {
      rows.push({
        type: ShipmentType.INTERNATIONAL,
        amount: this.money(dto.internationalShippingAmount ?? rules.internationalShipping),
        source: QuoteSource.FIXED,
      });
    }

    return { rows, total: this.sum(rows.map((row) => row.amount)) };
  }

  private allocateShippingToSuppliers(
    items: Item[],
    rows: Array<{ type: ShipmentType; amount: Prisma.Decimal; source: QuoteSource }>,
  ) {
    const allocations = new Map<string, Prisma.Decimal>();

    for (const row of rows) {
      if (row.amount.lte(0)) continue;

      const fulfillmentType =
        row.type === ShipmentType.INTERNATIONAL
          ? FulfillmentType.INTERNATIONAL
          : FulfillmentType.NATIONAL;

      const supplierBases = new Map<string, Prisma.Decimal>();
      for (const item of items) {
        if (item.fulfillmentType !== fulfillmentType || !item.supplierSubaccountId) continue;
        const current = supplierBases.get(item.supplierSubaccountId) ?? new Prisma.Decimal(0);
        supplierBases.set(item.supplierSubaccountId, current.plus(item.lineTotal));
      }

      if (supplierBases.size === 0) {
        throw new BadRequestException(
          'Há frete ' + fulfillmentType.toLowerCase() + ' sem fornecedor associado aos itens',
        );
      }

      const entries = Array.from(supplierBases.entries());
      const totalBasis = this.sum(entries.map(([, basis]) => basis));
      let allocated = this.money(0);

      entries.forEach(([supplierId, basis], index) => {
        const remaining = this.money(row.amount.minus(allocated));
        const proportional = this.money(row.amount.mul(basis).div(totalBasis));
        const share =
          index === entries.length - 1
            ? remaining
            : proportional.gt(remaining)
              ? remaining
              : proportional;

        allocated = this.money(allocated.plus(share));
        const current = allocations.get(supplierId) ?? new Prisma.Decimal(0);
        allocations.set(supplierId, this.money(current.plus(share)));
      });
    }

    return allocations;
  }

  private buildSplits(
    requested: ChargeSplitRuleDto[] | undefined,
    orderKind: OrderKind,
    items: Item[],
    doctorId: string | null,
    subtotal: Prisma.Decimal,
    rules: Rules,
    shippingBySupplier: Map<string, Prisma.Decimal>,
  ): CalculatedSplit[] {
    const overrides = new Map<string, ChargeSplitRuleDto>();
    for (const rule of requested ?? []) {
      if (overrides.has(rule.subaccountId)) {
        throw new BadRequestException('O mesmo destinatário não pode aparecer duas vezes nos repasses');
      }
      overrides.set(rule.subaccountId, rule);
    }

    const expected = new Map<
      string,
      {
        recipientType: SplitRecipientType;
        basisAmount: Prisma.Decimal;
        defaultPercentage: Prisma.Decimal;
        shippingAmount: Prisma.Decimal;
      }
    >();

    if (orderKind === OrderKind.PRODUCT) {
      const supplierBases = new Map<string, Prisma.Decimal>();
      for (const item of items) {
        if (!item.supplierSubaccountId) continue;
        const current = supplierBases.get(item.supplierSubaccountId) ?? new Prisma.Decimal(0);
        supplierBases.set(item.supplierSubaccountId, current.plus(item.lineTotal));
      }
      for (const [supplierId, basis] of supplierBases.entries()) {
        expected.set(supplierId, {
          recipientType: SplitRecipientType.SUPPLIER,
          basisAmount: this.money(basis),
          defaultPercentage: rules.productSupplier,
          shippingAmount: shippingBySupplier.get(supplierId) ?? this.money(0),
        });
      }
    }

    if (doctorId) {
      expected.set(doctorId, {
        recipientType: SplitRecipientType.DOCTOR,
        basisAmount: subtotal,
        defaultPercentage:
          orderKind === OrderKind.PRODUCT ? rules.productDoctor : rules.consultationDoctor,
        shippingAmount: this.money(0),
      });
    }

    for (const subaccountId of overrides.keys()) {
      if (!expected.has(subaccountId)) {
        throw new BadRequestException(
          'Há um repasse para destinatário que não pertence a esta cobrança: ' + subaccountId,
        );
      }
    }

    return Array.from(expected.entries(), ([subaccountId, config]) => {
      const override = overrides.get(subaccountId);
      const calculationType = override
        ? (override.calculationType as SplitCalculationType)
        : SplitCalculationType.PERCENTAGE;
      const rawValue = override
        ? this.money(override.value)
        : config.defaultPercentage;
      const shippingValue = this.money(config.shippingAmount);

      if (rawValue.lt(0)) {
        throw new BadRequestException('Repasse não pode ser negativo');
      }

      if (calculationType === SplitCalculationType.PERCENTAGE) {
        if (rawValue.gt(100)) {
          throw new BadRequestException('Repasse percentual não pode ser maior que 100%');
        }
        const commercialValue = this.percent(config.basisAmount, rawValue);
        return {
          subaccountId,
          recipientType: config.recipientType,
          calculationType,
          chargeItemId: null,
          percentage: rawValue,
          fixedValue: null,
          basisAmount: config.basisAmount,
          commercialValue,
          shippingValue,
          calculatedValue: this.money(commercialValue.plus(shippingValue)),
        };
      }

      if (rawValue.gt(config.basisAmount)) {
        throw new BadRequestException(
          'Repasse fixo de R$ ' + rawValue.toFixed(2) +
          ' excede a base de R$ ' + config.basisAmount.toFixed(2) +
          ' do destinatário.',
        );
      }

      const commercialValue = rawValue;
      return {
        subaccountId,
        recipientType: config.recipientType,
        calculationType,
        chargeItemId: null,
        percentage: null,
        fixedValue: rawValue,
        basisAmount: config.basisAmount,
        commercialValue,
        shippingValue,
        calculatedValue: this.money(commercialValue.plus(shippingValue)),
      };
    });
  }

  private async upsertCustomer(
    tx: Prisma.TransactionClient,
    data: { name: string; email: string | null; cpfCnpj: string; phone: string | null },
  ) {
    const formatted = this.formatCpfCnpj(data.cpfCnpj);
    const existing = await tx.customer.findFirst({
      where: { cpfCnpj: { in: [data.cpfCnpj, formatted] } },
      orderBy: { updatedAt: 'desc' },
    });

    if (existing) {
      return tx.customer.update({
        where: { id: existing.id },
        data: {
          name: data.name,
          email: data.email ?? undefined,
          phone: data.phone ?? undefined,
        },
      });
    }
    return tx.customer.create({ data });
  }

  private async loadRules(): Promise<Rules> {
    const keys = [
      'product_supplier_percentage',
      'product_doctor_percentage',
      'consultation_doctor_percentage',
      'international_shipping_default',
      'charge_link_expiration_days',
      'checkout_base_url',
    ];
    const settings = await this.prisma.setting.findMany({ where: { key: { in: keys } } });
    const map = new Map(settings.map((setting) => [setting.key, setting.value]));

    const rules: Rules = {
      productSupplier: this.settingPercent(map, 'product_supplier_percentage', 70),
      productDoctor: this.settingPercent(map, 'product_doctor_percentage', 5),
      consultationDoctor: this.settingPercent(map, 'consultation_doctor_percentage', 85),
      internationalShipping: this.money(map.get('international_shipping_default') ?? '150'),
      expirationDays: Number(map.get('charge_link_expiration_days') ?? 7),
      checkoutBaseUrl: map.get('checkout_base_url') ?? 'https://pagar.canfy.com.br',
    };

    // Esses percentuais são somente defaults para uma nova cobrança.
    // A margem da CanFy é sempre o restante depois dos repasses escolhidos.
    if (rules.productSupplier.plus(rules.productDoctor).gt(100)) {
      throw new BadRequestException(
        'Os percentuais padrão de fornecedor + médico não podem exceder 100%',
      );
    }
    if (!Number.isFinite(rules.expirationDays) || rules.expirationDays < 1) {
      throw new BadRequestException('charge_link_expiration_days deve ser maior ou igual a 1');
    }
    return rules;
  }

  private include(): Prisma.ChargeInclude {
    return {
      items: {
        include: {
          supplier: { select: { id: true, name: true, type: true } },
          product: { select: { id: true, name: true, sku: true } },
        },
        orderBy: { createdAt: 'asc' },
      },
      shipments: { orderBy: { createdAt: 'asc' } },
      splits: {
        include: { subaccount: { select: { id: true, name: true, type: true } } },
        orderBy: { createdAt: 'asc' },
      },
      payments: { orderBy: { createdAt: 'desc' }, take: 1 },
      doctor: { select: { id: true, name: true, type: true } },
    };
  }

  private decorate(charge: any, baseUrl: string) {
    let mainAccountValue: Prisma.Decimal;
    const audited = charge.splits.some(
      (split: any) => split.calculatedValue !== null && split.calculatedValue !== undefined,
    );

    if (audited || charge.orderKind) {
      const distributed = this.sum(
        charge.splits.map((split: any) => this.money(split.calculatedValue ?? 0)),
      );
      mainAccountValue = this.money(this.money(charge.totalAmount).minus(distributed));
    } else {
      const value = this.money(charge.value);
      const fixed = this.sum(charge.splits.map((split: any) => this.money(split.fixedValue ?? 0)));
      const percentage = charge.splits.reduce(
        (sum: Prisma.Decimal, split: any) => sum.plus(this.money(split.percentage ?? 0)),
        new Prisma.Decimal(0),
      );
      const percentValue = this.percent(value.minus(fixed), percentage);
      mainAccountValue = this.money(value.minus(fixed).minus(percentValue));
    }

    const total = this.money(charge.totalAmount ?? charge.value);
    return {
      ...charge,
      latestPayment: charge.payments?.[0] ?? null,
      checkoutUrl: charge.orderKind ? this.checkoutUrl(baseUrl, charge.publicToken) : null,
      mainAccountValue,
      mainAccountPercentage: total.gt(0)
        ? Number(mainAccountValue.div(total).mul(100).toDecimalPlaces(2).toString())
        : 0,
    };
  }

  private resolveExpiration(value: string | undefined, days: number) {
    const date = value
      ? /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value + 'T23:59:59.999Z')
        : new Date(value)
      : new Date(Date.now() + days * 86400000);
    if (Number.isNaN(date.getTime()) || date.getTime() <= Date.now()) {
      throw new BadRequestException('A validade do link deve ser uma data futura');
    }
    return date;
  }

  private normalizeCpfCnpj(value: string) {
    const normalized = value.replace(/\D/g, '');
    if (normalized.length !== 11 && normalized.length !== 14) {
      throw new BadRequestException('CPF/CNPJ deve conter 11 ou 14 dígitos');
    }
    return normalized;
  }

  private formatCpfCnpj(value: string) {
    if (value.length === 11) {
      return value.slice(0, 3) + '.' + value.slice(3, 6) + '.' + value.slice(6, 9) + '-' + value.slice(9);
    }
    return value.slice(0, 2) + '.' + value.slice(2, 5) + '.' + value.slice(5, 8) + '/' + value.slice(8, 12) + '-' + value.slice(12);
  }

  private settingPercent(map: Map<string, string>, key: string, fallback: number) {
    const value = new Prisma.Decimal(map.get(key) ?? fallback);
    if (value.lt(0) || value.gt(100)) throw new BadRequestException(key + ' deve estar entre 0 e 100');
    return value;
  }

  private async getCheckoutBaseUrl() {
    const setting = await this.prisma.setting.findUnique({ where: { key: 'checkout_base_url' } });
    return setting?.value ?? 'https://pagar.canfy.com.br';
  }

  private checkoutUrl(base: string, token: string) {
    return base.replace(/\/+$/, '') + '/' + token;
  }

  private percent(base: Prisma.Decimal, percentage: Prisma.Decimal) {
    return this.money(base.mul(percentage).div(100));
  }

  private externalReference(paymentId: string) {
    return 'canfy-payment-' + paymentId;
  }

  private async acquireLock(tx: Prisma.TransactionClient, key: string) {
    await tx.$queryRaw(
      Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))`,
    );
  }

  private money(value: number | string | Prisma.Decimal) {
    return new Prisma.Decimal(value).toDecimalPlaces(2);
  }

  private sum(values: Prisma.Decimal[]) {
    return this.money(values.reduce((sum, value) => sum.plus(value), new Prisma.Decimal(0)));
  }
}
