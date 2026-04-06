'use client';

import { useQuery } from '@tanstack/react-query';
import { Plus, Search, XCircle, Send } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface Charge {
  id: string;
  asaasId: string;
  billingType: string;
  value: number;
  dueDate: string;
  description: string;
  status: string;
  subaccount: { name: string };
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

export default function ChargesPage() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading, refetch } = useQuery<PaginatedResponse>({
    queryKey: ['charges', page, statusFilter],
    queryFn: () =>
      api.get('/charges', { params: { page, limit: 20, status: statusFilter || undefined } }).then((r) => r.data),
  });

  const cancelCharge = async (id: string) => {
    try {
      await api.delete(`/charges/${id}`);
      toast.success('Cobrança cancelada');
      refetch();
    } catch {
      toast.error('Erro ao cancelar cobrança');
    }
  };

  const resendNotification = async (id: string) => {
    try {
      await api.post(`/charges/${id}/resend`);
      toast.success('Notificação reenviada');
    } catch {
      toast.error('Erro ao reenviar notificação');
    }
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const formatDate = (date: string) =>
    new Date(date).toLocaleDateString('pt-BR');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cobranças</h1>
          <p className="text-gray-500 mt-1">Gerencie cobranças e pagamentos</p>
        </div>
        <button className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors">
          <Plus size={20} />
          Nova Cobrança
        </button>
      </div>

      <div className="flex gap-4">
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
        >
          <option value="">Todos os status</option>
          <option value="PENDING">Pendente</option>
          <option value="CONFIRMED">Pago</option>
          <option value="OVERDUE">Atrasado</option>
          <option value="REFUNDED">Estornado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Subconta</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Vencimento</th>
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
                  Nenhuma cobrança encontrada
                </td>
              </tr>
            ) : (
              data?.data.map((charge) => (
                <tr key={charge.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{charge.subaccount?.name || '—'}</td>
                  <td className="px-6 py-4 text-gray-600">{charge.billingType}</td>
                  <td className="px-6 py-4 text-right font-medium">{formatCurrency(charge.value)}</td>
                  <td className="px-6 py-4 text-gray-600">{formatDate(charge.dueDate)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${statusColors[charge.status] || 'bg-gray-100'}`}>
                      {statusLabels[charge.status] || charge.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      {charge.status === 'PENDING' && (
                        <>
                          <button
                            onClick={() => resendNotification(charge.id)}
                            className="text-gray-400 hover:text-blue-600 transition-colors"
                            title="Reenviar notificação"
                          >
                            <Send size={18} />
                          </button>
                          <button
                            onClick={() => cancelCharge(charge.id)}
                            className="text-gray-400 hover:text-red-600 transition-colors"
                            title="Cancelar cobrança"
                          >
                            <XCircle size={18} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-3 border-t border-gray-200 bg-gray-50">
            <span className="text-sm text-gray-500">{data.total} cobrança(s)</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 rounded border text-sm disabled:opacity-50">
                Anterior
              </button>
              <span className="px-3 py-1 text-sm">{page} / {data.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="px-3 py-1 rounded border text-sm disabled:opacity-50">
                Próxima
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
