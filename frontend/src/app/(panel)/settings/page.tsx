'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, RotateCcw } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface Setting {
  id: string;
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

const settingLabels: Record<string, { label: string; type: 'percentage' | 'number' | 'currency' }> = {
  default_doctor_percentage: { label: 'Percentual padrão para médicos', type: 'percentage' },
  default_supplier_percentage: { label: 'Percentual padrão para fornecedores', type: 'percentage' },
  max_installments_custom: { label: 'Parcelas máx. (cobrança avulsa)', type: 'number' },
  max_installments_reusable: { label: 'Parcelas máx. (cobrança reutilizável)', type: 'number' },
  default_reusable_value: { label: 'Valor padrão (cobrança reutilizável)', type: 'currency' },
};

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [formValues, setFormValues] = useState<Record<string, string>>({});

  const { data: settings, isLoading } = useQuery<Setting[]>({
    queryKey: ['settings'],
    queryFn: () => api.get('/settings').then((r) => r.data),
  });

  useEffect(() => {
    if (settings) {
      const values: Record<string, string> = {};
      settings.forEach((s) => { values[s.key] = s.value; });
      setFormValues(values);
    }
  }, [settings]);

  const seedMutation = useMutation({
    mutationFn: () => api.post('/settings/seed'),
    onSuccess: () => {
      toast.success('Configurações padrão criadas');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Erro ao criar configurações padrão'),
  });

  const saveMutation = useMutation({
    mutationFn: async (entries: Array<{ key: string; value: string }>) => {
      for (const entry of entries) {
        const existing = settings?.find((s) => s.key === entry.key);
        await api.post('/settings', {
          key: entry.key,
          value: entry.value,
          description: existing?.description || settingLabels[entry.key]?.label || '',
        });
      }
    },
    onSuccess: () => {
      toast.success('Configurações salvas');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: () => toast.error('Erro ao salvar configurações'),
  });

  const handleSave = () => {
    const entries = Object.entries(formValues).map(([key, value]) => ({ key, value }));
    saveMutation.mutate(entries);
  };

  const getSuffix = (key: string) => {
    const config = settingLabels[key];
    if (!config) return '';
    if (config.type === 'percentage') return '%';
    if (config.type === 'currency') return 'R$';
    return '';
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500 mt-1">Parâmetros padrão do sistema de cobranças e splits</p>
        </div>
        <div className="flex gap-3">
          {(!settings || settings.length === 0) && (
            <button
              onClick={() => seedMutation.mutate()}
              disabled={seedMutation.isPending}
              className="flex items-center gap-2 bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors disabled:opacity-50"
            >
              <RotateCcw size={20} />
              Criar Padrões
            </button>
          )}
          <button
            onClick={handleSave}
            disabled={saveMutation.isPending || !settings || settings.length === 0}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={20} />
            Salvar
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="animate-pulse space-y-4">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-200 rounded-xl" />
          ))}
        </div>
      ) : !settings || settings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-12 text-center">
          <Settings size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">Nenhuma configuração encontrada.</p>
          <p className="text-gray-400 text-sm mt-1">Clique em &quot;Criar Padrões&quot; para inicializar.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 divide-y">
          {settings.map((setting) => {
            const config = settingLabels[setting.key];
            return (
              <div key={setting.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between px-6 py-4 gap-2">
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 text-sm sm:text-base">
                    {config?.label || setting.key}
                  </p>
                  {setting.description && (
                    <p className="text-xs sm:text-sm text-gray-400">{setting.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-2 w-full sm:w-48 shrink-0">
                  {getSuffix(setting.key) === 'R$' && (
                    <span className="text-gray-400 text-sm">R$</span>
                  )}
                  <input
                    type="number"
                    value={formValues[setting.key] || ''}
                    onChange={(e) => setFormValues({ ...formValues, [setting.key]: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 text-right"
                    step={config?.type === 'percentage' || config?.type === 'currency' ? '0.01' : '1'}
                    min="0"
                  />
                  {getSuffix(setting.key) === '%' && (
                    <span className="text-gray-400 text-sm">%</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
