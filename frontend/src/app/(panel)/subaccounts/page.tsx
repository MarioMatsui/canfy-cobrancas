'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Search, ToggleLeft, ToggleRight, History, Stethoscope, Package, Users as UsersIcon, X, Link2, Trash2, MailCheck, Pencil } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type SubaccountType = 'DOCTOR' | 'SUPPLIER' | 'OTHER';
type FulfillmentType = 'NATIONAL' | 'INTERNATIONAL';

interface Subaccount {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string | null;
  phone?: string | null;
  mobilePhone?: string | null;
  asaasId?: string;
  walletId?: string | null;
  type: SubaccountType;
  fulfillmentType: FulfillmentType | null;
  active: boolean;
  balance: number | string;
  totalReceived: number;
  asaasGeneralStatus?: string | null;
  asaasStatusCheckedAt?: string | null;
  activationResentAt?: string | null;
  canResendActivation?: boolean;
  _count: { chargeSplits: number; splitResults: number };
  createdAt: string;
  updatedAt?: string;
}

interface PaginatedResponse {
  data: Subaccount[];
  total: number;
  page: number;
  totalPages: number;
}

interface FinancialHistory {
  splitResults: Array<{
    id: string;
    value: number;
    percentage: number | null;
    fixedValue: number | null;
    status: string;
    createdAt: string;
    charge: { id: string; customerName: string; value: number; status: string };
  }>;
  totalReceived: number;
  totalPending: number;
}

const typeConfig: Record<SubaccountType, { label: string; icon: React.ElementType; color: string }> = {
  DOCTOR: { label: 'Médico', icon: Stethoscope, color: 'bg-blue-100 text-blue-800' },
  SUPPLIER: { label: 'Fornecedor', icon: Package, color: 'bg-orange-100 text-orange-800' },
  OTHER: { label: 'Outro', icon: UsersIcon, color: 'bg-gray-100 text-gray-800' },
};

// Tipo societário aceito pela Asaas para pessoa jurídica (reference/criar-subconta) —
// não confundir com a classificação interna (Médico/Fornecedor/Outro) acima.
const COMPANY_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'MEI', label: 'MEI' },
  { value: 'LIMITED', label: 'Limitada (LTDA)' },
  { value: 'INDIVIDUAL', label: 'Empresário Individual' },
  { value: 'ASSOCIATION', label: 'Associação' },
];

function getDocumentType(cpfCnpj: string): 'CPF' | 'CNPJ' | null {
  const digits = cpfCnpj.replace(/\D/g, '');
  if (digits.length === 11) return 'CPF';
  if (digits.length === 14) return 'CNPJ';
  return null;
}

function formatCep(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return digits.length > 5 ? `${digits.slice(0, 5)}-${digits.slice(5)}` : digits;
}

export default function SubaccountsPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<SubaccountType | ''>('');
  const [page, setPage] = useState(1);
  const [historyId, setHistoryId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [editType, setEditType] = useState<SubaccountType>('OTHER');
  const [editFulfillmentType, setEditFulfillmentType] = useState<FulfillmentType | ''>('');
  const [showForm, setShowForm] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'link'>('create');

  // Form state
  const [formName, setFormName] = useState('');
  const [formCpfCnpj, setFormCpfCnpj] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formType, setFormType] = useState<SubaccountType>('DOCTOR');
  const [formFulfillmentType, setFormFulfillmentType] = useState<FulfillmentType | ''>('');
  const [formPhone, setFormPhone] = useState('');
  const [formMobilePhone, setFormMobilePhone] = useState('');
  const [formBirthDate, setFormBirthDate] = useState('');
  const [formIncomeValue, setFormIncomeValue] = useState('');
  const [formCompanyType, setFormCompanyType] = useState('');
  const [formPostalCode, setFormPostalCode] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formAddressNumber, setFormAddressNumber] = useState('');
  const [formComplement, setFormComplement] = useState('');
  const [formProvince, setFormProvince] = useState('');
  const [formWalletId, setFormWalletId] = useState('');

  const docType = getDocumentType(formCpfCnpj);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ['subaccounts', page, search, typeFilter],
    queryFn: () =>
      api.get('/subaccounts', { params: { page, limit: 20, search, ...(typeFilter && { type: typeFilter }) } }).then((r) => r.data),
  });

  const { data: history, isLoading: historyLoading } = useQuery<FinancialHistory>({
    queryKey: ['subaccount-history', historyId],
    queryFn: () => api.get(`/subaccounts/${historyId}/financial-history`).then((r) => r.data),
    enabled: !!historyId,
  });

  const editQuery = useQuery<Subaccount>({
    queryKey: ['subaccount-edit', editId],
    queryFn: () => api.get(`/subaccounts/${editId}`).then((r) => r.data),
    enabled: !!editId,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post('/subaccounts', payload),
    onSuccess: () => {
      toast.success('Subconta criada com sucesso!');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['subaccounts'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { details?: { errors?: { description?: string }[] }; message?: string } } };
      const msg = err.response?.data?.details?.errors?.[0]?.description || err.response?.data?.message || 'Erro ao criar subconta';
      toast.error(msg);
    },
  });

  const linkMutation = useMutation({
    mutationFn: (payload: {
      walletId: string;
      name?: string;
      cpfCnpj?: string;
      email?: string;
      type?: string;
      fulfillmentType?: FulfillmentType;
    }) => api.post('/subaccounts/link', payload),
    onSuccess: () => {
      toast.success('Conta vinculada com sucesso!');
      resetForm();
      queryClient.invalidateQueries({ queryKey: ['subaccounts'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      const msg = err.response?.data?.message || 'Erro ao vincular conta';
      toast.error(msg);
    },
  });

  const updateMetadataMutation = useMutation({
    mutationFn: (payload: {
      id: string;
      type: SubaccountType;
      fulfillmentType: FulfillmentType | null;
    }) =>
      api.patch(`/subaccounts/${payload.id}/metadata`, {
        type: payload.type,
        fulfillmentType: payload.fulfillmentType,
      }),
    onSuccess: () => {
      toast.success('Metadados da subconta atualizados');
      setEditId(null);
      queryClient.invalidateQueries({ queryKey: ['subaccounts'] });
      queryClient.invalidateQueries({ queryKey: ['subaccounts-active'] });
      queryClient.invalidateQueries({ queryKey: ['products-active'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string | string[] } } };
      const raw = err.response?.data?.message;
      const msg = Array.isArray(raw) ? raw[0] : raw;
      toast.error(msg || 'Erro ao atualizar metadados da subconta');
    },
  });

  const [resendingId, setResendingId] = useState<string | null>(null);

  const resendActivationMutation = useMutation({
    mutationFn: (id: string) => api.post(`/subaccounts/${id}/resend-activation`),
    onMutate: (id: string) => setResendingId(id),
    onSuccess: () => {
      toast.success('Novo link de ativação enviado pelo Asaas.');
      queryClient.invalidateQueries({ queryKey: ['subaccounts'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { details?: { errors?: { description?: string }[] }; message?: string } } };
      const msg =
        err.response?.data?.details?.errors?.[0]?.description ||
        err.response?.data?.message ||
        'Erro ao reenviar link de ativação';
      toast.error(msg);
    },
    onSettled: () => setResendingId(null),
  });

  const resetForm = () => {
    setShowForm(false);
    setFormMode('create');
    setFormName('');
    setFormCpfCnpj('');
    setFormEmail('');
    setFormType('DOCTOR');
    setFormFulfillmentType('');
    setFormPhone('');
    setFormMobilePhone('');
    setFormBirthDate('');
    setFormIncomeValue('');
    setFormCompanyType('');
    setFormPostalCode('');
    setFormAddress('');
    setFormAddressNumber('');
    setFormComplement('');
    setFormProvince('');
    setFormWalletId('');
  };

  const handleCreate = () => {
    if (!formName.trim() || !formCpfCnpj.trim() || !formEmail.trim()) {
      toast.error('Preencha nome, CPF/CNPJ e email');
      return;
    }
    if (!docType) {
      toast.error('CPF/CNPJ inválido — informe 11 dígitos (CPF) ou 14 dígitos (CNPJ)');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formEmail.trim())) {
      toast.error('Email inválido');
      return;
    }
    const mobilePhone = (formMobilePhone || formPhone).trim();
    if (!mobilePhone) {
      toast.error('Celular é obrigatório (Asaas exige mobilePhone para criar a subconta)');
      return;
    }
    if (formType === 'SUPPLIER' && !formFulfillmentType) {
      toast.error('Defina se o fornecedor é Nacional ou Internacional');
      return;
    }
    if (!formIncomeValue || parseFloat(formIncomeValue) <= 0) {
      toast.error('Renda/faturamento mensal é obrigatório');
      return;
    }
    const postalCode = formPostalCode.replace(/\D/g, '');
    if (postalCode.length !== 8) {
      toast.error('CEP inválido — informe os 8 dígitos');
      return;
    }
    if (!formAddress.trim()) {
      toast.error('Logradouro é obrigatório');
      return;
    }
    if (!formAddressNumber.trim()) {
      toast.error('Número é obrigatório');
      return;
    }
    if (!formProvince.trim()) {
      toast.error('Bairro é obrigatório');
      return;
    }

    createMutation.mutate({
      name: formName.trim(),
      cpfCnpj: formCpfCnpj.replace(/\D/g, ''),
      email: formEmail.trim(),
      type: formType,
      fulfillmentType:
        formType === 'SUPPLIER' ? (formFulfillmentType as FulfillmentType) : undefined,
      phone: formPhone.trim() || undefined,
      mobilePhone,
      birthDate: docType === 'CPF' && formBirthDate ? formBirthDate : undefined,
      companyType: docType === 'CNPJ' && formCompanyType ? formCompanyType : undefined,
      incomeValue: parseFloat(formIncomeValue),
      postalCode,
      address: formAddress.trim(),
      addressNumber: formAddressNumber.trim(),
      complement: formComplement.trim() || undefined,
      province: formProvince.trim(),
    });
  };

  const handleLink = () => {
    if (!formWalletId.trim()) {
      toast.error('Preencha o Wallet ID');
      return;
    }
    if (!formName.trim() || !formCpfCnpj.trim()) {
      toast.error('Preencha o nome e CPF/CNPJ da conta');
      return;
    }
    if (formType === 'SUPPLIER' && !formFulfillmentType) {
      toast.error('Defina se o fornecedor é Nacional ou Internacional');
      return;
    }
    linkMutation.mutate({
      walletId: formWalletId.trim(),
      name: formName.trim(),
      cpfCnpj: formCpfCnpj.replace(/\D/g, ''),
      email: formEmail.trim() || undefined,
      type: formType,
      fulfillmentType:
        formType === 'SUPPLIER' ? (formFulfillmentType as FulfillmentType) : undefined,
    });
  };

  const openEdit = (sub: Subaccount) => {
    setEditId(sub.id);
    setEditType(sub.type);
    setEditFulfillmentType(sub.fulfillmentType || '');
  };

  const saveMetadata = () => {
    if (!editId) return;
    if (editType === 'SUPPLIER' && !editFulfillmentType) {
      toast.error('Defina se o fornecedor é Nacional ou Internacional');
      return;
    }

    updateMetadataMutation.mutate({
      id: editId,
      type: editType,
      fulfillmentType:
        editType === 'SUPPLIER' ? (editFulfillmentType as FulfillmentType) : null,
    });
  };

  const toggleActive = async (id: string) => {
    try {
      await api.patch(`/subaccounts/${id}/toggle`);
      toast.success('Status atualizado');
      refetch();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const deleteSubaccount = async (id: string, name: string) => {
    if (!confirm(`Tem certeza que deseja excluir "${name}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/subaccounts/${id}`);
      toast.success('Subconta excluída');
      refetch();
    } catch {
      toast.error('Erro ao excluir subconta');
    }
  };

  const resendActivation = (id: string, email: string | null | undefined) => {
    const emailInfo = email ? `\n\nE-mail cadastrado: ${email}` : '';
    const confirmed = confirm(
      `Reenviar o link de ativação para esta subconta?\n\nO Asaas permite apenas um reenvio do link de ativação. Utilize esta opção quando o link original tiver expirado.\n\nO novo link será enviado pelo Asaas ao e-mail de login cadastrado da subconta.${emailInfo}`,
    );
    if (!confirmed) return;
    resendActivationMutation.mutate(id);
  };

  const formatCurrency = (value: number | string) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value || 0));

  const formatDateTime = (value: string | null | undefined) =>
    value ? new Date(value).toLocaleString('pt-BR') : '—';

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subcontas</h1>
          <p className="text-gray-500 mt-1">Gerencie médicos, fornecedores e subcontas Asaas</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => { setShowForm(true); setFormMode('link'); }} className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors">
            <Link2 size={20} />
            Vincular Existente
          </button>
          <button onClick={() => { setShowForm(true); setFormMode('create'); }} className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
            <Plus size={20} />
            Nova Subconta
          </button>
        </div>
      </div>

      {/* Formulário de criação / vinculação */}
      {showForm && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">{formMode === 'create' ? 'Nova Subconta' : 'Vincular Conta Existente'}</h2>
            <button onClick={resetForm} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
            <button onClick={() => setFormMode('create')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${formMode === 'create' ? 'bg-white shadow text-blue-600' : 'text-gray-600'}`}>
              Criar Nova
            </button>
            <button onClick={() => setFormMode('link')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${formMode === 'link' ? 'bg-white shadow text-green-600' : 'text-gray-600'}`}>
              Vincular Existente
            </button>
          </div>

          {/* Tipo */}
          <div className="flex gap-3">
            {(['DOCTOR', 'SUPPLIER', 'OTHER'] as SubaccountType[]).map((t) => {
              const cfg = typeConfig[t];
              const Icon = cfg.icon;
              return (
                <button
                  key={t}
                  onClick={() => {
                    setFormType(t);
                    if (t !== 'SUPPLIER') setFormFulfillmentType('');
                  }}
                  className={`flex-1 p-3 rounded-lg border-2 transition-colors text-center ${formType === t ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                  <Icon size={20} className="mx-auto mb-1" />
                  <div className="text-sm font-medium">{cfg.label}</div>
                </button>
              );
            })}
          </div>

          {formType === 'SUPPLIER' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Modalidade do fornecedor *
              </label>
              <select
                value={formFulfillmentType}
                onChange={(e) => setFormFulfillmentType(e.target.value as FulfillmentType | '')}
                className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
              >
                <option value="">Selecione...</option>
                <option value="NATIONAL">Nacional</option>
                <option value="INTERNATIONAL">Internacional</option>
              </select>
              <p className="mt-1 text-xs text-gray-500">
                Configuração interna da Canfy. Ela não é enviada ao Asaas.
              </p>
            </div>
          )}

          {formMode === 'link' ? (
            <>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800">
                  Informe o <strong>Wallet ID</strong> da conta Asaas e os dados do titular para vinculá-la ao sistema.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Wallet ID *</label>
                <input value={formWalletId} onChange={(e) => setFormWalletId(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 text-sm font-mono" placeholder="Ex: 4bfce8c3-abcd-1234-efgh-567890123456" />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Nome do titular" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ *</label>
                  <input value={formCpfCnpj} onChange={(e) => setFormCpfCnpj(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="email@exemplo.com" />
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
                  <input value={formName} onChange={(e) => setFormName(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Dr. João Silva" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">CPF/CNPJ *</label>
                  <input value={formCpfCnpj} onChange={(e) => setFormCpfCnpj(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="000.000.000-00" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
                  <input type="email" value={formEmail} onChange={(e) => setFormEmail(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="email@exemplo.com" />
                </div>
              </div>

              <div className="grid grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Telefone</label>
                  <input value={formPhone} onChange={(e) => setFormPhone(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="11999999999" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Celular *</label>
                  <input value={formMobilePhone} onChange={(e) => setFormMobilePhone(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="11999999999" />
                </div>
                {docType === 'CNPJ' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Tipo de Empresa</label>
                    <select value={formCompanyType} onChange={(e) => setFormCompanyType(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm">
                      <option value="">Selecione...</option>
                      {COMPANY_TYPE_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Data de Nasc.</label>
                    <input type="date" value={formBirthDate} onChange={(e) => setFormBirthDate(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" />
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Renda mensal *</label>
                  <input type="number" step="0.01" value={formIncomeValue} onChange={(e) => setFormIncomeValue(e.target.value)}
                    className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="5000" />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="font-semibold text-gray-800 mb-3">Endereço</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">CEP *</label>
                    <input value={formPostalCode} onChange={(e) => setFormPostalCode(formatCep(e.target.value))}
                      className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="00000-000" maxLength={9} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Logradouro *</label>
                    <input value={formAddress} onChange={(e) => setFormAddress(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Rua/Av." />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Número *</label>
                    <input value={formAddressNumber} onChange={(e) => setFormAddressNumber(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="123" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Bairro *</label>
                    <input value={formProvince} onChange={(e) => setFormProvince(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Bairro" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Complemento</label>
                    <input value={formComplement} onChange={(e) => setFormComplement(e.target.value)}
                      className="w-full rounded-lg border px-3 py-2 text-sm" placeholder="Apto, sala, etc. (opcional)" />
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="flex justify-end gap-3">
            <button onClick={resetForm} className="px-4 py-2 text-gray-600 hover:text-gray-800">Cancelar</button>
            {formMode === 'link' ? (
              <button onClick={handleLink} disabled={linkMutation.isPending}
                className="bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors">
                {linkMutation.isPending ? 'Vinculando...' : 'Vincular Conta'}
              </button>
            ) : (
              <button onClick={handleCreate} disabled={createMutation.isPending}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors">
                {createMutation.isPending ? 'Criando...' : 'Criar Subconta'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="flex gap-4">
        <div className="relative flex-1">
          <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar por nome, email ou CPF/CNPJ..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
        <select
          value={typeFilter}
          onChange={(e) => { setTypeFilter(e.target.value as SubaccountType | ''); setPage(1); }}
          className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Todos os tipos</option>
          <option value="DOCTOR">Médicos</option>
          <option value="SUPPLIER">Fornecedores</option>
          <option value="OTHER">Outros</option>
        </select>
      </div>

      {/* Tabela */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">CPF/CNPJ</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Receita</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Splits</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-6 py-12 text-center text-gray-500">
                  Nenhuma subconta encontrada
                </td>
              </tr>
            ) : (
              data?.data.map((sub) => {
                const typeInfo = typeConfig[sub.type] || typeConfig.OTHER;
                const TypeIcon = typeInfo.icon;
                return (
                  <tr key={sub.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium">{sub.name}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-full font-medium ${typeInfo.color}`}>
                        <TypeIcon size={14} />
                        {typeInfo.label}
                      </span>
                      {sub.type === 'SUPPLIER' && (
                        <div
                          className={`mt-1 text-xs ${
                            sub.fulfillmentType ? 'text-gray-500' : 'text-amber-600'
                          }`}
                        >
                          {sub.fulfillmentType === 'NATIONAL'
                            ? 'Nacional'
                            : sub.fulfillmentType === 'INTERNATIONAL'
                              ? 'Internacional'
                              : 'Modalidade não configurada'}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-gray-600">{sub.cpfCnpj}</td>
                    <td className="px-6 py-4 text-gray-600">{sub.email || '—'}</td>
                    <td className="px-6 py-4 text-right font-medium text-green-700">{formatCurrency(sub.totalReceived || 0)}</td>
                    <td className="px-6 py-4 text-center text-sm text-gray-500">{sub._count?.splitResults || 0}</td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                          sub.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {sub.active ? 'Ativa' : 'Inativa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => setHistoryId(sub.id)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Histórico financeiro"
                        >
                          <History size={20} />
                        </button>
                        <button
                          onClick={() => openEdit(sub)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={18} />
                        </button>
                        <button
                          onClick={() => toggleActive(sub.id)}
                          className="text-gray-400 hover:text-blue-600 transition-colors"
                          title={sub.active ? 'Desativar' : 'Ativar'}
                        >
                          {sub.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                        </button>
                        {sub.canResendActivation && (
                          <button
                            onClick={() => resendActivation(sub.id, sub.email)}
                            disabled={resendingId === sub.id}
                            className="text-gray-400 hover:text-blue-600 transition-colors disabled:opacity-50"
                            title="Reenviar link de ativação"
                          >
                            <MailCheck size={18} />
                          </button>
                        )}
                        <button
                          onClick={() => deleteSubaccount(sub.id, sub.name)}
                          className="text-gray-400 hover:text-red-600 transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">
              {data.total} subconta{data.total !== 1 ? 's' : ''} encontrada{data.total !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Anterior
              </button>
              <span className="px-3 py-1 text-sm">
                {page} / {data.totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                disabled={page === data.totalPages}
                className="px-3 py-1 rounded border text-sm disabled:opacity-50"
              >
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Modal de edição segura de metadados internos */}
      {editId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">Editar subconta</h2>
                <p className="text-xs text-gray-500 mt-1">
                  Dados cadastrais/Asaas são somente leitura. Apenas metadados internos da Canfy são salvos aqui.
                </p>
              </div>
              <button
                onClick={() => setEditId(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[72vh]">
              {editQuery.isLoading ? (
                <p className="text-center text-gray-500 py-10">Carregando subconta...</p>
              ) : editQuery.isError ? (
                <div className="text-center py-10">
                  <p className="text-red-600 mb-3">Não foi possível carregar esta subconta.</p>
                  <button
                    onClick={() => editQuery.refetch()}
                    className="px-4 py-2 rounded-lg border text-sm hover:bg-gray-50"
                  >
                    Tentar novamente
                  </button>
                </div>
              ) : editQuery.data ? (
                <div className="space-y-6">
                  <section>
                    <h3 className="font-semibold text-sm mb-3">Dados cadastrais e Asaas</h3>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                      {[
                        ['Nome', editQuery.data.name],
                        ['CPF/CNPJ', editQuery.data.cpfCnpj],
                        ['E-mail', editQuery.data.email],
                        ['Telefone', editQuery.data.phone],
                        ['Celular', editQuery.data.mobilePhone],
                        ['Asaas ID', editQuery.data.asaasId],
                        ['Wallet ID', editQuery.data.walletId],
                        ['Status Asaas', editQuery.data.asaasGeneralStatus],
                        ['Situação Canfy', editQuery.data.active ? 'Ativa' : 'Inativa'],
                        ['Saldo registrado', formatCurrency(editQuery.data.balance)],
                        ['Criada em', formatDateTime(editQuery.data.createdAt)],
                        ['Atualizada em', formatDateTime(editQuery.data.updatedAt)],
                        ['Status Asaas consultado em', formatDateTime(editQuery.data.asaasStatusCheckedAt)],
                      ].map(([label, value]) => (
                        <div key={String(label)}>
                          <label className="block text-xs font-medium text-gray-500 mb-1">
                            {label}
                          </label>
                          <div className="min-h-[38px] rounded-lg border bg-gray-50 px-3 py-2 text-sm text-gray-700 break-all">
                            {value == null || value === '' ? '—' : String(value)}
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>

                  <section className="border-t pt-5">
                    <h3 className="font-semibold text-sm mb-1">Metadados Canfy</h3>
                    <p className="text-xs text-gray-500 mb-4">
                      Estes campos são locais e não geram PUT/PATCH cadastral no Asaas.
                    </p>
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Classificação
                        </label>
                        <select
                          value={editType}
                          onChange={(e) => {
                            const next = e.target.value as SubaccountType;
                            setEditType(next);
                            if (next !== 'SUPPLIER') setEditFulfillmentType('');
                          }}
                          className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                        >
                          <option value="DOCTOR">Médico</option>
                          <option value="SUPPLIER">Fornecedor</option>
                          <option value="OTHER">Outro</option>
                        </select>
                      </div>

                      {editType === 'SUPPLIER' && (
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Modalidade do fornecedor *
                          </label>
                          <select
                            value={editFulfillmentType}
                            onChange={(e) =>
                              setEditFulfillmentType(e.target.value as FulfillmentType | '')
                            }
                            className="w-full rounded-lg border px-3 py-2 text-sm bg-white"
                          >
                            <option value="">Não configurado</option>
                            <option value="NATIONAL">Nacional</option>
                            <option value="INTERNATIONAL">Internacional</option>
                          </select>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 px-6 py-4 border-t bg-gray-50">
              <button
                onClick={() => setEditId(null)}
                className="px-4 py-2 text-sm rounded-lg border bg-white hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveMetadata}
                disabled={editQuery.isLoading || editQuery.isError || updateMetadataMutation.isPending}
                className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {updateMetadataMutation.isPending ? 'Salvando...' : 'Salvar alterações'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Histórico Financeiro */}
      {historyId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-semibold">Histórico Financeiro</h2>
              <button onClick={() => setHistoryId(null)} className="text-gray-400 hover:text-gray-600">
                <span className="text-2xl">&times;</span>
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {historyLoading ? (
                <p className="text-center text-gray-500 py-8">Carregando...</p>
              ) : history ? (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600">Total Recebido</p>
                      <p className="text-2xl font-bold text-green-700">{formatCurrency(history.totalReceived)}</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-4">
                      <p className="text-sm text-yellow-600">Pendente</p>
                      <p className="text-2xl font-bold text-yellow-700">{formatCurrency(history.totalPending)}</p>
                    </div>
                  </div>
                  {history.splitResults.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">Nenhum split registrado</p>
                  ) : (
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left px-4 py-2">Cliente</th>
                          <th className="text-right px-4 py-2">Valor Cobrança</th>
                          <th className="text-right px-4 py-2">Tipo</th>
                          <th className="text-right px-4 py-2">Recebido</th>
                          <th className="text-center px-4 py-2">Status</th>
                          <th className="text-right px-4 py-2">Data</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {history.splitResults.map((sr) => (
                          <tr key={sr.id}>
                            <td className="px-4 py-2">{sr.charge.customerName}</td>
                            <td className="px-4 py-2 text-right">{formatCurrency(sr.charge.value)}</td>
                            <td className="px-4 py-2 text-right">{sr.fixedValue != null ? 'R$ fixo' : `${Number(sr.percentage)}%`}</td>
                            <td className="px-4 py-2 text-right font-medium">{formatCurrency(sr.value)}</td>
                            <td className="px-4 py-2 text-center">
                              <span className={`text-xs px-2 py-0.5 rounded-full ${
                                sr.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                              }`}>
                                {sr.status === 'COMPLETED' ? 'Pago' : 'Pendente'}
                              </span>
                            </td>
                            <td className="px-4 py-2 text-right text-gray-500">
                              {new Date(sr.createdAt).toLocaleDateString('pt-BR')}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
