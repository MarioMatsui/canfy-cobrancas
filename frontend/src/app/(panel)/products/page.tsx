'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Package,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/auth';

type ProductType = 'OIL' | 'GUMMY' | 'CAPSULE' | 'CREAM' | 'NASAL_SPRAY';
type FulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
type ProductStatus = 'ACTIVE' | 'INACTIVE' | 'PENDING';
type ProductPriceCurrency = 'BRL' | 'USD';

type Supplier = {
  id: string;
  name: string;
  type: 'SUPPLIER' | 'DOCTOR' | 'OTHER';
  active: boolean;
  deletedAt?: string | null;
  walletId: string | null;
  fulfillmentType: FulfillmentType | null;
};

type Product = {
  id: string;
  name: string;
  sku: string | null;
  description: string | null;
  productType: ProductType | null;
  supplierSubaccountId: string | null;
  defaultPrice: number | string;
  priceCurrency: ProductPriceCurrency;
  priceBrl: string | null;
  exchangeRate: string | null;
  exchangeRateQuotedAt: string | null;
  weightKg: number | string | null;
  heightCm: number | string | null;
  widthCm: number | string | null;
  lengthCm: number | string | null;
  active: boolean;
  eligible: boolean;
  eligibilityIssues: string[];
  supplier: Supplier | null;
};

type PageResponse = {
  data: Product[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};

type SupplierResponse = { data: Supplier[] };
type ExchangeRateResponse = {
  pair: 'USD-BRL';
  rate: string;
  quotedAt: string;
  source: 'AWESOME_API';
};
type ApiErrorBody = { message?: string | string[] };

type FormState = {
  name: string;
  sku: string;
  description: string;
  productType: ProductType | '';
  supplierSubaccountId: string;
  defaultPrice: string;
  weightKg: string;
  heightCm: string;
  widthCm: string;
  lengthCm: string;
  active: boolean;
};

const emptyForm = (): FormState => ({
  name: '',
  sku: '',
  description: '',
  productType: '',
  supplierSubaccountId: '',
  defaultPrice: '',
  weightKg: '',
  heightCm: '',
  widthCm: '',
  lengthCm: '',
  active: true,
});

const productTypeLabel: Record<ProductType, string> = {
  OIL: 'Óleo',
  GUMMY: 'Goma',
  CAPSULE: 'Cápsula',
  CREAM: 'Creme',
  NASAL_SPRAY: 'Spray nasal',
};

const money = (value: unknown) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

const usd = (value: unknown) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(value || 0));

const apiErrorMessage = (error: unknown, fallback: string) => {
  const raw = (error as AxiosError<ApiErrorBody>).response?.data?.message;
  return Array.isArray(raw) ? raw[0] || fallback : raw || fallback;
};

export default function ProductsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, isAdmin } = useAuth();

  const [page, setPage] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [productType, setProductType] = useState<ProductType | ''>('');
  const [status, setStatus] = useState<ProductStatus | ''>('');
  const [editing, setEditing] = useState<Product | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [openActions, setOpenActions] = useState<string | null>(null);

  useEffect(() => {
    if (user && !isAdmin) router.replace('/dashboard');
  }, [user, isAdmin, router]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const productsQuery = useQuery<PageResponse>({
    queryKey: ['products', page, search, supplierId, productType, status],
    queryFn: () =>
      api
        .get('/products', {
          params: {
            page,
            limit: 20,
            search: search || undefined,
            supplierSubaccountId: supplierId || undefined,
            productType: productType || undefined,
            status: status || undefined,
          },
        })
        .then((response) => response.data),
    enabled: isAdmin,
  });

  const suppliersQuery = useQuery<SupplierResponse>({
    queryKey: ['product-suppliers'],
    queryFn: () =>
      api
        .get('/subaccounts', { params: { page: 1, limit: 100, active: true, type: 'SUPPLIER' } })
        .then((response) => response.data),
    enabled: isAdmin,
  });

  const suppliers = useMemo(
    () =>
      (suppliersQuery.data?.data ?? []).filter(
        (supplier) =>
          supplier.type === 'SUPPLIER' &&
          supplier.active &&
          !supplier.deletedAt &&
          Boolean(supplier.walletId) &&
          Boolean(supplier.fulfillmentType),
      ),
    [suppliersQuery.data],
  );

  const selectedSupplier = suppliers.find((supplier) => supplier.id === form.supplierSubaccountId);

  const exchangeRateQuery = useQuery<ExchangeRateResponse>({
    queryKey: ['usd-brl-exchange-rate'],
    queryFn: () => api.get('/products/exchange-rate/usd-brl').then((response) => response.data),
    enabled: showForm && selectedSupplier?.fulfillmentType === 'INTERNATIONAL',
    refetchInterval: 60_000,
    staleTime: 30_000,
  });

  const convertedFormPrice =
    selectedSupplier?.fulfillmentType === 'INTERNATIONAL' &&
    Number(form.defaultPrice) > 0 &&
    exchangeRateQuery.data?.rate
      ? Number(form.defaultPrice) * Number(exchangeRateQuery.data.rate)
      : null;

  const closeForm = () => {
    setShowForm(false);
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
  };

  useEffect(() => {
    if (!showForm) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setShowForm(false);
      setEditing(null);
      setForm(emptyForm());
      setFieldErrors({});
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showForm]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm());
    setFieldErrors({});
    setShowForm(true);
  };

  const openEdit = (product: Product) => {
    setEditing(product);
    setForm({
      name: product.name,
      sku: product.sku || '',
      description: product.description || '',
      productType: product.productType || '',
      supplierSubaccountId: product.supplierSubaccountId || '',
      defaultPrice:
        product.supplier?.fulfillmentType === 'INTERNATIONAL' &&
        product.priceCurrency !== 'USD'
          ? ''
          : String(product.defaultPrice ?? ''),
      weightKg: product.weightKg == null ? '' : String(product.weightKg),
      heightCm: product.heightCm == null ? '' : String(product.heightCm),
      widthCm: product.widthCm == null ? '' : String(product.widthCm),
      lengthCm: product.lengthCm == null ? '' : String(product.lengthCm),
      active: product.active,
    });
    setFieldErrors({});
    setOpenActions(null);
    setShowForm(true);
  };

  const payload = () => ({
    name: form.name.trim(),
    sku: form.sku.trim() || null,
    description: form.description.trim() || null,
    productType: form.productType,
    supplierSubaccountId: form.supplierSubaccountId,
    defaultPrice: Number(form.defaultPrice),
    weightKg: form.weightKg ? Number(form.weightKg) : undefined,
    heightCm: form.heightCm ? Number(form.heightCm) : undefined,
    widthCm: form.widthCm ? Number(form.widthCm) : undefined,
    lengthCm: form.lengthCm ? Number(form.lengthCm) : undefined,
    active: form.active,
  });

  const validate = () => {
    const errors: Record<string, string> = {};
    if (!form.name.trim()) errors.name = 'Informe o nome do produto.';
    if (!form.productType) errors.productType = 'Selecione o tipo.';
    if (!form.supplierSubaccountId) errors.supplierSubaccountId = 'Selecione um fornecedor.';
    if (!Number.isFinite(Number(form.defaultPrice)) || Number(form.defaultPrice) <= 0) {
      errors.defaultPrice = 'Informe um preço maior que zero.';
    }
    for (const key of ['weightKg', 'heightCm', 'widthCm', 'lengthCm'] as const) {
      if (form[key] && (!Number.isFinite(Number(form[key])) || Number(form[key]) <= 0)) {
        errors[key] = 'Use um valor maior que zero.';
      }
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const invalidateCatalog = () => {
    queryClient.invalidateQueries({ queryKey: ['products'] });
    queryClient.invalidateQueries({ queryKey: ['products-active'] });
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (!validate()) throw new Error('FORM_INVALID');
      const body = payload();
      return editing
        ? api.patch(`/products/${editing.id}`, body)
        : api.post('/products', body);
    },
    onSuccess: () => {
      toast.success(editing ? 'Produto atualizado com sucesso.' : 'Produto criado com sucesso.');
      closeForm();
      invalidateCatalog();
    },
    onError: (error: unknown) => {
      if (error instanceof Error && error.message === 'FORM_INVALID') return;
      const message = apiErrorMessage(error, 'Não foi possível salvar o produto.');
      if (message.toLowerCase().includes('sku')) setFieldErrors((current) => ({ ...current, sku: message }));
      toast.error(message);
    },
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/products/${id}/toggle`),
    onSuccess: () => {
      toast.success('Status do produto atualizado.');
      setOpenActions(null);
      invalidateCatalog();
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, 'Erro ao atualizar produto.')),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/products/${id}`),
    onSuccess: () => {
      toast.success('Produto excluído.');
      setOpenActions(null);
      invalidateCatalog();
    },
    onError: (error: unknown) => toast.error(apiErrorMessage(error, 'Erro ao excluir produto.')),
  });

  const clearFilters = () => {
    setSearchInput('');
    setSearch('');
    setSupplierId('');
    setProductType('');
    setStatus('');
    setPage(1);
  };

  if (user && !isAdmin) return null;

  const rows = productsQuery.data?.data ?? [];
  const total = productsQuery.data?.total ?? 0;
  const start = total === 0 ? 0 : (page - 1) * 20 + 1;
  const end = Math.min(page * 20, total);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Produtos</h1>
          <p className="mt-1 text-gray-500">Gerencie o catálogo utilizado nas cobranças e integrações.</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          <Plus size={18} />
          Novo produto
        </button>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_220px_190px_190px]">
          <label className="relative">
            <span className="sr-only">Buscar por nome ou SKU</span>
            <Search size={17} className="absolute left-3 top-2.5 text-gray-400" />
            <input
              value={searchInput}
              onChange={(event) => setSearchInput(event.target.value)}
              placeholder="Buscar por nome ou SKU..."
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
            />
          </label>
          <select
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setPage(1);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Todos os fornecedores</option>
            {suppliers.map((supplier) => (
              <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
            ))}
          </select>
          <select
            value={productType}
            onChange={(event) => {
              setProductType(event.target.value as ProductType | '');
              setPage(1);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Todos os tipos</option>
            {Object.entries(productTypeLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as ProductStatus | '');
              setPage(1);
            }}
            className="rounded-lg border px-3 py-2 text-sm"
          >
            <option value="">Todos os status</option>
            <option value="ACTIVE">Ativos</option>
            <option value="INACTIVE">Inativos</option>
            <option value="PENDING">Configuração pendente</option>
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {productsQuery.isLoading ? (
          <div className="space-y-3 p-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <div key={index} className="h-12 animate-pulse rounded-lg bg-gray-100" />
            ))}
          </div>
        ) : productsQuery.isError ? (
          <div className="flex flex-col items-center gap-3 p-10 text-center">
            <AlertTriangle className="text-amber-500" />
            <div>
              <p className="font-medium text-gray-900">Não foi possível carregar os produtos.</p>
              <p className="text-sm text-gray-500">Tente novamente sem perder seus filtros.</p>
            </div>
            <button onClick={() => productsQuery.refetch()} className="rounded-lg border px-3 py-2 text-sm">
              Tentar novamente
            </button>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <Package size={36} className="text-gray-300" />
            <div>
              <p className="font-semibold text-gray-900">
                {total === 0 && !search && !supplierId && !productType && !status
                  ? 'Nenhum produto cadastrado'
                  : 'Nenhum produto encontrado com esses filtros.'}
              </p>
              <p className="mt-1 max-w-lg text-sm text-gray-500">
                {total === 0 && !search && !supplierId && !productType && !status
                  ? 'Cadastre produtos para reutilizá-los nas cobranças e disponibilizá-los às integrações.'
                  : 'Revise os filtros ou limpe a busca para visualizar outros produtos.'}
              </p>
            </div>
            {search || supplierId || productType || status ? (
              <button onClick={clearFilters} className="rounded-lg border px-4 py-2 text-sm">Limpar filtros</button>
            ) : (
              <button onClick={openCreate} className="rounded-lg bg-blue-600 px-4 py-2 text-sm text-white">Criar primeiro produto</button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[1050px] w-full text-sm">
              <thead className="border-b bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-5 py-3">Produto</th>
                  <th className="px-4 py-3">SKU</th>
                  <th className="px-4 py-3">Tipo</th>
                  <th className="px-4 py-3">Fornecedor</th>
                  <th className="px-4 py-3">Modalidade</th>
                  <th className="px-4 py-3">Preço</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((product) => {
                  const pending = product.active && !product.eligible;
                  return (
                    <tr key={product.id} className="align-top hover:bg-gray-50/70">
                      <td className="px-5 py-4">
                        <div className="font-medium text-gray-900">{product.name}</div>
                        {product.description && (
                          <div className="mt-1 max-w-xs truncate text-xs text-gray-500">{product.description}</div>
                        )}
                      </td>
                      <td className="px-4 py-4 text-gray-600">{product.sku || '—'}</td>
                      <td className="px-4 py-4">
                        {product.productType ? (
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                            {productTypeLabel[product.productType]}
                          </span>
                        ) : (
                          <span className="text-amber-700">Não configurado</span>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <div className={product.supplier ? 'text-gray-800' : 'text-amber-700'}>
                          {product.supplier?.name || 'Não configurado'}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-gray-700">
                        {product.supplier?.fulfillmentType === 'NATIONAL'
                          ? '🇧🇷 Nacional'
                          : product.supplier?.fulfillmentType === 'INTERNATIONAL'
                            ? '🌎 Internacional'
                            : '—'}
                      </td>
                      <td className="px-4 py-4">
                        {product.priceCurrency === 'USD' ? (
                          <div>
                            <div className="font-medium text-gray-900">{usd(product.defaultPrice)}</div>
                            <div className="mt-0.5 text-xs text-gray-500">
                              {product.priceBrl ? '≈ ' + money(product.priceBrl) : 'Cotação indisponível'}
                            </div>
                          </div>
                        ) : (
                          <div className="font-medium text-gray-900">{money(product.defaultPrice)}</div>
                        )}
                      </td>
                      <td className="px-4 py-4">
                        <span
                          title={pending ? product.eligibilityIssues.join(' · ') : undefined}
                          className={
                            'rounded-full px-2.5 py-1 text-xs font-medium ' +
                            (pending
                              ? 'bg-amber-100 text-amber-800'
                              : product.active
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-600')
                          }
                        >
                          {pending ? 'Configuração pendente' : product.active ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="relative px-4 py-4 text-right">
                        <button
                          aria-label={`Abrir ações de ${product.name}`}
                          onClick={() => setOpenActions((current) => current === product.id ? null : product.id)}
                          className="rounded-lg p-2 text-gray-500 hover:bg-gray-100"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        {openActions === product.id && (
                          <div className="absolute right-4 z-10 mt-1 w-44 rounded-lg border bg-white p-1 text-left shadow-lg">
                            <button onClick={() => openEdit(product)} className="flex w-full items-center gap-2 rounded-md px-3 py-2 hover:bg-gray-50">
                              <Pencil size={15} /> Editar
                            </button>
                            <button
                              disabled={toggleMutation.isPending}
                              onClick={() => toggleMutation.mutate(product.id)}
                              className="w-full rounded-md px-3 py-2 text-left hover:bg-gray-50"
                            >
                              {product.active ? 'Desativar' : 'Ativar'}
                            </button>
                            <button
                              disabled={deleteMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`Excluir "${product.name}"? Produtos com histórico serão preservados e a exclusão será recusada.`)) {
                                  deleteMutation.mutate(product.id);
                                }
                              }}
                              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-red-600 hover:bg-red-50"
                            >
                              <Trash2 size={15} /> Excluir
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!productsQuery.isLoading && !productsQuery.isError && total > 0 && (
          <div className="flex items-center justify-between border-t px-5 py-4 text-sm text-gray-600">
            <span>{start}–{end} de {total} produtos</span>
            <div className="flex gap-2">
              <button
                aria-label="Página anterior"
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronLeft size={17} />
              </button>
              <button
                aria-label="Próxima página"
                disabled={page >= (productsQuery.data?.totalPages || 1)}
                onClick={() => setPage((current) => current + 1)}
                className="rounded-lg border p-2 disabled:opacity-40"
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        )}
      </div>

      {showForm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) closeForm();
          }}
        >
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white shadow-xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-6 py-4">
              <div>
                <h2 className="text-lg font-semibold">{editing ? 'Editar produto' : 'Novo produto'}</h2>
                <p className="text-sm text-gray-500">O fornecedor define a modalidade logística das novas cobranças.</p>
              </div>
              <button aria-label="Fechar" onClick={closeForm} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-7 p-6">
              <section>
                <h3 className="mb-3 font-semibold text-gray-900">1. Informações básicas</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Nome *" error={fieldErrors.name}>
                    <input
                      value={form.name}
                      onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="SKU" error={fieldErrors.sku}>
                    <input
                      value={form.sku}
                      onChange={(event) => setForm((current) => ({ ...current, sku: event.target.value }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    />
                  </Field>
                  <Field label="Tipo *" error={fieldErrors.productType}>
                    <select
                      value={form.productType}
                      onChange={(event) => setForm((current) => ({ ...current, productType: event.target.value as ProductType }))}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Selecione...</option>
                      {Object.entries(productTypeLabel).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2">
                    <Field label="Descrição">
                      <textarea
                        rows={3}
                        value={form.description}
                        onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                        className="w-full rounded-lg border px-3 py-2 text-sm"
                      />
                    </Field>
                  </div>
                </div>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">2. Comercial</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <Field
                    label={
                      selectedSupplier?.fulfillmentType === 'INTERNATIONAL'
                        ? 'Preço do fornecedor (USD) *'
                        : 'Preço padrão (BRL) *'
                    }
                    error={fieldErrors.defaultPrice}
                  >
                    <div className="flex rounded-lg border focus-within:ring-2 focus-within:ring-blue-100">
                      <span className="border-r bg-gray-50 px-3 py-2 text-sm text-gray-500">
                        {selectedSupplier?.fulfillmentType === 'INTERNATIONAL' ? 'US$' : 'R$'}
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.defaultPrice}
                        onChange={(event) =>
                          setForm((current) => ({ ...current, defaultPrice: event.target.value }))
                        }
                        className="min-w-0 flex-1 rounded-r-lg px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    {selectedSupplier?.fulfillmentType === 'INTERNATIONAL' && (
                      <div className="mt-2 text-xs text-gray-500">
                        {exchangeRateQuery.isLoading
                          ? 'Consultando cotação USD/BRL...'
                          : exchangeRateQuery.isError
                            ? 'Cotação indisponível no momento. O produto pode ser salvo em USD, mas cobranças importadas exigirão uma cotação válida.'
                            : convertedFormPrice != null
                              ? 'Cotação de venda: R$ ' +
                                Number(exchangeRateQuery.data?.rate || 0).toFixed(4) +
                                ' por US$ 1 · conversão atual ≈ ' +
                                money(convertedFormPrice)
                              : 'Cotação de venda atual: R$ ' +
                                Number(exchangeRateQuery.data?.rate || 0).toFixed(4) +
                                ' por US$ 1'}
                      </div>
                    )}
                    {editing?.supplier?.fulfillmentType === 'INTERNATIONAL' &&
                      editing.priceCurrency !== 'USD' && (
                        <div className="mt-2 text-xs font-medium text-amber-700">
                          Este produto é legado e ainda está com preço em BRL. Informe o valor correto em USD para regularizá-lo.
                        </div>
                      )}
                  </Field>
                  <Field label="Fornecedor *" error={fieldErrors.supplierSubaccountId}>
                    <select
                      value={form.supplierSubaccountId}
                      onChange={(event) => {
                        const nextSupplier = suppliers.find(
                          (supplier) => supplier.id === event.target.value,
                        );
                        const currentSupplier = suppliers.find(
                          (supplier) => supplier.id === form.supplierSubaccountId,
                        );
                        setForm((current) => ({
                          ...current,
                          supplierSubaccountId: event.target.value,
                          defaultPrice:
                            currentSupplier?.fulfillmentType &&
                            nextSupplier?.fulfillmentType &&
                            currentSupplier.fulfillmentType !== nextSupplier.fulfillmentType
                              ? ''
                              : current.defaultPrice,
                        }));
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Selecione um fornecedor...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2 rounded-lg border bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Modalidade logística</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {selectedSupplier?.fulfillmentType === 'NATIONAL'
                        ? '🇧🇷 Nacional'
                        : selectedSupplier?.fulfillmentType === 'INTERNATIONAL'
                          ? '🌎 Internacional'
                          : 'Selecione um fornecedor'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">A modalidade é definida no cadastro do fornecedor.</div>
                  </div>
                </div>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">3. Logística</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Peso (kg)" error={fieldErrors.weightKg}>
                    <input type="number" min="0.001" step="0.001" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Altura (cm)" error={fieldErrors.heightCm}>
                    <input type="number" min="0.01" step="0.01" value={form.heightCm} onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Largura (cm)" error={fieldErrors.widthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.widthCm} onChange={(event) => setForm((current) => ({ ...current, widthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Comprimento (cm)" error={fieldErrors.lengthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.lengthCm} onChange={(event) => setForm((current) => ({ ...current, lengthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-gray-500">Quando não informados, o sistema utiliza as configurações padrão de embalagem já existentes.</p>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">4. Status</h3>
                <label className="flex items-start gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Produto ativo</span>
                    <span className="block text-xs text-gray-500">Produtos inativos não ficam disponíveis para novas cobranças ou integrações.</span>
                  </span>
                </label>
              </section>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4">
              <button onClick={closeForm} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
 : 'R
                      <option value="">Selecione um fornecedor...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2 rounded-lg border bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Modalidade logística</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {selectedSupplier?.fulfillmentType === 'NATIONAL'
                        ? '🇧🇷 Nacional'
                        : selectedSupplier?.fulfillmentType === 'INTERNATIONAL'
                          ? '🌎 Internacional'
                          : 'Selecione um fornecedor'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">A modalidade é definida no cadastro do fornecedor.</div>
                  </div>
                </div>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">3. Logística</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Peso (kg)" error={fieldErrors.weightKg}>
                    <input type="number" min="0.001" step="0.001" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Altura (cm)" error={fieldErrors.heightCm}>
                    <input type="number" min="0.01" step="0.01" value={form.heightCm} onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Largura (cm)" error={fieldErrors.widthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.widthCm} onChange={(event) => setForm((current) => ({ ...current, widthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Comprimento (cm)" error={fieldErrors.lengthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.lengthCm} onChange={(event) => setForm((current) => ({ ...current, lengthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-gray-500">Quando não informados, o sistema utiliza as configurações padrão de embalagem já existentes.</p>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">4. Status</h3>
                <label className="flex items-start gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Produto ativo</span>
                    <span className="block text-xs text-gray-500">Produtos inativos não ficam disponíveis para novas cobranças ou integrações.</span>
                  </span>
                </label>
              </section>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4">
              <button onClick={closeForm} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
}
                      </span>
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={form.defaultPrice}
                        onChange={(event) => setForm((current) => ({ ...current, defaultPrice: event.target.value }))}
                        className="min-w-0 flex-1 rounded-r-lg px-3 py-2 text-sm outline-none"
                      />
                    </div>
                    {selectedSupplier?.fulfillmentType === 'INTERNATIONAL' && (
                      <div className="mt-2 text-xs text-gray-500">
                        {exchangeRateQuery.isLoading
                          ? 'Consultando cotação USD/BRL...'
                          : exchangeRateQuery.isError
                            ? 'Cotação indisponível no momento. O produto pode ser salvo em USD, mas cobranças importadas exigirão uma cotação válida.'
                            : convertedFormPrice != null
                              ? `Cotação de venda: R$ ${Number(exchangeRateQuery.data?.rate || 0).toFixed(4)} por US$ 1 · conversão atual ≈ ${money(convertedFormPrice)}`
                              : `Cotação de venda atual: R$ ${Number(exchangeRateQuery.data?.rate || 0).toFixed(4)} por US$ 1`}
                      </div>
                    )}
                    {editing?.supplier?.fulfillmentType === 'INTERNATIONAL' &&
                      editing.priceCurrency !== 'USD' && (
                        <div className="mt-2 text-xs font-medium text-amber-700">
                          Este produto é legado e ainda está com preço em BRL. Informe o valor correto em USD para regularizá-lo.
                        </div>
                      )}
                  </Field>
                  <Field label="Fornecedor *" error={fieldErrors.supplierSubaccountId}>
                    <select
                      value={form.supplierSubaccountId}
                      onChange={(event) => {
                        const nextSupplier = suppliers.find((supplier) => supplier.id === event.target.value);
                        const currentSupplier = suppliers.find(
                          (supplier) => supplier.id === form.supplierSubaccountId,
                        );
                        setForm((current) => ({
                          ...current,
                          supplierSubaccountId: event.target.value,
                          defaultPrice:
                            currentSupplier?.fulfillmentType &&
                            nextSupplier?.fulfillmentType &&
                            currentSupplier.fulfillmentType !== nextSupplier.fulfillmentType
                              ? ''
                              : current.defaultPrice,
                        }));
                      }}
                      className="w-full rounded-lg border px-3 py-2 text-sm"
                    >
                      <option value="">Selecione um fornecedor...</option>
                      {suppliers.map((supplier) => (
                        <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                      ))}
                    </select>
                  </Field>
                  <div className="md:col-span-2 rounded-lg border bg-gray-50 px-4 py-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-gray-500">Modalidade logística</div>
                    <div className="mt-1 text-sm font-medium text-gray-900">
                      {selectedSupplier?.fulfillmentType === 'NATIONAL'
                        ? '🇧🇷 Nacional'
                        : selectedSupplier?.fulfillmentType === 'INTERNATIONAL'
                          ? '🌎 Internacional'
                          : 'Selecione um fornecedor'}
                    </div>
                    <div className="mt-1 text-xs text-gray-500">A modalidade é definida no cadastro do fornecedor.</div>
                  </div>
                </div>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">3. Logística</h3>
                <div className="grid gap-4 md:grid-cols-4">
                  <Field label="Peso (kg)" error={fieldErrors.weightKg}>
                    <input type="number" min="0.001" step="0.001" value={form.weightKg} onChange={(event) => setForm((current) => ({ ...current, weightKg: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Altura (cm)" error={fieldErrors.heightCm}>
                    <input type="number" min="0.01" step="0.01" value={form.heightCm} onChange={(event) => setForm((current) => ({ ...current, heightCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Largura (cm)" error={fieldErrors.widthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.widthCm} onChange={(event) => setForm((current) => ({ ...current, widthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                  <Field label="Comprimento (cm)" error={fieldErrors.lengthCm}>
                    <input type="number" min="0.01" step="0.01" value={form.lengthCm} onChange={(event) => setForm((current) => ({ ...current, lengthCm: event.target.value }))} className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </Field>
                </div>
                <p className="mt-2 text-xs text-gray-500">Quando não informados, o sistema utiliza as configurações padrão de embalagem já existentes.</p>
              </section>

              <section className="border-t pt-6">
                <h3 className="mb-3 font-semibold text-gray-900">4. Status</h3>
                <label className="flex items-start gap-3 rounded-lg border p-4">
                  <input
                    type="checkbox"
                    checked={form.active}
                    onChange={(event) => setForm((current) => ({ ...current, active: event.target.checked }))}
                    className="mt-1 h-4 w-4"
                  />
                  <span>
                    <span className="block text-sm font-medium text-gray-900">Produto ativo</span>
                    <span className="block text-xs text-gray-500">Produtos inativos não ficam disponíveis para novas cobranças ou integrações.</span>
                  </span>
                </label>
              </section>
            </div>

            <div className="sticky bottom-0 flex justify-end gap-3 border-t bg-white px-6 py-4">
              <button onClick={closeForm} className="rounded-lg border px-4 py-2 text-sm">Cancelar</button>
              <button
                disabled={saveMutation.isPending}
                onClick={() => saveMutation.mutate()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
              >
                {saveMutation.isPending ? 'Salvando...' : editing ? 'Salvar alterações' : 'Salvar produto'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-gray-700">{label}</span>
      {children}
      {error && <span className="mt-1 block text-xs text-red-600">{error}</span>}
    </label>
  );
}
