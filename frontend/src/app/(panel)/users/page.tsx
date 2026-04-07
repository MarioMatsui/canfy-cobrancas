'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import toast from 'react-hot-toast';
import { Plus, Trash2, Shield, Headphones, X } from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { useRouter } from 'next/navigation';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN' | 'ATTENDANT';
  createdAt: string;
}

export default function UsersPage() {
  const { user: currentUser, isAdmin } = useAuth();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [formName, setFormName] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<'ADMIN' | 'ATTENDANT'>('ATTENDANT');

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'],
    queryFn: () => api.get('/users').then((r) => r.data),
    enabled: isAdmin,
  });

  const createMutation = useMutation({
    mutationFn: (payload: { name: string; email: string; password: string; role: string }) =>
      api.post('/users', payload),
    onSuccess: () => {
      toast.success('Usuário criado!');
      setShowForm(false);
      setFormName('');
      setFormEmail('');
      setFormPassword('');
      setFormRole('ATTENDANT');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao criar usuário');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => {
      toast.success('Usuário excluído');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    },
    onError: (error: unknown) => {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || 'Erro ao excluir');
    },
  });

  const handleCreate = () => {
    if (!formName || !formEmail || !formPassword) {
      toast.error('Preencha todos os campos');
      return;
    }
    if (formPassword.length < 6) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }
    createMutation.mutate({ name: formName, email: formEmail, password: formPassword, role: formRole });
  };

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Excluir o usuário "${name}"? Esta ação não pode ser desfeita.`)) return;
    deleteMutation.mutate(id);
  };

  // Redirect non-admin after hooks
  if (!isAdmin && currentUser) {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Usuários</h1>
          <p className="text-gray-500 mt-1">Gerencie os usuários e acessos da plataforma</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Novo Usuário
        </button>
      </div>

      {showForm && (
        <div className="bg-white rounded-xl border p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Novo Usuário</h2>
            <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600">
              <X size={20} />
            </button>
          </div>

          <div className="flex gap-3">
            <button
              onClick={() => setFormRole('ATTENDANT')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors text-center ${formRole === 'ATTENDANT' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            >
              <Headphones size={20} className="mx-auto mb-1" />
              <div className="text-sm font-medium">Atendimento</div>
              <div className="text-xs text-gray-500">Dashboard, Cobranças, Splits</div>
            </button>
            <button
              onClick={() => setFormRole('ADMIN')}
              className={`flex-1 p-3 rounded-lg border-2 transition-colors text-center ${formRole === 'ADMIN' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}
            >
              <Shield size={20} className="mx-auto mb-1" />
              <div className="text-sm font-medium">Administrador</div>
              <div className="text-xs text-gray-500">Acesso completo</div>
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome *</label>
              <input
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Maria Atendente"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email *</label>
              <input
                type="email"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="email@canfy.com.br"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Senha *</label>
              <input
                type="password"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                className="w-full rounded-lg border px-3 py-2 text-sm"
                placeholder="Mínimo 6 caracteres"
              />
            </div>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:text-gray-800">
              Cancelar
            </button>
            <button
              onClick={handleCreate}
              disabled={createMutation.isPending}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {createMutation.isPending ? 'Criando...' : 'Criar Usuário'}
            </button>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Nome</th>
              <th className="px-6 py-3 text-left text-xs font-semibold text-gray-500 uppercase">Email</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Perfil</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Criado em</th>
              <th className="px-6 py-3 text-center text-xs font-semibold text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {isLoading ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Carregando...</td>
              </tr>
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-gray-500">Nenhum usuário</td>
              </tr>
            ) : (
              users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{u.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{u.email}</td>
                  <td className="px-6 py-4 text-center">
                    <span
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                        u.role === 'ADMIN'
                          ? 'bg-purple-100 text-purple-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                    >
                      {u.role === 'ADMIN' ? <Shield size={12} /> : <Headphones size={12} />}
                      {u.role === 'ADMIN' ? 'Admin' : 'Atendimento'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-sm text-gray-500">
                    {new Date(u.createdAt).toLocaleDateString('pt-BR')}
                  </td>
                  <td className="px-6 py-4 text-center">
                    {u.id !== currentUser?.id ? (
                      <button
                        onClick={() => handleDelete(u.id, u.name)}
                        className="text-gray-400 hover:text-red-600 transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={18} />
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">Você</span>
                    )}
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
