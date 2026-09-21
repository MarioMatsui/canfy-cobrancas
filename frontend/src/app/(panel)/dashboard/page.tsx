'use client';

import { useQuery } from '@tanstack/react-query';
import { Receipt, Users, Stethoscope, Package, AlertCircle, TrendingUp, Building2 } from 'lucide-react';
import api from '@/lib/api';

interface DashboardOverview {
  charges: {
    total: number;
    paid: number;
    pending: number;
    overdue: number;
    totalValue: number;
    paidValue: number;
    customCount: number;
    reusableCount: number;
  };
  subaccounts: {
    total: number;
    active: number;
    doctorCount: number;
    supplierCount: number;
  };
  revenue: {
    doctorRevenue: number;
    supplierRevenue: number;
    mainAccountRevenue: number;
  };
}

interface RevenueItem {
  id: string;
  name: string;
  type: string;
  totalReceived: number;
  totalPending: number;
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
  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const { data, isLoading, isError, refetch } = useQuery<DashboardOverview>({
    queryKey: ['dashboard-overview'],
    queryFn: () => api.get('/dashboard/overview').then((r) => r.data),
  });

  const { data: doctorRevenue, isError: isDoctorRevenueError } = useQuery<RevenueItem[]>({
    queryKey: ['dashboard-revenue-doctor'],
    queryFn: () => api.get('/dashboard/revenue', { params: { type: 'DOCTOR' } }).then((r) => r.data),
  });

  const { data: supplierRevenue, isError: isSupplierRevenueError } = useQuery<RevenueItem[]>({
    queryKey: ['dashboard-revenue-supplier'],
    queryFn: () => api.get('/dashboard/revenue', { params: { type: 'SUPPLIER' } }).then((r) => r.data),
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

  if (isError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Visão geral do sistema de cobranças e splits</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-red-100">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-red-100 rounded-lg">
              <AlertCircle size={20} className="text-red-600" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">Não foi possível carregar o resumo da dashboard</h2>
              <p className="text-sm text-gray-500 mt-1">
                Os dados não foram substituídos por zeros. Tente novamente; se o erro persistir, verifique o endpoint
                /dashboard/overview no backend.
              </p>
              <button
                type="button"
                onClick={() => refetch()}
                className="mt-4 px-4 py-2 rounded-lg bg-gray-900 text-white text-sm font-medium hover:bg-gray-800"
              >
                Tentar novamente
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-500 mt-1">Visão geral do sistema de cobranças e splits</p>
      </div>

      {/* Cards principais */}
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
          icon={TrendingUp}
          color="bg-green-500"
        />
        <StatCard
          title="Atrasadas"
          value={data?.charges.overdue || 0}
          icon={AlertCircle}
          color="bg-red-500"
        />
        <StatCard
          title="Subcontas Ativas"
          value={data?.subaccounts.active || 0}
          subtitle={`${data?.subaccounts.doctorCount || 0} médicos · ${data?.subaccounts.supplierCount || 0} fornecedores`}
          icon={Users}
          color="bg-purple-500"
        />
      </div>

      {/* Receita por tipo */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div key="doctor-revenue" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-blue-100 rounded-lg">
              <Stethoscope size={20} className="text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold">Receita Médicos</h2>
          </div>
          <p className="text-3xl font-bold text-blue-600">{formatCurrency(data?.revenue.doctorRevenue || 0)}</p>
          <p className="text-sm text-gray-400 mt-1">{data?.subaccounts.doctorCount || 0} médicos cadastrados</p>
        </div>

        <div key="supplier-revenue" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-orange-100 rounded-lg">
              <Package size={20} className="text-orange-600" />
            </div>
            <h2 className="text-lg font-semibold">Receita Fornecedores</h2>
          </div>
          <p className="text-3xl font-bold text-orange-600">{formatCurrency(data?.revenue.supplierRevenue || 0)}</p>
          <p className="text-sm text-gray-400 mt-1">{data?.subaccounts.supplierCount || 0} fornecedores cadastrados</p>
        </div>

        <div key="main-revenue" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-2 bg-green-100 rounded-lg">
              <Building2 size={20} className="text-green-600" />
            </div>
            <h2 className="text-lg font-semibold">Conta Principal</h2>
          </div>
          <p className="text-3xl font-bold text-green-600">{formatCurrency(data?.revenue.mainAccountRevenue || 0)}</p>
          <p className="text-sm text-gray-400 mt-1">Restante automático de cada cobrança</p>
        </div>
      </div>

      {/* Tipos de cobrança + Status */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div key="charge-types" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Tipos de Cobrança</h2>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-indigo-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Receipt size={20} className="text-indigo-600" />
                <span className="font-medium">Avulsas (Custom)</span>
              </div>
              <span className="text-2xl font-bold text-indigo-600">{data?.charges.customCount || 0}</span>
            </div>
            <div className="flex items-center justify-between p-3 bg-emerald-50 rounded-lg">
              <div className="flex items-center gap-3">
                <Receipt size={20} className="text-emerald-600" />
                <span className="font-medium">Reutilizáveis</span>
              </div>
              <span className="text-2xl font-bold text-emerald-600">{data?.charges.reusableCount || 0}</span>
            </div>
          </div>
        </div>

        <div key="charge-status" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
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

      {/* Receita por médico e fornecedor */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div key="per-doctor" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Receita por Médico</h2>
          {isDoctorRevenueError ? (
            <p className="text-red-500 text-sm py-4 text-center">Erro ao carregar a receita por médico</p>
          ) : !doctorRevenue || doctorRevenue.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3">
              {doctorRevenue.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Stethoscope size={16} className="text-blue-500" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(item.totalReceived)}</p>
                    {item.totalPending > 0 && (
                      <p className="text-xs text-yellow-500">{formatCurrency(item.totalPending)} pendente</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div key="per-supplier" className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h2 className="text-lg font-semibold mb-4">Receita por Fornecedor</h2>
          {isSupplierRevenueError ? (
            <p className="text-red-500 text-sm py-4 text-center">Erro ao carregar a receita por fornecedor</p>
          ) : !supplierRevenue || supplierRevenue.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">Nenhum dado disponível</p>
          ) : (
            <div className="space-y-3">
              {supplierRevenue.map((item) => (
                <div key={item.id} className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0">
                  <div className="flex items-center gap-2">
                    <Package size={16} className="text-orange-500" />
                    <span className="text-sm font-medium">{item.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-green-600">{formatCurrency(item.totalReceived)}</p>
                    {item.totalPending > 0 && (
                      <p className="text-xs text-yellow-500">{formatCurrency(item.totalPending)} pendente</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
