'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, XCircle, Link2, Receipt, X } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface Subaccount {
  id: string;
  name: string;
  type: 'DOCTOR' | 'SUPPLIER' | 'OTHER';
  walletId: string;
}

interface ChargeSplit {
  subaccountId: string;
  percentage: number;
  subaccount: { name: string; type: string };
}

interface Charge {
  id: string;
  asaasId: string;
  chargeType: 'CUSTOM' | 'REUSABLE';
  customerName: string;
  billingType: string;
  value: number;
  dueDate: string;
  description: string;
  status: string;
  maxInstallments: number;
  isActive: boolean;
  invoiceUrl: string;
  splits: ChargeSplit[];
  mainAccountPercentage: number;
  createdAt: string;
}

interface PaginatedResponse {
  data: Charge[];
  total: number;
  page: number;
  totalPages: number;
}

const statusColors: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  OVERDUE: 'bg-red-100 text-red-800',
  REFUNDED: 'bg-gray-100 text-gray-800',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const statusLabels: Record<string, string> = {
  PENDING: 'Pendente',
  CONFIRMED: 'Pago',
  OVERDUE: 'Atrasado',
  REFUNDED: 'Estornado',
  CANCELLED: 'Cancelado',
};

const billingLabels: Record<string, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CREDIT_CARD: 'Cartão Crédito',
  DEBIT_CARD: 'Cartão Débito',
  UNDEFINED: 'Link (múltiplos)',
};

interface SplitEntry {
  subaccountId: string;
  percentage: number;
}

export default function ChargesPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [chargeType, setChargeType] = useState<'CUSTOM' | 'REUSABLE'>('CUSTOM');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerCpfCnpj, setCustomerCpfCnpj] = useState('');
  const [billingType, setBillingType] = useState('PIX');
  const [value, setValue] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [description, setDescription] = useState('');
  const [maxInstallments, setMaxInstallments] = useState(1);
  const [splits, setSplits] = useState<SplitEntry[]>([]);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ['charges', page, statusFilter, typeFilter],
    queryFn: () =>
      api.get('/charges', {
        params: {
          page, limit: 20,
          status: statusFilter || undefined,
          chargeType: typeFilter || undefined,
        },
      }).then((r) => r.data),
  });

  const { data: subaccounts } = useQuery<Subaccount[]>({
    queryKey: ['subaccounts-list'],
    queryFn: () => api.get('/subaccounts', { params: { limit: 100 } }).then((r) => r.data.data),
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/charges', payload),
    onSuccess: () => {
      toast.success('Cobrança criada com sucesso!');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['charges'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { details?: { errors?: { description?: string }[] }; message?: string } } };
      const msg = err.response?.data?.details?.errors?.[0]?.description || err.response?.data?.message || 'Erro ao criar cobrança';
      toast.error(msg);
    },
  });

  const totalSplitPercent = splits.reduce((sum, s) => sum + s.percentage, 0);
  const mainAccountPercent = 100 - totalSplitPercent;

  const addSplit = () => {
    setSplits([...splits, { subaccountId: '', percentage: 0 }]);
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: keyof SplitEntry, val: string | number) => {
    const updated = [...splits];
    if (field === 'percentage') {
      updated[index] = { ...updated[index], percentage: Number(val) };
    } else {
      updated[index] = { ...updated[index], subaccountId: val as string };
    }
    setSplits(updated);
  };

  const resetForm = () => {
    setShowForm(false);
    setChargeType('CUSTOM');
    setCustomerName('');
    setCustomerEmail('');
    setCustomerCpfCnpj('');
    setBillingType('PIX');
    setValue('');
    setDueDate('');
    setDescription('');
    setMaxInstallments(1);
    setSplits([]);
  };

  const handleSubmit = () => {
    if (!customerName || !value || splits.length === 0) {
      toast.error('Preencha cliente, valor e pelo menos um split');
      return;
    }
    if (totalSplitPercent >= 100) {
      toast.error('Total de splits deve ser menor que 100%');
      return;
    }
    if (chargeType === 'CUSTOM' && !dueDate) {
      toast.error('Data de vencimento obrigatória para cobranças avulsas');
      return;
    }
    if (chargeType === 'CUSTOM' && !customerCpfCnpj) {
      toast.error('CPF/CNPJ obrigatório para cobranças avulsas');
      return;
    }
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) {
      toast.error('Email inválido');
      return;
    }

    createMutation.mutate({
      chargeType,
      customerName,
      customerEmail: customerEmail || undefined,
      customerCpfCnpj: customerCpfCnpj || undefined,
      billingType,
      value: parseFloat(value),
      dueDate: dueDate || undefined,
      description: description || undefined,
      maxInstallments,
      splits: splits.filter((s) => s.subaccountId && s.percentage > 0),
    });
  };

  const cancelCharge = async (id: string) => {
    try {
      await api.delete(`/charges/${id}`);
      toast.success('Cobrança cancelada');
      refetch();
    } catch {
      toast.error('Erro ao cancelar cobrança');
    }
  };

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  const formatDate = (date: string) =>
    date ? new Date(date).toLocaleDateString('pt-BR') : '—';

  const doctors = subaccounts?.filter((s) => s.type === 'DOCTOR') || [];
  const suppliers = subaccounts?.filter((s) => s.type === 'SUPPLIER') || [];
  const allRecipients = [...doctors, ...suppliers];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranças</h1>
          <p className="text-gray-500 mt-1">Cobranças avulsas e reutilizáveis com split automático</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Nova Cobrança
        </button>
      </div>

      {/* Formulário de criação */}
      {showForm && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Nova Cobrança</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          {/* Tipo de cobrança */}
          <div className="flex gap-4">
            <button
              onClick={() => setChargeType('CUSTOM')}
              className={`flex-1 p-4 rounded-lg border-2 transition-colors ${chargeType === 'CUSTOM' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            >
              <Receipt size={24} className="text-blue-600 mb-2" />
              <div className="font-medium">Avulsa / Personalizada</div>
              <div className="text-sm text-gray-500">Cobrança única com valor e splits personalizados</div>
            </button>
            <button
              onClick={() => setChargeType('REUSABLE')}
              className={`flex-1 p-4 rounded-lg border-2 transition-colors ${chargeType === 'REUSABLE' ? 'border-purple-500 bg-purple-50' : 'border-gray-200'}`}
            >
              <Link2 size={24} className="text-purple-600 mb-2" />
              <div className="font-medium">Reutilizável / Link</div>
              <div className="text-sm text-gray-500">Link permanente para uso recorrente (ex: consulta R$99)</div>
            </button>
          </div>

          {/* Dados do cliente */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome do cliente *</label>
              <input value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="João Silva" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input type="email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="email@exemplo.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ {chargeType === 'CUSTOM' ? '*' : ''}</label>
              <input value={customerCpfCnpj} onChange={(e) => setCustomerCpfCnpj(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="000.000.000-00" />
            </div>
          </div>

          {/* Valor, forma de pagamento, vencimento */}
          <div className="grid grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Valor (R$) *</label>
              <input type="number" step="0.01" min="0.01" value={value} onChange={(e) => setValue(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="300.00" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Forma de pagamento</label>
              <select value={billingType} onChange={(e) => setBillingType(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                <option value="PIX">Pix</option>
                <option value="BOLETO">Boleto</option>
                <option value="CREDIT_CARD">Cartão de crédito</option>
                <option value="DEBIT_CARD">Cartão de débito</option>
                <option value="UNDEFINED">Link (aceita múltiplos)</option>
              </select>
            </div>
            {chargeType === 'CUSTOM' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Vencimento *</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm" />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Parcelas (max {chargeType === 'CUSTOM' ? 5 : 3})
              </label>
              <select value={maxInstallments} onChange={(e) => setMaxInstallments(Number(e.target.value))}
                className="w-full rounded-lg border px-3 py-2 text-sm">
                {Array.from({ length: chargeType === 'CUSTOM' ? 5 : 3 }, (_, i) => i + 1).map((n) => (
                  <option key={n} value={n}>{n}x</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Ex: Consulta médica, Venda produto X" />
          </div>

          {/* --- SPLITS --- */}
          <div className="border-t pt-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-gray-800">Destinatários do Split</h3>
              <button onClick={addSplit}
                className="text-sm bg-gray-100 text-gray-700 px-3 py-1 rounded-lg hover:bg-gray-200 transition-colors">
                + Adicionar destinatário
              </button>
            </div>

            {splits.map((split, idx) => (
              <div key={idx} className="flex items-center gap-3 mb-2">
                <select value={split.subaccountId} onChange={(e) => updateSplit(idx, 'subaccountId', e.target.value)}
                  className="flex-1 rounded-lg border px-3 py-2 text-sm">
                  <option value="">Selecione (médico ou fornecedor)</option>
                  {doctors.length > 0 && (
                    <optgroup label="🩺 Médicos">
                      {doctors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </optgroup>
                  )}
                  {suppliers.length > 0 && (
                    <optgroup label="📦 Fornecedores">
                      {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </optgroup>
                  )}
                </select>
                <div className="flex items-center gap-1">
                  <input type="number" min="0.01" max="99.99" step="0.01" value={split.percentage || ''}
                    onChange={(e) => updateSplit(idx, 'percentage', e.target.value)}
                    className="w-20 rounded-lg border px-2 py-2 text-sm text-center" placeholder="%" />
                  <span className="text-gray-500 text-sm">%</span>
                </div>
                <button onClick={() => removeSplit(idx)} className="text-red-400 hover:text-red-600">
                  <XCircle size={20} />
                </button>
              </div>
            ))}

            {/* Resumo do split */}
            <div className="mt-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex justify-between text-sm">
                {splits.map((s, idx) => {
                  const sub = allRecipients.find((r) => r.id === s.subaccountId);
                  return s.subaccountId ? (
                    <span key={idx} className={`${sub?.type === 'DOCTOR' ? 'text-blue-600' : 'text-orange-600'}`}>
                      {sub?.name}: {s.percentage}%
                    </span>
                  ) : null;
                })}
                <span className={`font-semibold ${mainAccountPercent < 0 ? 'text-red-600' : 'text-green-700'}`}>
                  Conta Principal: {mainAccountPercent.toFixed(2)}%
                </span>
              </div>
              {value && (
                <div className="flex justify-between text-xs text-gray-500 mt-1">
                  {splits.map((s, idx) => {
                    const sub = allRecipients.find((r) => r.id === s.subaccountId);
                    const val = (parseFloat(value) * s.percentage) / 100;
                    return s.subaccountId ? (
                      <span key={idx}>{sub?.name}: {formatCurrency(val)}</span>
                    ) : null;
                  })}
                  <span>Conta Principal: {formatCurrency((parseFloat(value || '0') * mainAccountPercent) / 100)}</span>
                </div>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancelar</button>
            <button onClick={handleSubmit} disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
              {createMutation.isPending ? 'Criando...' : 'Criar Cobrança'}
            </button>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-4">
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="CONFIRMED">Pago</option>
          <option value="OVERDUE">Atrasado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm">
          <option value="">Todos os tipos</option>
          <option value="CUSTOM">Avulsa</option>
          <option value="REUSABLE">Reutilizável</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Tipo</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Cliente</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Valor</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Pagamento</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Vencimento</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Splits</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-500">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-500">Carregando...</td></tr>
            ) : data?.data.length === 0 ? (
              <tr><td colSpan={8} className="text-center py-8 text-gray-500">Nenhuma cobrança encontrada</td></tr>
            ) : (
              data?.data.map((charge) => (
                <tr key={charge.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${
                      charge.chargeType === 'REUSABLE' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'
                    }`}>
                      {charge.chargeType === 'REUSABLE' ? 'Reutilizável' : 'Avulsa'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-sm">{charge.customerName}</div>
                    <div className="text-xs text-gray-400">{charge.description}</div>
                  </td>
                  <td className="px-4 py-3 font-semibold text-sm">{formatCurrency(charge.value)}</td>
                  <td className="px-4 py-3 text-sm text-gray-600">
                    {billingLabels[charge.billingType] || charge.billingType}
                    {charge.maxInstallments > 1 && ` (${charge.maxInstallments}x)`}
                  </td>
                  <td className="px-4 py-3 text-sm text-gray-600">{formatDate(charge.dueDate)}</td>
                  <td className="px-4 py-3 text-xs">
                    {charge.splits.map((s, i) => (
                      <div key={i} className={s.subaccount.type === 'DOCTOR' ? 'text-blue-600' : 'text-orange-600'}>
                        {s.subaccount.name}: {Number(s.percentage)}%
                      </div>
                    ))}
                    <div className="text-green-700 font-medium">Principal: {charge.mainAccountPercentage}%</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${statusColors[charge.status] || ''}`}>
                      {statusLabels[charge.status] || charge.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      {charge.invoiceUrl && (
                        <a href={charge.invoiceUrl} target="_blank" rel="noreferrer"
                          className="text-blue-500 hover:text-blue-700 text-xs">Link</a>
                      )}
                      {charge.status === 'PENDING' && (
                        <button onClick={() => cancelCharge(charge.id)}
                          className="text-red-500 hover:text-red-700 text-xs">Cancelar</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Paginação */}
      {data && data.totalPages > 1 && (
        <div className="flex justify-center gap-2">
          {Array.from({ length: data.totalPages }, (_, i) => i + 1).map((p) => (
            <button key={p} onClick={() => setPage(p)}
              className={`px-3 py-1 rounded-lg text-sm ${p === page ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
