'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, ToggleLeft, ToggleRight } from 'lucide-react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

interface ServiceType {
  id: string;
  name: string;
  description: string;
  splitPercentage: number;
  active: boolean;
  _count: { charges: number };
}

export default function ServiceTypesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', description: '', splitPercentage: '' });

  const { data: serviceTypes, isLoading } = useQuery<ServiceType[]>({
    queryKey: ['service-types'],
    queryFn: () => api.get('/service-types').then((r) => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; splitPercentage: number }) =>
      api.post('/service-types', data),
    onSuccess: () => {
      toast.success('Tipo de serviço criado!');
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      resetForm();
    },
    onError: () => toast.error('Erro ao criar tipo de serviço'),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { name?: string; description?: string; splitPercentage?: number } }) =>
      api.put(`/service-types/${id}`, data),
    onSuccess: () => {
      toast.success('Tipo de serviço atualizado!');
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
      resetForm();
    },
    onError: () => toast.error('Erro ao atualizar'),
  });

  const toggleMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/service-types/${id}/toggle`),
    onSuccess: () => {
      toast.success('Status atualizado');
      queryClient.invalidateQueries({ queryKey: ['service-types'] });
    },
  });

  const resetForm = () => {
    setForm({ name: '', description: '', splitPercentage: '' });
    setShowForm(false);
    setEditingId(null);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description,
      splitPercentage: parseFloat(form.splitPercentage),
    };

    if (editingId) {
      updateMutation.mutate({ id: editingId, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  const startEdit = (st: ServiceType) => {
    setForm({ name: st.name, description: st.description || '', splitPercentage: String(st.splitPercentage) });
    setEditingId(st.id);
    setShowForm(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Tipos de Serviço</h1>
          <p className="text-gray-500 mt-1">Configure os tipos de serviço e seus percentuais de split</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={20} />
          Novo Tipo
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
          <h2 className="text-lg font-semibold">{editingId ? 'Editar' : 'Novo'} Tipo de Serviço</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
              <input
                type="text"
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: Atendimento Médico"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Descrição</label>
              <input
                type="text"
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: Consultas médicas"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Split (%)</label>
              <input
                type="number"
                required
                min="0.01"
                max="100"
                step="0.01"
                value={form.splitPercentage}
                onChange={(e) => setForm({ ...form, splitPercentage: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Ex: 15"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button type="submit" className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
              {editingId ? 'Salvar' : 'Criar'}
            </button>
            <button type="button" onClick={resetForm} className="px-4 py-2 rounded-lg border hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Nome</th>
              <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase">Descrição</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Split %</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Cobranças</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
              <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase">Ações</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {isLoading ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Carregando...</td></tr>
            ) : !serviceTypes || serviceTypes.length === 0 ? (
              <tr><td colSpan={6} className="px-6 py-12 text-center text-gray-500">Nenhum tipo de serviço cadastrado</td></tr>
            ) : (
              serviceTypes.map((st) => (
                <tr key={st.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 font-medium">{st.name}</td>
                  <td className="px-6 py-4 text-gray-600">{st.description || '—'}</td>
                  <td className="px-6 py-4 text-center">
                    <span className="inline-flex px-3 py-1 text-sm rounded-full font-bold bg-blue-100 text-blue-800">
                      {Number(st.splitPercentage)}%
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center text-gray-600">{st._count.charges}</td>
                  <td className="px-6 py-4 text-center">
                    <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${st.active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                      {st.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => startEdit(st)} className="text-gray-400 hover:text-blue-600 transition-colors" title="Editar">
                        <Pencil size={18} />
                      </button>
                      <button onClick={() => toggleMutation.mutate(st.id)} className="text-gray-400 hover:text-blue-600 transition-colors" title={st.active ? 'Desativar' : 'Ativar'}>
                        {st.active ? <ToggleRight size={22} /> : <ToggleLeft size={22} />}
                      </button>
                    </div>
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
