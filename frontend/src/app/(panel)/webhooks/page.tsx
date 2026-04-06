'use client';

import { useQuery } from '@tanstack/react-query';
import { Webhook } from 'lucide-react';
import api from '@/lib/api';

interface WebhookLog {
  id: string;
  event: string;
  status: string;
  createdAt: string;
}

const statusColors: Record<string, string> = {
  RECEIVED: 'bg-yellow-100 text-yellow-800',
  PROCESSED: 'bg-green-100 text-green-800',
  FAILED: 'bg-red-100 text-red-800',
};

export default function WebhooksPage() {
  const { data, isLoading } = useQuery<{ data: WebhookLog[]; total: number }>({
    queryKey: ['webhooks-logs'],
    queryFn: () => api.get('/webhooks/logs').then((r) => r.data),
  });

  const formatDate = (date: string) =>
    new Date(date).toLocaleString('pt-BR');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Webhooks</h1>
        <p className="text-gray-500 mt-1">Log de eventos recebidos do Asaas</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Webhook size={20} />
            Eventos Recentes
          </h2>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Evento</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Data</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-gray-500">Carregando...</td>
              </tr>
            ) : !data?.data || data.data.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-6 py-12 text-center text-gray-500">Nenhum evento registrado</td>
              </tr>
            ) : (
              data.data.map((log) => (
                <tr key={log.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-mono text-sm">{log.event}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${statusColors[log.status] || 'bg-gray-100'}`}>
                      {log.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-gray-600 text-sm">{formatDate(log.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
