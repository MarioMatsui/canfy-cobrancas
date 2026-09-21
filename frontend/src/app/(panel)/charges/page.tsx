'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AxiosError } from 'axios';
import { ClipboardCopy, Plus, Trash2, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type OrderKind = 'PRODUCT' | 'CONSULTATION';
type FulfillmentType = 'NATIONAL' | 'INTERNATIONAL';
type DiscountType = 'NONE' | 'PERCENTAGE' | 'FIXED';

type Subaccount = { id: string; name: string; type: 'DOCTOR' | 'SUPPLIER' | 'OTHER'; walletId: string | null };
type Product = { id: string; name: string; sku: string | null; defaultPrice: number | string; supplierSubaccountId: string | null; fulfillmentType: FulfillmentType };
type Setting = { key: string; value: string };
type Split = { id: string; percentage: number | string | null; fixedValue: number | string | null; calculatedValue: number | string | null; subaccount: { id: string; name: string; type: string } };
type Charge = {
  id: string; orderKind: OrderKind | null; customerName: string; description: string | null; totalAmount: number | string; value: number | string;
  shippingAmount: number | string; orderStatus: string; status: string; billingType: string; expiresAt: string | null; dueDate: string | null;
  maxInstallments: number; invoiceUrl: string | null; checkoutUrl: string | null; mainAccountValue: number | string; mainAccountPercentage: number;
  splits: Split[]; latestPayment: { billingType: string; status: string } | null;
};
type PageResponse = { data: Charge[]; total: number; page: number; totalPages: number };
type ApiErrorBody = { message?: string | string[] };
type Item = { productId: string; productName: string; quantity: number; unitPrice: string; supplierSubaccountId: string; fulfillmentType: FulfillmentType };

const blankProduct = (): Item => ({ productId: '', productName: '', quantity: 1, unitPrice: '', supplierSubaccountId: '', fulfillmentType: 'NATIONAL' });
const blankConsultation = (): Item => ({ productId: '', productName: 'Consulta médica', quantity: 1, unitPrice: '', supplierSubaccountId: '', fulfillmentType: 'NATIONAL' });
const money = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));
const date = (value: string | null) => value ? new Date(value).toLocaleDateString('pt-BR') : '—';
const futureDate = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};
const apiErrorMessage = (error: unknown, fallback: string) => {
  const apiError = error as AxiosError<ApiErrorBody>;
  const raw = apiError.response?.data?.message;
  if (Array.isArray(raw)) return raw[0] || fallback;
  return raw || fallback;
};

const statusLabel: Record<string, string> = {
  DRAFT: 'Rascunho', READY: 'Pronto', PENDING_PAYMENT: 'Aguardando pagamento', PAID: 'Pago', EXPIRED: 'Expirado', CANCELLED: 'Cancelado', REFUNDED: 'Estornado',
  PENDING: 'Pendente', CONFIRMED: 'Pago', RECEIVED: 'Pago', OVERDUE: 'Atrasado',
};
const statusClass: Record<string, string> = {
  READY: 'bg-blue-100 text-blue-800', PENDING_PAYMENT: 'bg-yellow-100 text-yellow-800', PAID: 'bg-green-100 text-green-800',
  EXPIRED: 'bg-orange-100 text-orange-800', CANCELLED: 'bg-gray-100 text-gray-500', REFUNDED: 'bg-purple-100 text-purple-800',
  PENDING: 'bg-yellow-100 text-yellow-800', CONFIRMED: 'bg-green-100 text-green-800', RECEIVED: 'bg-green-100 text-green-800', OVERDUE: 'bg-red-100 text-red-800',
};
const billingLabel: Record<string, string> = { PIX: 'Pix', BOLETO: 'Boleto', CREDIT_CARD: 'Cartão de crédito', DEBIT_CARD: 'Cartão de débito', UNDEFINED: 'Link / múltiplos' };

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
    queryFn: () => api.get('/charges', { params: { page, limit: 20, search: search || undefined, orderStatus: status || undefined } }).then((r) => r.data),
  });
  const subaccounts = useQuery<{ data: Subaccount[] }>({ queryKey: ['subaccounts-active'], queryFn: () => api.get('/subaccounts', { params: { limit: 100, active: true } }).then((r) => r.data) });
  const productQuery = useQuery<{ data: Product[] }>({ queryKey: ['products-active'], queryFn: () => api.get('/products', { params: { limit: 200, active: true } }).then((r) => r.data) });
  const settingsQuery = useQuery<Setting[]>({ queryKey: ['settings-charge-form'], queryFn: () => api.get('/settings').then((r) => r.data) });

  const doctors = useMemo(() => subaccounts.data?.data.filter((s) => s.type === 'DOCTOR') ?? [], [subaccounts.data]);
  const suppliers = useMemo(() => subaccounts.data?.data.filter((s) => s.type === 'SUPPLIER') ?? [], [subaccounts.data]);
  const products = useMemo(() => productQuery.data?.data ?? [], [productQuery.data]);
  const setting = (key: string, fallback: number) => { const n = Number(settingsQuery.data?.find((s) => s.key === key)?.value); return Number.isFinite(n) ? n : fallback; };
  const supplierPct = setting('product_supplier_percentage', 70);
  const productDoctorPct = setting('product_doctor_percentage', 5);
  const productPlatformPct = setting('product_platform_percentage', 25);
  const consultationDoctorPct = setting('consultation_doctor_percentage', 85);
  const consultationPlatformPct = setting('consultation_platform_percentage', 15);

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + (Number(item.unitPrice) || 0) * item.quantity, 0), [items]);
  const hasNational = orderKind === 'PRODUCT' && items.some((i) => i.fulfillmentType === 'NATIONAL');
  const hasInternational = orderKind === 'PRODUCT' && items.some((i) => i.fulfillmentType === 'INTERNATIONAL');
  const discountRaw = Number(discountValue) || 0;
  const discountAmount = discountType === 'PERCENTAGE' ? subtotal * discountRaw / 100 : discountType === 'FIXED' ? discountRaw : 0;
  const platformMargin = subtotal * ((orderKind === 'PRODUCT' ? productPlatformPct : consultationPlatformPct) / 100);
  const shipping = orderKind === 'PRODUCT' ? (hasNational ? Number(nationalShippingAmount) || 0 : 0) + (hasInternational ? Number(internationalShippingAmount) || setting('international_shipping_default', 150) : 0) : 0;
  const total = subtotal - discountAmount + shipping;
  const doctorValue = subtotal * ((orderKind === 'PRODUCT' ? productDoctorPct : consultationDoctorPct) / 100);
  const supplierRows = useMemo(() => {
    if (orderKind !== 'PRODUCT') return [] as Array<{ id: string; name: string; value: number }>;
    const map = new Map<string, number>();
    items.forEach((item) => { if (item.supplierSubaccountId) map.set(item.supplierSubaccountId, (map.get(item.supplierSubaccountId) || 0) + (Number(item.unitPrice) || 0) * item.quantity * supplierPct / 100); });
    return Array.from(map.entries(), ([id, value]) => ({ id, value, name: suppliers.find((s) => s.id === id)?.name || 'Fornecedor' }));
  }, [items, orderKind, supplierPct, suppliers]);
  const mainValue = total - supplierRows.reduce((sum, row) => sum + row.value, 0) - doctorValue;

  const reset = () => {
    setShowForm(false); setOrderKind('PRODUCT'); setCustomerName(''); setCustomerCpfCnpj(''); setCustomerEmail(''); setCustomerPhone('');
    setItems([blankProduct()]); setDoctorSubaccountId(''); setDiscountType('NONE'); setDiscountValue(''); setNationalShippingAmount(''); setInternationalShippingAmount('');
    setMaxInstallments(1); setExpiresAt(''); setDescription(''); setNotes('');
  };
  const changeKind = (kind: OrderKind) => { setOrderKind(kind); setItems([kind === 'PRODUCT' ? blankProduct() : blankConsultation()]); setDiscountType('NONE'); setDiscountValue(''); setNationalShippingAmount(''); setInternationalShippingAmount(''); };
  const updateItem = (index: number, patch: Partial<Item>) => setItems((list) => list.map((item, i) => i === index ? { ...item, ...patch } : item));
  const selectProduct = (index: number, id: string) => {
    if (!id) return updateItem(index, { productId: '' });
    const p = products.find((entry) => entry.id === id); if (!p) return;
    updateItem(index, { productId: p.id, productName: p.name, unitPrice: String(p.defaultPrice), supplierSubaccountId: p.supplierSubaccountId || '', fulfillmentType: p.fulfillmentType });
  };
  const copy = async (value: string) => { try { await navigator.clipboard.writeText(value); toast.success('Link copiado'); } catch { toast.error('Não foi possível copiar automaticamente'); } };

  const create = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/charges', payload),
    onSuccess: (response) => { setCreatedLink(response.data.checkoutUrl || ''); toast.success('Pedido criado sem criar pagamento no Asaas'); reset(); queryClient.invalidateQueries({ queryKey: ['charges'] }); },
    onError: (error: unknown) => { toast.error(apiErrorMessage(error, 'Erro ao criar pedido')); },
  });

  const submit = () => {
    const cpf = customerCpfCnpj.replace(/\D/g, '');
    if (!customerName.trim() || (cpf.length !== 11 && cpf.length !== 14)) return toast.error('Preencha nome e um CPF/CNPJ válido');
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return toast.error('Email inválido');
    if (!doctorSubaccountId) return toast.error('Selecione o médico');
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.productId && !item.productName.trim()) return toast.error('Informe o item ' + (i + 1));
      if ((Number(item.unitPrice) || 0) <= 0 || item.quantity < 1) return toast.error('Valor ou quantidade inválidos no item ' + (i + 1));
      if (orderKind === 'PRODUCT' && !item.supplierSubaccountId) return toast.error('Selecione o fornecedor do item ' + (i + 1));
    }
    if (discountType !== 'NONE' && discountRaw <= 0) return toast.error('Informe o desconto');
    if (discountType === 'PERCENTAGE' && discountRaw > 100) return toast.error('Desconto percentual inválido');
    if (discountAmount > platformMargin + 0.005) return toast.error('O desconto máximo sem reduzir repasses é ' + money(platformMargin));
    if (total <= 0) return toast.error('O total do pedido deve ser maior que zero');

    create.mutate({
      orderKind, customerName: customerName.trim(), customerCpfCnpj: cpf, customerEmail: customerEmail.trim() || undefined, customerPhone: customerPhone.trim() || undefined,
      items: items.map((item) => ({ productId: item.productId || undefined, productName: item.productId ? undefined : item.productName.trim(), quantity: item.quantity, unitPrice: Number(item.unitPrice), supplierSubaccountId: orderKind === 'PRODUCT' ? item.supplierSubaccountId : undefined, fulfillmentType: orderKind === 'PRODUCT' ? item.fulfillmentType : undefined })),
      doctorSubaccountId, discountType, discountValue: discountType === 'NONE' ? 0 : discountRaw,
      nationalShippingAmount: hasNational ? Number(nationalShippingAmount) || 0 : undefined,
      internationalShippingAmount: hasInternational ? Number(internationalShippingAmount) || setting('international_shipping_default', 150) : undefined,
      maxInstallments, expiresAt: expiresAt || undefined, description: description.trim() || undefined, notes: notes.trim() || undefined,
    });
  };

  const cancel = async (id: string) => { try { await api.delete('/charges/' + id); toast.success('Cobrança cancelada'); charges.refetch(); } catch (error: unknown) { toast.error(apiErrorMessage(error, 'Erro ao cancelar')); } };
  const groupedSplits = (charge: Charge) => {
    const map = new Map<string, { name: string; type: string; value: number }>();
    charge.splits.filter((s) => s.calculatedValue != null).forEach((s) => { const old = map.get(s.subaccount.id); map.set(s.subaccount.id, { name: s.subaccount.name, type: s.subaccount.type, value: (old?.value || 0) + Number(s.calculatedValue || 0) }); });
    return Array.from(map.values());
  };

  return <div className="space-y-6">
    <div className="flex items-center justify-between gap-4">
      <div><h1 className="text-2xl font-bold text-gray-900">Cobranças</h1><p className="text-gray-500 mt-1">Pedidos com link CanFy; o pagamento nasce somente no checkout</p></div>
      <button onClick={() => { setShowForm((v) => !v); if (!expiresAt) setExpiresAt(futureDate(setting('charge_link_expiration_days', 7))); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700"><Plus size={20}/>Nova Cobrança</button>
    </div>

    {createdLink && <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex justify-between gap-3 items-center"><div className="min-w-0"><div className="font-semibold text-green-900">Link criado</div><div className="text-sm text-green-800 break-all">{createdLink}</div></div><button onClick={() => copy(createdLink)} className="shrink-0 flex items-center gap-2 border rounded-lg bg-white px-3 py-2 text-sm"><ClipboardCopy size={16}/>Copiar</button></div>}

    {showForm && <div className="bg-white rounded-xl border p-6 space-y-6">
      <div className="flex justify-between"><div><h2 className="text-lg font-semibold">Nova Cobrança</h2><p className="text-sm text-gray-500">Cria o pedido e o token público, sem chamar /payments do Asaas.</p></div><button onClick={reset}><X size={20}/></button></div>
      <div className="inline-flex border rounded-lg overflow-hidden"><button onClick={() => changeKind('PRODUCT')} className={'px-4 py-2 text-sm ' + (orderKind === 'PRODUCT' ? 'bg-blue-600 text-white' : '')}>Produto</button><button onClick={() => changeKind('CONSULTATION')} className={'px-4 py-2 text-sm ' + (orderKind === 'CONSULTATION' ? 'bg-blue-600 text-white' : '')}>Consulta</button></div>

      <section className="border-t pt-5"><h3 className="font-semibold mb-3">Cliente</h3><div className="grid md:grid-cols-2 xl:grid-cols-4 gap-3">
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Nome *" value={customerName} onChange={(e) => setCustomerName(e.target.value)}/>
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="CPF/CNPJ *" value={customerCpfCnpj} onChange={(e) => setCustomerCpfCnpj(e.target.value)}/>
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}/>
        <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Telefone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)}/>
      </div></section>

      <section className="border-t pt-5 space-y-3"><div className="flex justify-between"><div><h3 className="font-semibold">Itens</h3><p className="text-xs text-gray-500">O total é calculado pelos itens.</p></div><button onClick={() => setItems((list) => [...list, orderKind === 'PRODUCT' ? blankProduct() : blankConsultation()])} className="bg-gray-100 rounded-lg px-3 py-1.5 text-sm">+ Item</button></div>
        {items.map((item, index) => { const catalog = products.find((p) => p.id === item.productId); return <div key={index} className="border rounded-xl bg-gray-50 p-4 space-y-3">
          <div className="flex justify-between"><strong className="text-sm">Item {index + 1}</strong>{items.length > 1 && <button onClick={() => setItems((list) => list.filter((_, i) => i !== index))} className="text-red-500"><Trash2 size={17}/></button>}</div>
          {orderKind === 'PRODUCT' && <select className="w-full border rounded-lg px-3 py-2 text-sm bg-white" value={item.productId} onChange={(e) => selectProduct(index, e.target.value)}><option value="">Item avulso / manual</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{p.sku ? ' — ' + p.sku : ''}</option>)}</select>}
          <div className="grid md:grid-cols-2 xl:grid-cols-6 gap-3">
            <input className="border rounded-lg px-3 py-2 text-sm xl:col-span-2" placeholder="Nome *" disabled={Boolean(catalog)} value={item.productName} onChange={(e) => updateItem(index, { productName: e.target.value })}/>
            <input className="border rounded-lg px-3 py-2 text-sm" type="number" min={1} value={item.quantity} onChange={(e) => updateItem(index, { quantity: Math.max(1, Number(e.target.value) || 1) })}/>
            <input className="border rounded-lg px-3 py-2 text-sm" type="number" min="0.01" step="0.01" placeholder="Valor unitário *" value={item.unitPrice} onChange={(e) => updateItem(index, { unitPrice: e.target.value })}/>
            {orderKind === 'PRODUCT' && <><select className="border rounded-lg px-3 py-2 text-sm" disabled={Boolean(catalog?.supplierSubaccountId)} value={item.supplierSubaccountId} onChange={(e) => updateItem(index, { supplierSubaccountId: e.target.value })}><option value="">Fornecedor *</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select><select className="border rounded-lg px-3 py-2 text-sm" disabled={Boolean(catalog)} value={item.fulfillmentType} onChange={(e) => updateItem(index, { fulfillmentType: e.target.value as FulfillmentType })}><option value="NATIONAL">Nacional</option><option value="INTERNATIONAL">Internacional</option></select></>}
          </div><div className="text-right text-sm">Total do item: <strong>{money((Number(item.unitPrice) || 0) * item.quantity)}</strong></div>
        </div>; })}
      </section>

      <section className="border-t pt-5 grid md:grid-cols-3 gap-3"><select className="border rounded-lg px-3 py-2 text-sm" value={doctorSubaccountId} onChange={(e) => setDoctorSubaccountId(e.target.value)}><option value="">Médico *</option>{doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select><select className="border rounded-lg px-3 py-2 text-sm" value={maxInstallments} onChange={(e) => setMaxInstallments(Number(e.target.value))}>{Array.from({ length: 24 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>até {n}x</option>)}</select><input className="border rounded-lg px-3 py-2 text-sm" type="date" min={futureDate(1)} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}/></section>

      <section className="border-t pt-5 grid md:grid-cols-2 xl:grid-cols-4 gap-3"><select className="border rounded-lg px-3 py-2 text-sm" value={discountType} onChange={(e) => setDiscountType(e.target.value as DiscountType)}><option value="NONE">Sem desconto</option><option value="PERCENTAGE">Desconto %</option><option value="FIXED">Desconto R$</option></select><div><input className="w-full border rounded-lg px-3 py-2 text-sm" disabled={discountType === 'NONE'} type="number" min="0" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="Desconto"/><p className="text-xs text-gray-500 mt-1">Máx. sem reduzir repasses: {money(platformMargin)}</p></div>{hasNational && <input className="border rounded-lg px-3 py-2 text-sm" type="number" min="0" step="0.01" value={nationalShippingAmount} onChange={(e) => setNationalShippingAmount(e.target.value)} placeholder="Frete nacional R$"/>}{hasInternational && <input className="border rounded-lg px-3 py-2 text-sm" type="number" min="0" step="0.01" value={internationalShippingAmount} onChange={(e) => setInternationalShippingAmount(e.target.value)} placeholder={'Frete internacional (padrão ' + money(setting('international_shipping_default', 150)) + ')'}/>}</section>

      <section className="border-t pt-5 grid md:grid-cols-2 gap-3"><input className="border rounded-lg px-3 py-2 text-sm" placeholder="Descrição" value={description} onChange={(e) => setDescription(e.target.value)}/><input className="border rounded-lg px-3 py-2 text-sm" placeholder="Observações internas" value={notes} onChange={(e) => setNotes(e.target.value)}/></section>

      <section className="border-t pt-5"><h3 className="font-semibold mb-3">Resumo</h3><div className="bg-gray-50 rounded-xl p-4 grid lg:grid-cols-2 gap-5 text-sm"><div className="space-y-2"><div className="flex justify-between"><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div className="flex justify-between text-red-600"><span>Desconto</span><strong>- {money(discountAmount)}</strong></div><div className="flex justify-between"><span>Frete</span><strong>{money(shipping)}</strong></div><div className="flex justify-between border-t pt-2 text-base"><span>Total</span><strong>{money(total)}</strong></div></div><div className="space-y-2">{supplierRows.map((row) => <div key={row.id} className="flex justify-between text-orange-700"><span>{row.name}</span><strong>{money(row.value)}</strong></div>)}<div className="flex justify-between text-blue-700"><span>Médico ({orderKind === 'PRODUCT' ? productDoctorPct : consultationDoctorPct}%)</span><strong>{money(doctorValue)}</strong></div><div className="flex justify-between text-green-700 border-t pt-2"><span>CanFy</span><strong>{money(mainValue)}</strong></div><p className="text-xs text-gray-500">Frete fica na conta principal; desconto sai apenas da margem da CanFy.</p></div></div></section>
      <div className="flex justify-end gap-3"><button onClick={reset} className="px-4 py-2">Cancelar</button><button onClick={submit} disabled={create.isPending} className="bg-blue-600 text-white rounded-lg px-6 py-2 disabled:opacity-50">{create.isPending ? 'Criando...' : 'Criar pedido e link'}</button></div>
    </div>}

    <div className="flex gap-3 flex-col md:flex-row"><input className="border rounded-lg px-3 py-2 text-sm md:w-80" placeholder="Buscar cliente ou CPF/CNPJ" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }}/><select className="border rounded-lg px-3 py-2 text-sm" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}><option value="">Todos os status</option><option value="READY">Pronto</option><option value="PENDING_PAYMENT">Aguardando pagamento</option><option value="PAID">Pago</option><option value="EXPIRED">Expirado</option><option value="CANCELLED">Cancelado</option><option value="REFUNDED">Estornado</option></select></div>

    <div className="bg-white rounded-xl border overflow-x-auto"><table className="w-full min-w-[1050px]"><thead className="bg-gray-50 border-b"><tr>{['Tipo','Cliente','Valor','Pagamento','Validade / venc.','Splits','Status','Ações'].map((h) => <th key={h} className="text-left px-4 py-3 text-sm font-medium text-gray-500">{h}</th>)}</tr></thead><tbody className="divide-y">{charges.isLoading ? <tr><td colSpan={8} className="text-center py-8">Carregando...</td></tr> : charges.data?.data.length === 0 ? <tr><td colSpan={8} className="text-center py-8">Nenhuma cobrança</td></tr> : charges.data?.data.map((charge) => {
      const newSplits = groupedSplits(charge); const displayStatus = charge.orderStatus || charge.status; const paymentType = charge.latestPayment?.billingType || charge.billingType; const canCancel = ['READY','PENDING_PAYMENT'].includes(displayStatus) || (!charge.orderKind && ['PENDING','OVERDUE'].includes(charge.status));
      return <tr key={charge.id} className="align-top hover:bg-gray-50"><td className="px-4 py-3"><span className={'text-xs rounded-full px-2 py-1 ' + (charge.orderKind === 'PRODUCT' ? 'bg-emerald-100 text-emerald-800' : charge.orderKind === 'CONSULTATION' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100')}>{charge.orderKind === 'PRODUCT' ? 'Produto' : charge.orderKind === 'CONSULTATION' ? 'Consulta' : 'Legado'}</span></td><td className="px-4 py-3"><div className="font-medium text-sm">{charge.customerName}</div><div className="text-xs text-gray-400 max-w-[220px] truncate">{charge.description}</div></td><td className="px-4 py-3 font-semibold text-sm">{money(charge.totalAmount ?? charge.value)}</td><td className="px-4 py-3 text-sm text-gray-600">{charge.orderKind && !charge.latestPayment ? 'Checkout CanFy' : billingLabel[paymentType] || paymentType || '—'}{charge.maxInstallments > 1 && <div className="text-xs">até {charge.maxInstallments}x</div>}</td><td className="px-4 py-3 text-sm">{date(charge.orderKind ? charge.expiresAt : charge.dueDate)}</td><td className="px-4 py-3 text-xs min-w-[210px]">{newSplits.length ? <>{newSplits.map((s) => <div key={s.name} className={s.type === 'DOCTOR' ? 'text-blue-600' : 'text-orange-600'}>{s.name}: {money(s.value)}</div>)}<div className="text-green-700 font-medium">Principal: {money(charge.mainAccountValue)}</div></> : charge.splits.length ? <>{charge.splits.map((s) => <div key={s.id}>{s.subaccount.name}: {s.fixedValue != null ? money(s.fixedValue) : Number(s.percentage || 0) + '%'}</div>)}<div className="text-green-700">Principal: {charge.mainAccountPercentage}%</div></> : <div className="text-green-700">100% Conta Principal</div>}</td><td className="px-4 py-3"><span className={'text-xs rounded-full px-2 py-1 ' + (statusClass[displayStatus] || 'bg-gray-100')}>{statusLabel[displayStatus] || displayStatus}</span></td><td className="px-4 py-3 text-xs"><div className="flex flex-wrap gap-2">{charge.checkoutUrl && <button onClick={() => copy(charge.checkoutUrl!)} className="text-blue-600">Copiar link</button>}{!charge.orderKind && charge.invoiceUrl && <a href={charge.invoiceUrl} target="_blank" rel="noreferrer" className="text-blue-500">Link Asaas</a>}{canCancel && <button onClick={() => cancel(charge.id)} className="text-red-500">Cancelar</button>}</div></td></tr>;
    })}</tbody></table></div>

    {charges.data && charges.data.totalPages > 1 && <div className="flex justify-center gap-2">{Array.from({ length: charges.data.totalPages }, (_, i) => i + 1).map((n) => <button key={n} onClick={() => setPage(n)} className={'px-3 py-1 rounded-lg text-sm ' + (n === page ? 'bg-blue-600 text-white' : 'bg-gray-100')}>{n}</button>)}</div>}
  </div>;
}
