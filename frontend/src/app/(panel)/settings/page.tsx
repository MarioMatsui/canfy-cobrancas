'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Settings, Save, RotateCcw, User } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/auth';

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
  const { user: currentUser, isAdmin, refetchUser } = useAuth();
  const [formValues, setFormValues] = useState<Record<string, string>>({});
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');

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

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name);
      setProfileEmail(currentUser.email);
    }
  }, [currentUser]);

  const profileMutation = useMutation({
    mutationFn: (payload: { name?: string; email?: string; password?: string }) =>
      api.put('/users/me', payload),
    onSuccess: () => {
      toast.success('Perfil atualizado');
      refetchUser();
      setProfilePassword('');
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao atualizar perfil');
    },
  });

  const handleProfileSave = () => {
    const payload: { name?: string; email?: string; password?: string } = {};
    if (profileName && profileName !== currentUser?.name) payload.name = profileName;
    if (profileEmail && profileEmail !== currentUser?.email) payload.email = profileEmail;
    if (profilePassword) {
      if (profilePassword.length < 6) {
        toast.error('Senha deve ter pelo menos 6 caracteres');
        return;
      }
      payload.password = profilePassword;
    }
    if (Object.keys(payload).length === 0) {
      toast.error('Nenhuma alteração detectada');
      return;
    }
    profileMutation.mutate(payload);
  };

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
      {/* Perfil do usuário */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500 mt-1">{isAdmin ? 'Parâmetros do sistema e perfil' : 'Editar seu perfil'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <User size={20} className="text-gray-600" />
          <h2 className="text-lg font-semibold">Meu Perfil</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
            <input
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
            <input
              type="password"
              value={profilePassword}
              onChange={(e) => setProfilePassword(e.target.value)}
              className="w-full rounded-lg border px-3 py-2 text-sm"
              placeholder="Deixe vazio para manter"
            />
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleProfileSave}
            disabled={profileMutation.isPending}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {profileMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </div>

      {/* Configurações do sistema (apenas admin) */}
      {isAdmin && (
        <>
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-900">Parâmetros do Sistema</h2>
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
        </>
      )}
    </div>
  );
}
