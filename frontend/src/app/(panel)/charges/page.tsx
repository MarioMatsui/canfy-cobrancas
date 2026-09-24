'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ClipboardCopy, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type OrderKind = 'PRODUCT' | 'CONSULTATION';
type FulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
type ProductType = 'OIL' | 'GUMMY' | 'CAPSULE' | 'CREAM' | 'NASAL_SPRAY';
type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED';
type SplitCalculationType = 'PERCENTAGE' | 'FIXED';
type RecipientType = 'SUPPLIER' | 'DOCTOR';

type Subaccount = {
  id: string;
  name: string;
  type: 'DOCTOR' | 'SUPPLIER' | 'OTHER';
  walletId: string | null;
  fulfillmentType: FulfillmentType | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  defaultPrice: number | string;
  supplierSubaccountId: string | null;
};

type Setting = { key: string; value: string };

type Split = {
  id: string;
  recipientType: 'SUPPLIER' | 'DOCTOR' | 'PLATFORM';
  calculationType: SplitCalculationType;
  percentage: number | string | null;
  fixedValue: number | string | null;
  basisAmount: number | string | null;
  calculatedValue: number | string | null;
  subaccount: { id: string; name: string; type: string };
};

type Charge = {
  id: string;
  orderKind: OrderKind | null;
  customerName: string;
  description: string | null;
  totalAmount: number | string;
  value: number | string;
  shippingAmount: number | string;
  orderStatus: string;
  status: string;
  billingType: string;
  expiresAt: string | null;
  dueDate: string | null;
  maxInstallments: number;
  invoiceUrl: string | null;
  checkoutUrl: string | null;
  mainAccountValue: number | string;
  mainAccountPercentage: number;
  splits: Split[];
  latestPayment: { billingType: string; status: string } | null;
};

type PageResponse = { data: Charge[]; total: number; page: number; totalPages: number };
type ApiErrorBody = { message?: string | string[] };

type Item = {
  productId: string;
  productName: string;
  productType: ProductType | '';
  quantity: number;
  unitPrice: string;
  supplierSubaccountId: string;
};

type SplitDraft = { mode: SplitCalculationType; value: string };
type SplitDraftMap = Record<string, SplitDraft>;

type SplitRow = {
  id: string;
  name: string;
  recipientType: RecipientType;
  basis: number;
  defaultPercentage: number;
  shippingAmount: number;
};

const blankProduct = (): Item => ({
  productId: '',
  productName: '',
  productType: '',
  quantity: 1,
  unitPrice: '',
  supplierSubaccountId: '',
});

const blankConsultation = (): Item => ({
  productId: '',
  productName: 'Consulta médica',
  productType: '',
  quantity: 1,
  unitPrice: '',
  supplierSubaccountId: '',
});

const money = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const date = (value: string | null) => (value ? new Date(value).toLocaleDateString('pt-BR') : '—');

const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const inputNumber = (value: number) => String(Number(value.toFixed(2)));
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const apiErrorMessage = (error: unknown, fallback: string) => {
  const apiError = error as AxiosError<ApiErrorBody>;
  const raw = apiError.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] || fallback;
  return raw || fallback;
};

const statusLabel: Record<string, string> = {
  DRAFT: 'Rascunho',
  READY: 'Pronto',
  PENDING_PAYMENT: 'Aguardando pagamento',
  PAID: 'Pago',
  EXPIRED: 'Expirado',
  CANCELLED: 'Cancelado',
  REFUNDED: 'Estornado',
  PENDING: 'Pendente',
  CONFIRMED: 'Pago',
  RECEIVED: 'Pago',
  OVERDUE: 'Atrasado',
};

const statusClass: Record<string, string> = {
  READY: 'bg-blue-100 text-blue-800',
  PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800',
  PAID: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-orange-100 text-orange-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REFUNDED: 'bg-purple-100 text-purple-800',
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  RECEIVED: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
};

const billingLabel: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão de crédito',
  DEBIT_CARD: 'Cartão de débito',
  UNDEFINED: 'Link / múltiplos',
};

export default function ChargesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [createdLink, setCreatedLink] = useState('');
  const [orderKind, setOrderKind] = useState<OrderKind>('PRODUCT');
  const [customerName, setCustomerName] = useState('');
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [items, setItems] = useState<Item[]>([blankProduct()]);
  const [doctorSubaccountId, setDoctorSubaccountId] = useState('');
  const [splitDrafts, setSplitDrafts] = useState<SplitDraftMap>({});
  const [discountType, setDiscountType] = useState<DiscountType>('NONE');
  const [discountValue, setDiscountValue] = useState('');
  const [nationalShippingAmount, setNationalShippingAmount] = useState('');
  const [internationalShippingAmount, setInternationalShippingAmount] = useState('');
  const [maxInstallments, setMaxInstallments] = useState(1);
  const [expiresAt, setExpiresAt] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');

  const charges = useQuery<PageResponse>({
    queryKey: ['charges', page, search, status],
    queryFn: () =>
      api
        .get('/charges', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            orderStatus: status || undefined,
          },
        })
        .then((response) => response.data),
  });

  const subaccounts = useQuery<{ data: Subaccount[] }>({
    queryKey: ['subaccounts-active'],
    queryFn: () =>
      api
        .get('/subaccounts', { params: { limit: 100, active: true } })
        .then((response) => response.data),
  });

  const productQuery = useQuery<{ data: Product[] }>({
    queryKey: ['products-active'],
    queryFn: () =>
      api
        .get('/products', { params: { limit: 200, active: true } })
        .then((response) => response.data),
  });

  const settingsQuery = useQuery<Setting[]>({
    queryKey: ['settings-charge-form'],
    queryFn: () => api.get('/settings').then((response) => response.data),
  });

  const doctors = useMemo(
    () => subaccounts.data?.data.filter((subaccount) => subaccount.type === 'DOCTOR') ?? [],
    [subaccounts.data],
  );
  const suppliers = useMemo(
    () => subaccounts.data?.data.filter((subaccount) => subaccount.type === 'SUPPLIER') ?? [],
    [subaccounts.data],
  );
  const products = useMemo(() => productQuery.data?.data ?? [], [productQuery.data]);
  const suppliersById = useMemo(
    () => new Map(suppliers.map((supplier) => [supplier.id, supplier])),
    [suppliers],
  );

  const itemFulfillment = (item: Item): FulfillmentType | null =>
    suppliersById.get(item.supplierSubaccountId)?.fulfillmentType ?? null;

  const setting = (key: string, fallback: number) => {
    const parsed = Number(settingsQuery.data?.find((entry) => entry.key === key)?.value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const supplierDefaultPct = setting('product_supplier_percentage', 70);
  const productDoctorDefaultPct = setting('product_doctor_percentage', 5);
  const consultationDoctorDefaultPct = setting('consultation_doctor_percentage', 85);

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) => sum + (Number(item.unitPrice) || 0) * item.quantity,
        0,
      ),
    [items],
  );

  const hasNational =
    orderKind === 'PRODUCT' && items.some((item) => itemFulfillment(item) === 'NATIONAL');
  const hasInternational =
    orderKind === 'PRODUCT' && items.some((item) => itemFulfillment(item) === 'INTERNATIONAL');

  const nationalShipping =
    hasNational ? Number(nationalShippingAmount) || 0 : 0;
  const internationalShipping =
    hasInternational
      ? Number(internationalShippingAmount) || setting('international_shipping_default', 150)
      : 0;
  const shipping = roundMoney(nationalShipping + internationalShipping);

  // O frete pertence integralmente aos fornecedores. Quando a mesma modalidade
  // de envio envolve mais de um fornecedor, o valor é rateado proporcionalmente
  // ao subtotal dos itens de cada fornecedor nessa modalidade.
  const shippingBySupplier = new Map<string, number>();
  const allocateShipping = (fulfillmentType: FulfillmentType, amount: number) => {
    if (amount <= 0) return;

    const bases = new Map<string, number>();
    items.forEach((item) => {
      if (itemFulfillment(item) !== fulfillmentType || !item.supplierSubaccountId) return;
      const lineTotal = (Number(item.unitPrice) || 0) * item.quantity;
      bases.set(
        item.supplierSubaccountId,
        (bases.get(item.supplierSubaccountId) || 0) + lineTotal,
      );
    });

    const entries = Array.from(bases.entries());
    const totalBasis = entries.reduce((sum, [, basis]) => sum + basis, 0);
    if (entries.length === 0 || totalBasis <= 0) return;

    let allocated = 0;
    entries.forEach(([supplierId, basis], index) => {
      const remaining = roundMoney(amount - allocated);
      const proportional = roundMoney((amount * basis) / totalBasis);
      const share =
        index === entries.length - 1 ? remaining : Math.min(proportional, remaining);

      allocated = roundMoney(allocated + share);
      shippingBySupplier.set(
        supplierId,
        roundMoney((shippingBySupplier.get(supplierId) || 0) + share),
      );
    });
  };

  allocateShipping('NATIONAL', nationalShipping);
  allocateShipping('INTERNATIONAL', internationalShipping);

  const splitRows: SplitRow[] = [];
  if (orderKind === 'PRODUCT') {
    const supplierBases = new Map<string, number>();
    items.forEach((item) => {
      if (!item.supplierSubaccountId) return;
      const lineTotal = (Number(item.unitPrice) || 0) * item.quantity;
      supplierBases.set(
        item.supplierSubaccountId,
        (supplierBases.get(item.supplierSubaccountId) || 0) + lineTotal,
      );
    });

    Array.from(supplierBases.entries()).forEach(([id, basis]) => {
      splitRows.push({
        id,
        name: suppliers.find((supplier) => supplier.id === id)?.name || 'Fornecedor',
        recipientType: 'SUPPLIER',
        basis,
        defaultPercentage: supplierDefaultPct,
        shippingAmount: shippingBySupplier.get(id) || 0,
      });
    });
  }

  if (doctorSubaccountId) {
    splitRows.push({
      id: doctorSubaccountId,
      name: doctors.find((doctor) => doctor.id === doctorSubaccountId)?.name || 'Médico',
      recipientType: 'DOCTOR',
      basis: subtotal,
      defaultPercentage:
        orderKind === 'PRODUCT' ? productDoctorDefaultPct : consultationDoctorDefaultPct,
      shippingAmount: 0,
    });
  }

  const computedSplits = splitRows.map((row) => {
    const draft = splitDrafts[row.id] ?? {
      mode: 'PERCENTAGE' as const,
      value: String(row.defaultPercentage),
    };
    const rawValue = Number(draft.value) || 0;
    const commercialValue = roundMoney(
      draft.mode === 'PERCENTAGE' ? (row.basis * rawValue) / 100 : rawValue,
    );
    const shippingValue = row.recipientType === 'SUPPLIER' ? row.shippingAmount : 0;
    const calculatedValue = roundMoney(commercialValue + shippingValue);
    return { ...row, draft, rawValue, commercialValue, shippingValue, calculatedValue };
  });

  const commercialDistributed = roundMoney(
    computedSplits.reduce((sum, split) => sum + split.commercialValue, 0),
  );
  const distributed = roundMoney(
    computedSplits.reduce((sum, split) => sum + split.calculatedValue, 0),
  );
  const platformMarginBeforeDiscount = roundMoney(subtotal - commercialDistributed);
  const maxDiscountWithoutReducingSplits = Math.max(0, platformMarginBeforeDiscount);

  const discountRaw = Number(discountValue) || 0;
  const discountAmount = roundMoney(
    discountType === 'PERCENTAGE'
      ? (subtotal * discountRaw) / 100
      : discountType === 'FIXED'
        ? discountRaw
        : 0,
  );

  const total = roundMoney(subtotal - discountAmount + shipping);
  const mainValue = roundMoney(total - distributed);

  const reset = () => {
    setShowForm(false);
    setOrderKind('PRODUCT');
    setCustomerName('');
    setCustomerCpfCnpj('');
    setCustomerEmail('');
    setCustomerPhone('');
    setItems([blankProduct()]);
    setDoctorSubaccountId('');
    setSplitDrafts({});
    setDiscountType('NONE');
    setDiscountValue('');
    setNationalShippingAmount('');
    setInternationalShippingAmount('');
    setMaxInstallments(1);
    setExpiresAt('');
    setDescription('');
    setNotes('');
  };

  const changeKind = (kind: OrderKind) => {
    setOrderKind(kind);
    setItems([kind === 'PRODUCT' ? blankProduct() : blankConsultation()]);
    setSplitDrafts({});
    setDiscountType('NONE');
    setDiscountValue('');
    setNationalShippingAmount('');
    setInternationalShippingAmount('');
  };

  const updateItem = (index: number, patch: Partial<Item>) => {
    setItems((list) =>
      list.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    );
  };

  const selectProduct = (index: number, id: string) => {
    if (!id) {
      updateItem(index, {
        productId: '',
        productName: '',
        unitPrice: '',
        supplierSubaccountId: '',
      });
      return;
    }

    const product = products.find((entry) => entry.id === id);
    if (!product) return;

    updateItem(index, {
      productId: product.id,
      productName: product.name,
      unitPrice: String(product.defaultPrice),
      supplierSubaccountId: product.supplierSubaccountId || '',
    });
  };

  const getSplitDraft = (row: SplitRow): SplitDraft =>
    splitDrafts[row.id] ?? {
      mode: 'PERCENTAGE',
      value: String(row.defaultPercentage),
    };

  const updateSplitDraft = (row: SplitRow, patch: Partial<SplitDraft>) => {
    setSplitDrafts((current) => ({
      ...current,
      [row.id]: {
        ...(current[row.id] ?? {
          mode: 'PERCENTAGE',
          value: String(row.defaultPercentage),
        }),
        ...patch,
      },
    }));
  };

  const changeSplitMode = (row: SplitRow, mode: SplitCalculationType) => {
    const current = getSplitDraft(row);
    if (current.mode === mode) return;

    const rawValue = Number(current.value) || 0;
    const currentPayout =
      current.mode === 'PERCENTAGE' ? (row.basis * rawValue) / 100 : rawValue;
    const nextValue =
      mode === 'PERCENTAGE'
        ? row.basis > 0
          ? (currentPayout / row.basis) * 100
          : 0
        : currentPayout;

    updateSplitDraft(row, { mode, value: inputNumber(nextValue) });
  };

  const copy = async (value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success('Link copiado');
    } catch {
      toast.error('Não foi possível copiar automaticamente');
    }
  };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/charges', payload),
    onSuccess: (response) => {
      setCreatedLink(response.data.checkoutUrl || '');
      toast.success('Pedido criado sem criar pagamento no Asaas');
      reset();
      queryClient.invalidateQueries({ queryKey: ['charges'] });
    },
    onError: (error: unknown) => {
      toast.error(apiErrorMessage(error, 'Erro ao criar pedido'));
    },
  });

  const submit = () => {
    const cpf = customerCpfCnpj.replace(/\D/g, '');

    if (!customerName.trim() || (cpf.length !== 11 && cpf.length !== 14)) {
      toast.error('Preencha nome e um CPF/CNPJ válido');
      return;
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      toast.error('Email inválido');
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      const item = items[index];
      if (!item.productId && !item.productName.trim()) {
        toast.error('Informe o item ' + (index + 1));
        return;
      }
      if ((Number(item.unitPrice) || 0) <= 0 || item.quantity < 1) {
        toast.error('Valor ou quantidade inválidos no item ' + (index + 1));
        return;
      }
      if (orderKind === 'PRODUCT' && !item.productType) {
        toast.error('Selecione o tipo de produto do item ' + (index + 1));
        return;
      }
      if (orderKind === 'PRODUCT' && !item.supplierSubaccountId) {
        toast.error('Selecione o fornecedor do item ' + (index + 1));
        return;
      }
      if (orderKind === 'PRODUCT') {
        const supplier = suppliersById.get(item.supplierSubaccountId);
        if (!supplier) {
          toast.error('O fornecedor do item ' + (index + 1) + ' não está disponível');
          return;
        }
        if (!supplier.fulfillmentType) {
          toast.error(
            'O fornecedor "' +
              supplier.name +
              '" ainda não possui modalidade Nacional/Internacional configurada. ' +
              'Edite a subconta antes de criar a cobrança.',
          );
          return;
        }
      }
    }

    for (const split of computedSplits) {
      if (!Number.isFinite(split.rawValue) || split.rawValue < 0) {
        toast.error('Repasse inválido para ' + split.name);
        return;
      }
      if (split.draft.mode === 'PERCENTAGE' && split.rawValue > 100) {
        toast.error('O repasse percentual de ' + split.name + ' não pode passar de 100%');
        return;
      }
      if (split.commercialValue > split.basis + 0.005) {
        toast.error(
          'O repasse de ' + split.name + ' não pode ultrapassar sua base de ' + money(split.basis),
        );
        return;
      }
    }

    if (commercialDistributed > subtotal + 0.005) {
      toast.error('A soma dos repasses comerciais não pode ultrapassar o subtotal');
      return;
    }
    if (discountType !== 'NONE' && discountRaw <= 0) {
      toast.error('Informe o desconto');
      return;
    }
    if (discountType === 'PERCENTAGE' && discountRaw > 100) {
      toast.error('Desconto percentual inválido');
      return;
    }
    if (discountAmount > maxDiscountWithoutReducingSplits + 0.005) {
      toast.error(
        'O desconto máximo sem reduzir os repasses desta cobrança é ' +
          money(maxDiscountWithoutReducingSplits),
      );
      return;
    }
    if (total <= 0 || mainValue < -0.005) {
      toast.error('Revise os valores: o pedido deixou a conta principal com valor inválido');
      return;
    }

    create.mutate({
      orderKind,
      customerName: customerName.trim(),
      customerCpfCnpj: cpf,
      customerEmail: customerEmail.trim() || undefined,
      customerPhone: customerPhone.trim() || undefined,
      items: items.map((item) => ({
        productId: item.productId || undefined,
        productName: item.productId ? undefined : item.productName.trim(),
        quantity: item.quantity,
        unitPrice: Number(item.unitPrice),
        productType: orderKind === 'PRODUCT' ? item.productType : undefined,
        supplierSubaccountId:
          orderKind === 'PRODUCT' ? item.supplierSubaccountId : undefined,
      })),
      splits: computedSplits.map((split) => ({
        subaccountId: split.id,
        calculationType: split.draft.mode,
        value: split.rawValue,
      })),
      doctorSubaccountId: doctorSubaccountId || undefined,
      discountType,
      discountValue: discountType === 'NONE' ? 0 : discountRaw,
      nationalShippingAmount: hasNational ? Number(nationalShippingAmount) || 0 : undefined,
      internationalShippingAmount: hasInternational
        ? Number(internationalShippingAmount) || setting('international_shipping_default', 150)
        : undefined,
      maxInstallments,
      expiresAt: expiresAt || undefined,
      description: description.trim() || undefined,
      notes: notes.trim() || undefined,
    });
  };

  const cancel = async (id: string) => {
    try {
      await api.delete('/charges/' + id);
      toast.success('Cobrança cancelada');
      charges.refetch();
    } catch (error: unknown) {
      toast.error(apiErrorMessage(error, 'Erro ao cancelar'));
    }
  };

  const groupedSplits = (charge: Charge) => {
    const grouped = new Map<
      string,
      { id: string; name: string; type: string; value: number; rules: string[] }
    >();

    charge.splits
      .filter((split) => split.calculatedValue != null)
      .forEach((split) => {
        const rule =
          split.calculationType === 'FIXED'
            ? money(split.fixedValue) + ' fixo'
            : Number(split.percentage || 0) + '%';
        const current = grouped.get(split.subaccount.id);

        if (current) {
          current.value += Number(split.calculatedValue || 0);
          if (!current.rules.includes(rule)) current.rules.push(rule);
          return;
        }

        grouped.set(split.subaccount.id, {
          id: split.subaccount.id,
          name: split.subaccount.name,
          type: split.subaccount.type,
          value: Number(split.calculatedValue || 0),
          rules: [rule],
        });
      });

    return Array.from(grouped.values());
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranças</h1>
          <p className="text-gray-500 mt-1">
            Pedidos com link CanFy; o pagamento nasce somente no checkout
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((visible) => !visible);
            if (!expiresAt) {
              setExpiresAt(futureDate(setting('charge_link_expiration_days', 7)));
            }
          }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"
        >
          <Plus size={20} />
          Nova Cobrança
        </button>
      </div>

      {createdLink && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex justify-between gap-3 items-center">
          <div className="min-w-0">
            <div className="font-semibold text-green-900">Link criado</div>
            <div className="text-sm text-green-800 break-all">{createdLink}</div>
          </div>
          <button
            onClick={() => copy(createdLink)}
            className="shrink-0 flex items-center gap-2 border rounded-lg bg-white px-3 py-2 text-sm"
          >
            <ClipboardCopy size={16} />
            Copiar
          </button>
        </div>
      )}

      {showForm && (
        <div className="bg-white rounded-xl border p-6 space-y-6">
          <div className="flex justify-between">
            <div>
              <h2 className="text-lg font-semibold">Nova Cobrança</h2>
              <p className="text-sm text-gray-500">
                Cria o pedido e trava os valores/repasses antes do checkout.
              </p>
            </div>
            <button onClick={reset}>
              <X size={20} />
            </button>
          </div>

          <div className="inline-flex border rounded-lg overflow-hidden">
            <button
              onClick={() => changeKind('PRODUCT')}
              className={
                'px-4 py-2 text-sm ' +
                (orderKind === 'PRODUCT' ? 'bg-blue-600 text-white' : '')
              }
            >
              Produto
            </button>
            <button
              onClick={() => changeKind('CONSULTATION')}
              className={
                'px-4 py-2 text-sm ' +
                (orderKind === 'CONSULTATION' ? 'bg-blue-600 text-white' : '')
              }
            >
              Consulta
            </button>
          </div>

          <section className="border-t pt-5">
            <h3 className="font-semibold mb-3">Cliente</h3>
            <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="Nome *"
                value={customerName}
                onChange={(event) => setCustomerName(event.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="CPF/CNPJ *"
                value={customerCpfCnpj}
                onChange={(event) => setCustomerCpfCnpj(event.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="Email"
                value={customerEmail}
                onChange={(event) => setCustomerEmail(event.target.value)}
              />
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                placeholder="Telefone"
                value={customerPhone}
                onChange={(event) => setCustomerPhone(event.target.value)}
              />
            </div>
          </section>

          <section className="border-t pt-5 space-y-3">
            <div className="flex justify-between">
              <div>
                <h3 className="font-semibold">Itens</h3>
                <p className="text-xs text-gray-500">O total é calculado pelos itens.</p>
              </div>
              <button
                onClick={() =>
                  setItems((list) => [
                    ...list,
                    orderKind === 'PRODUCT' ? blankProduct() : blankConsultation(),
                  ])
                }
                className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm"
              >
                + Item
              </button>
            </div>

            {items.map((item, index) => {
              const catalog = products.find((product) => product.id === item.productId);
              return (
                <div key={index} className="border rounded-xl bg-gray-50 p-4 space-y-3">
                  <div className="flex justify-between">
                    <strong className="text-sm">Item {index + 1}</strong>
                    {items.length > 1 && (
                      <button
                        onClick={() =>
                          setItems((list) => list.filter((_, itemIndex) => itemIndex !== index))
                        }
                        className="text-red-500"
                      >
                        <Trash2 size={17} />
                      </button>
                    )}
                  </div>

                  {orderKind === 'PRODUCT' && (
                    <select
                      className="w-full border rounded-lg px-3 py-2 text-sm bg-white"
                      value={item.productId}
                      onChange={(event) => selectProduct(index, event.target.value)}
                    >
                      <option value="">Item avulso / manual</option>
                      {products.map((product) => (
                        <option key={product.id} value={product.id}>
                          {product.name}
                          {product.sku ? ' — ' + product.sku : ''}
                        </option>
                      ))}
                    </select>
                  )}

                  <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
                    <input
                      className="border rounded-lg px-3 py-2 text-sm xl:col-span-2"
                      placeholder="Nome *"
                      disabled={Boolean(catalog)}
                      value={item.productName}
                      onChange={(event) =>
                        updateItem(index, { productName: event.target.value })
                      }
                    />
                    <input
                      className="border rounded-lg px-3 py-2 text-sm"
                      type="number"
                      min={1}
                      value={item.quantity}
                      onChange={(event) =>
                        updateItem(index, {
                          quantity: Math.max(1, Number(event.target.value) || 1),
                        })
                      }
                    />
                    <input
                      className="border rounded-lg px-3 py-2 text-sm"
                      type="number"
                      min="0.01"
                      step="0.01"
                      placeholder="Valor unitário *"
                      value={item.unitPrice}
                      onChange={(event) =>
                        updateItem(index, { unitPrice: event.target.value })
                      }
                    />
                    {orderKind === 'PRODUCT' && (
                      <>
                        <select
                          className="border rounded-lg px-3 py-2 text-sm bg-white"
                          value={item.productType}
                          onChange={(event) =>
                            updateItem(index, {
                              productType: event.target.value as ProductType | '',
                            })
                          }
                        >
                          <option value="">Tipo de produto *</option>
                          <option value="OIL">Óleo</option>
                          <option value="GUMMY">Gummy</option>
                          <option value="CAPSULE">Cápsula</option>
                          <option value="CREAM">Creme</option>
                          <option value="NASAL_SPRAY">Spray nasal</option>
                        </select>
                        <select
                          className="border rounded-lg px-3 py-2 text-sm"
                          disabled={Boolean(catalog?.supplierSubaccountId)}
                          value={item.supplierSubaccountId}
                          onChange={(event) =>
                            updateItem(index, { supplierSubaccountId: event.target.value })
                          }
                        >
                          <option value="">Fornecedor *</option>
                          {suppliers.map((supplier) => (
                            <option key={supplier.id} value={supplier.id}>
                              {supplier.name}
                              {!supplier.fulfillmentType ? ' — modalidade pendente' : ''}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>

                  <div className="text-right text-sm">
                    Total do item:{' '}
                    <strong>{money((Number(item.unitPrice) || 0) * item.quantity)}</strong>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="border-t pt-5 grid md:grid-cols-3 gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={doctorSubaccountId}
              onChange={(event) => setDoctorSubaccountId(event.target.value)}
            >
              <option value="">Sem médico (sem split)</option>
              {doctors.map((doctor) => (
                <option key={doctor.id} value={doctor.id}>
                  {doctor.name}
                </option>
              ))}
            </select>
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={maxInstallments}
              onChange={(event) => setMaxInstallments(Number(event.target.value))}
            >
              {Array.from({ length: 24 }, (_, index) => index + 1).map((installments) => (
                <option key={installments} value={installments}>
                  até {installments}x
                </option>
              ))}
            </select>
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              type="date"
              min={futureDate(1)}
              value={expiresAt}
              onChange={(event) => setExpiresAt(event.target.value)}
            />
          </section>

          <section className="border-t pt-5 space-y-3">
            <div>
              <h3 className="font-semibold">Repasses desta cobrança</h3>
              <p className="text-xs text-gray-500 mt-1">
                Ajuste cada destinatário em % ou R$. Os percentuais de fornecedor usam
                apenas os itens daquele fornecedor; o médico usa o subtotal e é opcional.
                O frete é somado integralmente ao repasse do(s) fornecedor(es).
              </p>
            </div>

            {splitRows.length === 0 ? (
              <div className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">
                {orderKind === 'PRODUCT'
                  ? 'Selecione o fornecedor obrigatório do(s) item(ns). O médico é opcional.'
                  : 'Médico opcional. Sem seleção, não haverá split médico.'}
              </div>
            ) : (
              <div className="space-y-2">
                {splitRows.map((row) => {
                  const draft = getSplitDraft(row);
                  const current = computedSplits.find((split) => split.id === row.id);
                  return (
                    <div
                      key={row.id}
                      className="grid lg:grid-cols-[minmax(220px,1fr)_150px_160px_180px] gap-3 items-center rounded-xl border bg-gray-50 p-3"
                    >
                      <div>
                        <div
                          className={
                            'font-medium text-sm ' +
                            (row.recipientType === 'DOCTOR'
                              ? 'text-blue-700'
                              : 'text-orange-700')
                          }
                        >
                          {row.name}
                        </div>
                        <div className="text-xs text-gray-500">
                          {row.recipientType === 'DOCTOR' ? 'Médico' : 'Fornecedor'} · base{' '}
                          {money(row.basis)}
                          {row.shippingAmount > 0 ? ' · frete ' + money(row.shippingAmount) : ''}
                        </div>
                      </div>

                      <div className="flex rounded-lg border overflow-hidden bg-white">
                        <button
                          type="button"
                          onClick={() => changeSplitMode(row, 'PERCENTAGE')}
                          className={
                            'flex-1 px-3 py-2 text-sm ' +
                            (draft.mode === 'PERCENTAGE'
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600')
                          }
                        >
                          %
                        </button>
                        <button
                          type="button"
                          onClick={() => changeSplitMode(row, 'FIXED')}
                          className={
                            'flex-1 px-3 py-2 text-sm ' +
                            (draft.mode === 'FIXED'
                              ? 'bg-blue-600 text-white'
                              : 'text-gray-600')
                          }
                        >
                          R$
                        </button>
                      </div>

                      <div className="relative">
                        <input
                          className="w-full border rounded-lg px-3 py-2 pr-9 text-sm bg-white"
                          type="number"
                          min="0"
                          max={draft.mode === 'PERCENTAGE' ? 100 : undefined}
                          step="0.01"
                          value={draft.value}
                          onChange={(event) =>
                            updateSplitDraft(row, { value: event.target.value })
                          }
                        />
                        <span className="absolute right-3 top-2 text-sm text-gray-400">
                          {draft.mode === 'PERCENTAGE' ? '%' : 'R$'}
                        </span>
                      </div>

                      <div className="text-sm lg:text-right">
                        Repasse:{' '}
                        <strong
                          className={
                            row.recipientType === 'DOCTOR'
                              ? 'text-blue-700'
                              : 'text-orange-700'
                          }
                        >
                          {money(current?.calculatedValue || 0)}
                        </strong>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="border-t pt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-3">
            <select
              className="border rounded-lg px-3 py-2 text-sm"
              value={discountType}
              onChange={(event) => setDiscountType(event.target.value as DiscountType)}
            >
              <option value="NONE">Sem desconto</option>
              <option value="PERCENTAGE">Desconto %</option>
              <option value="FIXED">Desconto R$</option>
            </select>

            <div>
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                disabled={discountType === 'NONE'}
                type="number"
                min="0"
                step="0.01"
                value={discountValue}
                onChange={(event) => setDiscountValue(event.target.value)}
                placeholder="Desconto"
              />
              <p className="text-xs text-gray-500 mt-1">
                Máx. sem reduzir repasses: {money(maxDiscountWithoutReducingSplits)}
              </p>
            </div>

            {hasNational && (
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={nationalShippingAmount}
                onChange={(event) => setNationalShippingAmount(event.target.value)}
                placeholder="Frete nacional R$"
              />
            )}

            {hasInternational && (
              <input
                className="border rounded-lg px-3 py-2 text-sm"
                type="number"
                min="0"
                step="0.01"
                value={internationalShippingAmount}
                onChange={(event) => setInternationalShippingAmount(event.target.value)}
                placeholder={
                  'Frete internacional (padrão ' +
                  money(setting('international_shipping_default', 150)) +
                  ')'
                }
              />
            )}
          </section>

          <section className="border-t pt-5 grid md:grid-cols-2 gap-3">
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Descrição"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            <input
              className="border rounded-lg px-3 py-2 text-sm"
              placeholder="Observações internas"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </section>

          <section className="border-t pt-5">
            <h3 className="font-semibold mb-3">Resumo</h3>
            <div className="bg-gray-50 rounded-xl p-4 grid lg:grid-cols-2 gap-5 text-sm">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div className="flex justify-between text-red-600">
                  <span>Desconto</span>
                  <strong>- {money(discountAmount)}</strong>
                </div>
                <div className="flex justify-between">
                  <span>Frete</span>
                  <strong>{money(shipping)}</strong>
                </div>
                <div className="flex justify-between border-t pt-2 text-base">
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
              </div>

              <div className="space-y-2">
                {computedSplits.map((split) => (
                  <div
                    key={split.id}
                    className={
                      'flex justify-between ' +
                      (split.recipientType === 'DOCTOR'
                        ? 'text-blue-700'
                        : 'text-orange-700')
                    }
                  >
                    <span>
                      {split.name} (
                      {split.draft.mode === 'PERCENTAGE'
                        ? inputNumber(split.rawValue) + '%'
                        : money(split.rawValue) + ' fixo'}
                      )
                      {split.shippingValue > 0
                        ? ' + ' + money(split.shippingValue) + ' frete'
                        : ''}
                    </span>
                    <strong>{money(split.calculatedValue)}</strong>
                  </div>
                ))}
                <div
                  className={
                    'flex justify-between border-t pt-2 ' +
                    (mainValue < -0.005 ? 'text-red-700' : 'text-green-700')
                  }
                >
                  <span>CanFy / conta principal</span>
                  <strong>{money(mainValue)}</strong>
                </div>
                <p className="text-xs text-gray-500">
                  O frete vai integralmente ao(s) fornecedor(es). Se houver mais de um
                  fornecedor na mesma modalidade de envio, ele é rateado pelo valor dos
                  itens. O desconto reduz apenas a margem da CanFy.
                </p>
              </div>
            </div>
          </section>

          <div className="flex justify-end gap-3">
            <button onClick={reset} className="px-4 py-2">
              Cancelar
            </button>
            <button
              onClick={submit}
              disabled={create.isPending}
              className="bg-blue-600 text-white rounded-lg px-6 py-2 disabled:opacity-50"
            >
              {create.isPending ? 'Criando...' : 'Criar pedido e link'}
            </button>
          </div>
        </div>
      )}

      <div className="flex gap-3 flex-col md:flex-row">
        <input
          className="border rounded-lg px-3 py-2 text-sm md:w-80"
          placeholder="Buscar cliente ou CPF/CNPJ"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(1);
          }}
        />
        <select
          className="border rounded-lg px-3 py-2 text-sm"
          value={status}
          onChange={(event) => {
            setStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">Todos os status</option>
          <option value="READY">Pronto</option>
          <option value="PENDING_PAYMENT">Aguardando pagamento</option>
          <option value="PAID">Pago</option>
          <option value="EXPIRED">Expirado</option>
          <option value="CANCELLED">Cancelado</option>
          <option value="REFUNDED">Estornado</option>
        </select>
      </div>

      <div className="bg-white rounded-xl border overflow-x-auto">
        <table className="w-full min-w-[1050px]">
          <thead className="bg-gray-50 border-b">
            <tr>
              {[
                'Tipo',
                'Cliente',
                'Valor',
                'Pagamento',
                'Validade / venc.',
                'Splits',
                'Status',
                'Ações',
              ].map((heading) => (
                <th
                  key={heading}
                  className="text-left px-4 py-3 text-sm font-medium text-gray-500"
                >
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y">
            {charges.isLoading ? (
              <tr>
                <td colSpan={8} className="text-center py-8">
                  Carregando...
                </td>
              </tr>
            ) : charges.data?.data.length === 0 ? (
              <tr>
                <td colSpan={8} className="text-center py-8">
                  Nenhuma cobrança
                </td>
              </tr>
            ) : (
              charges.data?.data.map((charge) => {
                const newSplits = groupedSplits(charge);
                const displayStatus = charge.orderStatus || charge.status;
                const paymentType = charge.latestPayment?.billingType || charge.billingType;
                const canCancel =
                  ['READY', 'PENDING_PAYMENT'].includes(displayStatus) ||
                  (!charge.orderKind && ['PENDING', 'OVERDUE'].includes(charge.status));

                return (
                  <tr key={charge.id} className="align-top hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span
                        className={
                          'text-xs rounded-full px-2 py-1 ' +
                          (charge.orderKind === 'PRODUCT'
                            ? 'bg-emerald-100 text-emerald-800'
                            : charge.orderKind === 'CONSULTATION'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100')
                        }
                      >
                        {charge.orderKind === 'PRODUCT'
                          ? 'Produto'
                          : charge.orderKind === 'CONSULTATION'
                            ? 'Consulta'
                            : 'Legado'}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium text-sm">{charge.customerName}</div>
                      <div className="text-xs text-gray-400 max-w-[220px] truncate">
                        {charge.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-semibold text-sm">
                      {money(charge.totalAmount ?? charge.value)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {charge.orderKind && !charge.latestPayment
                        ? 'Checkout CanFy'
                        : billingLabel[paymentType] || paymentType || '—'}
                      {charge.maxInstallments > 1 && (
                        <div className="text-xs">até {charge.maxInstallments}x</div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      {date(charge.orderKind ? charge.expiresAt : charge.dueDate)}
                    </td>
                    <td className="px-4 py-3 text-xs min-w-[230px]">
                      {newSplits.length ? (
                        <>
                          {newSplits.map((split) => (
                            <div
                              key={split.id}
                              className={
                                split.type === 'DOCTOR'
                                  ? 'text-blue-600'
                                  : 'text-orange-600'
                              }
                            >
                              {split.name}: {split.rules.join(' + ')} → {money(split.value)}
                            </div>
                          ))}
                          <div className="text-green-700 font-medium">
                            Principal: {money(charge.mainAccountValue)}
                          </div>
                        </>
                      ) : charge.splits.length ? (
                        <>
                          {charge.splits.map((split) => (
                            <div key={split.id}>
                              {split.subaccount.name}:{' '}
                              {split.fixedValue != null
                                ? money(split.fixedValue)
                                : Number(split.percentage || 0) + '%'}
                            </div>
                          ))}
                          <div className="text-green-700">
                            Principal: {charge.mainAccountPercentage}%
                          </div>
                        </>
                      ) : (
                        <div className="text-green-700">100% Conta Principal</div>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          'text-xs rounded-full px-2 py-1 ' +
                          (statusClass[displayStatus] || 'bg-gray-100')
                        }
                      >
                        {statusLabel[displayStatus] || displayStatus}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      <div className="flex flex-wrap gap-2">
                        {charge.checkoutUrl && (
                          <button
                            onClick={() => copy(charge.checkoutUrl!)}
                            className="text-blue-600"
                          >
                            Copiar link
                          </button>
                        )}
                        {!charge.orderKind && charge.invoiceUrl && (
                          <a
                            href={charge.invoiceUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="text-blue-500"
                          >
                            Link Asaas
                          </a>
                        )}
                        {canCancel && (
                          <button
                            onClick={() => cancel(charge.id)}
                            className="text-red-500"
                          >
                            Cancelar
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {charges.data && charges.data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: charges.data.totalPages }, (_, index) => index + 1).map(
            (pageNumber) => (
              <button
                key={pageNumber}
                onClick={() => setPage(pageNumber)}
                className={
                  'px-3 py-1 rounded-lg text-sm ' +
                  (pageNumber === page ? 'bg-blue-600 text-white' : 'bg-gray-100')
                }
              >
                {pageNumber}
              </button>
            ),
          )}
        </div>
      )}
    </div>
  );
}
