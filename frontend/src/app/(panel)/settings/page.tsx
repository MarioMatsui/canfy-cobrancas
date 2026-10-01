'use client';

import { useMutation } from '@tanstack/react-query';
import { Eye, EyeOff, KeyRound, Save, User } from 'lucide-react';
import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { IntegrationsSettings } from '@/components/integrations-settings';
import { useAuth } from '@/contexts/auth';
import api from '@/lib/api';

type SettingsTab = 'profile' | 'integrations';

export default function SettingsPage() {
  const { user: currentUser, isAdmin, refetchUser } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [profilePassword, setProfilePassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (currentUser) {
      setProfileName(currentUser.name);
      setProfileEmail(currentUser.email);
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAdmin && activeTab === 'integrations') setActiveTab('profile');
  }, [activeTab, isAdmin]);

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
    if (isAdmin && profileEmail && profileEmail !== currentUser?.email) payload.email = profileEmail;
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
        <p className="mt-1 text-gray-500">
          {isAdmin ? 'Gerencie seu perfil e integrações do sistema' : 'Editar seu perfil'}
        </p>
      </div>

      {isAdmin && (
        <div className="flex w-fit rounded-lg border border-gray-200 bg-white p-1">
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'profile' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <User size={16} />
            Meu Perfil
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('integrations')}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === 'integrations' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            <KeyRound size={16} />
            Integrações
          </button>
        </div>
      )}

      {activeTab === 'profile' && (
        <div className="space-y-4 rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
          <div className="mb-2 flex items-center gap-3">
            <User size={20} className="text-gray-600" />
            <h2 className="text-lg font-semibold">Meu Perfil</h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nome</label>
              <input
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">
                Email {!isAdmin && <span className="text-xs font-normal text-gray-400">(apenas admin pode alterar)</span>}
              </label>
              <input
                type="email"
                value={profileEmail}
                onChange={(e) => setProfileEmail(e.target.value)}
                disabled={!isAdmin}
                className="w-full rounded-lg border px-3 py-2 text-sm disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Nova Senha</label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={profilePassword}
                  onChange={(e) => setProfilePassword(e.target.value)}
                  className="w-full rounded-lg border px-3 py-2 pr-10 text-sm"
                  placeholder="Deixe vazio para manter"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-3 text-gray-400 hover:text-gray-600"
                  aria-label={showPassword ? 'Esconder senha' : 'Mostrar senha'}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={handleProfileSave}
              disabled={profileMutation.isPending}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              <Save size={16} />
              {profileMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
            </button>
          </div>
        </div>
      )}

      {activeTab === 'integrations' && isAdmin && <IntegrationsSettings />}
    </div>
  );
}
