'use client';

import { useMutation } from '@tanstack/react-query';
import { Save, User, Eye, EyeOff } from 'lucide-react';
import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';
import { useAuth } from '@/contexts/auth';

export default function SettingsPage() {
  const { user: currentUser, isAdmin, refetchUser } = useAuth();
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
      {/* Perfil do usuário */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Configurações</h1>
          <p className="text-gray-500 mt-1">Editar seu perfil</p>
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
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email {!isAdmin && <span className="text-xs text-gray-400 font-normal">(apenas admin pode alterar)</span>}
            </label>
            <input
              type="email"
              value={profileEmail}
              onChange={(e) => setProfileEmail(e.target.value)}
              disabled={!isAdmin}
              className="w-full rounded-lg border px-3 py-2 text-sm disabled:bg-gray-50 disabled:text-gray-500 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nova Senha</label>
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
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            <Save size={16} />
            {profileMutation.isPending ? 'Salvando...' : 'Salvar Perfil'}
          </button>
        </div>
      </div>
    </div>
  );
}
