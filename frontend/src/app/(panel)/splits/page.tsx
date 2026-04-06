'use client';

import { useQuery } from '@tanstack/react-query';
import { GitBranch } from 'lucide-react';
import api from '@/lib/api';

interface SplitRule {
  id: string;
  type: string;
  value: number;
  description: string;
  active: boolean;
  chargeSubaccount: { name: string };
  receiverSubaccount: { name: string };
}

export default function SplitsPage() {
  const { data: rules, isLoading } = useQuery<SplitRule[]>({
    queryKey: ['split-rules'],
    queryFn: () => api.get('/splits/rules').then((r) => r.data),
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Splits de Pagamento</h1>
        <p className="text-gray-500 mt-1">Regras e histórico de splits</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <GitBranch size={20} />
            Regras Ativas
          </h2>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Pagador</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Recebedor</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase">Valor</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Carregando...</td>
              </tr>
            ) : !rules || rules.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhuma regra de split configurada</td>
              </tr>
            ) : (
              rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{rule.chargeSubaccount?.name}</td>
                  <td className="px-6 py-4">{rule.receiverSubaccount?.name}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex px-2 py-1 text-xs rounded-full font-medium bg-blue-100 text-blue-800">
                      {rule.type === 'PERCENTAGE' ? '%' : 'R$'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {rule.type === 'PERCENTAGE' ? `${rule.value}%` : `R$ ${Number(rule.value).toFixed(2)}`}
                  </td>
                  <td className="px-6 py-4 text-gray-600">{rule.description || '—'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${rule.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {rule.active ? 'Ativa' : 'Inativa'}
                    </span>
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
