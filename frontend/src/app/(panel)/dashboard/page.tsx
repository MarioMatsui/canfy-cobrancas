'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, Users, GitBranch, AlertTriangle } from 'lucide-react';
import api from '@/lib/api';

interface DashboardOverview {
  charges: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    totalValue: number;
    paidValue: number;
  };
  subaccounts: { total: number; active: number };
  splits: { total: number };
}

function StatCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color,
}: {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-sm text-gray-400 mt-1">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${color}`}>
          <Icon size={24} className="text-white" />
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const { data, isLoading } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-6">
        <div className="h-8 bg-gray-200 rounded w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral do sistema</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Total Cobranças"
          value={data?.charges.total || 0}
          subtitle={formatCurrency(data?.charges.totalValue || 0)}
          icon={Receipt}
          color="bg-blue-500"
        />
        <StatCard
          title="Pagas"
          value={data?.charges.paid || 0}
          subtitle={formatCurrency(data?.charges.paidValue || 0)}
          icon={Receipt}
          color="bg-green-500"
        />
        <StatCard
          title="Atrasadas"
          value={data?.charges.overdue || 0}
          icon={AlertTriangle}
          color="bg-red-500"
        />
        <StatCard
          title="Subcontas Ativas"
          value={data?.subaccounts.active || 0}
          subtitle={`${data?.subaccounts.total || 0} total`}
          icon={Users}
          color="bg-purple-500"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Splits Realizados</h2>
          <div className="flex items-center gap-3">
            <GitBranch size={32} className="text-blue-500" />
            <div>
              <p className="text-3xl font-bold">{data?.splits.total || 0}</p>
              <p className="text-gray-500 text-sm">splits processados</p>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Status das Cobranças</h2>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pendentes</span>
              <span className="font-semibold text-yellow-600">{data?.charges.pending || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Pagas</span>
              <span className="font-semibold text-green-600">{data?.charges.paid || 0}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-gray-500">Atrasadas</span>
              <span className="font-semibold text-red-600">{data?.charges.overdue || 0}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
