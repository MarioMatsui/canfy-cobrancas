'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface Subaccount {
  id: string;
  name: string;
  cpfCnpj: string;
  email: string;
  active: boolean;
  balance: number;
  createdAt: string;
}

interface PaginatedResponse {
  data: Subaccount[];
  total: number;
  page: number;
  totalPages: number;
}

export default function SubaccountsPage() {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ['subaccounts', page, search],
    queryFn: () =>
      api.get('/subaccounts', { params: { page, limit: 20, search } }).then((r) => r.data),
  });

  const toggleActive = async (id: string) => {
    try {
      await api.patch(`/subaccounts/${id}/toggle`);
      toast.success('Status atualizado');
      refetch();
    } catch {
      toast.error('Erro ao atualizar status');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Subcontas</h1>
          <p className="text-gray-500 mt-1">Gerencie as subcontas Asaas</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={20} />
          Nova Subconta
        </button>
      </div>

      <div className="relative">
        <Search size={20} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar por nome, email ou CPF/CNPJ..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">CPF/CNPJ</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Email</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Saldo</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Carregando...
                </td>
              </tr>
            ) : data?.data.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
                  Nenhuma subconta encontrada
                </td>
              </tr>
            ) : (
              data?.data.map((sub) => (
                <tr key={sub.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{sub.name}</td>
                  <td className="px-6 py-4 text-gray-600">{sub.cpfCnpj}</td>
                  <td className="px-6 py-4 text-gray-600">{sub.email}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(sub.balance)}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                        sub.active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {sub.active ? 'Ativa' : 'Inativa'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <button
                      onClick={() => toggleActive(sub.id)}
                      className="text-gray-400 hover:text-blue-600 transition-colors"
                      title={sub.active ? 'Desativar' : 'Ativar'}
                    >
                      {sub.active ? <ToggleRight size={24} /> : <ToggleLeft size={24} />}
                    </button>
                  </td>
                </tr>
              ))
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
    </div>
  );
}
