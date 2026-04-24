'use client';

import { useQuery } from '@tanstack/react-query';
import { GitBranch, Stethoscope, Package } from 'lucide-react';
import api from '@/lib/api';

interface SplitHistory {
  id: string;
  value: number;
  percentage: number | null;
  fixedValue: number | null;
  status: string;
  createdAt: string;
  charge: { asaasId: string; value: number; status: string; customerName: string; description: string };
  receiverSubaccount: { name: string; type: string };
}

interface RevenueItem {
  id: string;
  name: string;
  type: string;
  totalReceived: number;
  totalPending: number;
}

export default function SplitsPage() {
  const { data: history, isLoading } = useQuery<SplitHistory[]>({
    queryKey: ['split-history'],
    queryFn: () => api.get('/splits/history').then((r) => r.data),
  });

  const { data: revenue } = useQuery<RevenueItem[]>({
    queryKey: ['split-revenue'],
    queryFn: () => api.get('/splits/revenue').then((r) => r.data),
  });

  const formatCurrency = (v: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Splits de Pagamento</h1>
        <p className="text-gray-500 mt-1">Receita por subconta e histórico de splits realizados</p>
      </div>

      {/* Receita por subconta */}
      {revenue && revenue.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {revenue.map((item) => {
            const isDoctor = item.type === 'DOCTOR';
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm border p-5">
                <div className="flex items-center gap-2 mb-3">
                  {isDoctor ? (
                    <Stethoscope size={18} className="text-blue-600" />
                  ) : (
                    <Package size={18} className="text-orange-600" />
                  )}
                  <span className="font-medium text-sm">{item.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isDoctor ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'}`}>
                    {isDoctor ? 'Médico' : 'Fornecedor'}
                  </span>
                </div>
                <p className="text-2xl font-bold text-green-600">{formatCurrency(item.totalReceived)}</p>
                {item.totalPending > 0 && (
                  <p className="text-sm text-yellow-600 mt-1">{formatCurrency(item.totalPending)} pendente</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Histórico */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch size={20} />
            Histórico de Splits
          </h2>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Recebedor</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cliente</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor Cobrança</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor Split</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Carregando...</td>
              </tr>
            ) : !history || history.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-6 py-12 text-center text-gray-500">
                  Nenhum split realizado ainda. Splits são registrados quando pagamentos são confirmados via webhook.
                </td>
              </tr>
            ) : (
              history.map((sr) => (
                <tr key={sr.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                      {sr.receiverSubaccount.type === 'DOCTOR' ? (
                        <Stethoscope size={16} className="text-blue-500" />
                      ) : (
                        <Package size={16} className="text-orange-500" />
                      )}
                      <span className="font-medium text-sm">{sr.receiverSubaccount.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{sr.charge.customerName}</td>
                  <td className="px-6 py-4 text-sm text-right">{formatCurrency(sr.charge.value)}</td>
                  <td className="px-6 py-4 text-sm text-center">
                    {sr.fixedValue != null ? `R$ fixo` : `${Number(sr.percentage)}%`}
                  </td>
                  <td className="px-6 py-4 text-sm text-right font-semibold">{formatCurrency(sr.value)}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                      sr.status === 'COMPLETED' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                    }`}>
                      {sr.status === 'COMPLETED' ? 'Pago' : 'Pendente'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-right text-gray-500">
                    {new Date(sr.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
