'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  Check,
  Clipboard,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

type IntegrationStatus = 'ACTIVE' | 'REVOKED';

type Integration = {
  id: string;
  name: string;
  keyPrefix: string;
  maskedKey: string;
  status: IntegrationStatus;
  scopes: string[];
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
};

type SecretResponse = Integration & { secretKey: string };

const SCOPE_OPTIONS = [
  { value: 'products:read', label: 'Consultar produtos' },
  { value: 'subaccounts:read', label: 'Consultar fornecedores' },
  { value: 'doctors:read', label: 'Consultar médicos' },
  { value: 'charges:create', label: 'Criar cobranças' },
  { value: 'charges:read', label: 'Consultar cobranças' },
  { value: 'charges:cancel', label: 'Cancelar cobranças' },
] as const;

const scopeLabel = new Map(SCOPE_OPTIONS.map((scope) => [scope.value, scope.label]));

function formatDate(value: string | null) {
  if (!value) return 'Nunca utilizada';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function IntegrationsSettings() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>([]);
  const [secret, setSecret] = useState<{ key: string; title: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirm, setConfirm] = useState<{
    type: 'revoke' | 'rotate';
    integration: Integration;
  } | null>(null);

  const integrationsQuery = useQuery({
    queryKey: ['integrations'],
    queryFn: async () => {
      const { data } = await api.get<Integration[]>('/integrations');
      return data;
    },
  });

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ['integrations'] });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post<SecretResponse>('/integrations', { name, scopes });
      return data;
    },
    onSuccess: async (data) => {
      setCreateOpen(false);
      setName('');
      setScopes([]);
      setSecret({ key: data.secretKey, title: `Chave criada para ${data.name}` });
      setCopied(false);
      await refresh();
    },
    onError: () => toast.error('Não foi possível criar a integração'),
  });

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => api.post(`/integrations/${id}/revoke`),
    onSuccess: async () => {
      setConfirm(null);
      toast.success('Integração revogada');
      await refresh();
    },
    onError: () => toast.error('Não foi possível revogar a integração'),
  });

  const rotateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<SecretResponse>(`/integrations/${id}/rotate`);
      return data;
    },
    onSuccess: async (data) => {
      setConfirm(null);
      setSecret({ key: data.secretKey, title: `Nova chave de ${data.name}` });
      setCopied(false);
      await refresh();
    },
    onError: () => toast.error('Não foi possível rotacionar a chave'),
  });

  const isSubmitting = createMutation.isPending || revokeMutation.isPending || rotateMutation.isPending;
  const canCreate = useMemo(() => name.trim().length >= 2 && scopes.length > 0, [name, scopes]);

  const toggleScope = (scope: string) => {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    );
  };

  const copySecret = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.key);
      setCopied(true);
      toast.success('Chave copiada');
    } catch {
      toast.error('Não foi possível copiar automaticamente');
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Integrações</h2>
          <p className="mt-1 text-sm text-gray-500">
            Gerencie credenciais de sistemas externos. As chaves secretas são exibidas uma única vez.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setCreateOpen(true)}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          <Plus size={16} />
          Criar integração
        </button>
      </div>

      {integrationsQuery.isLoading && (
        <div className="flex min-h-40 items-center justify-center rounded-xl border border-gray-100 bg-white">
          <Loader2 className="mr-2 animate-spin text-gray-400" size={18} />
          <span className="text-sm text-gray-500">Carregando integrações...</span>
        </div>
      )}

      {integrationsQuery.isError && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-5">
          <p className="text-sm font-medium text-red-700">Não foi possível carregar as integrações.</p>
          <button
            type="button"
            onClick={() => integrationsQuery.refetch()}
            className="mt-3 text-sm font-medium text-red-700 underline"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {!integrationsQuery.isLoading && !integrationsQuery.isError && integrationsQuery.data?.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-6 py-12 text-center">
          <KeyRound className="mx-auto text-gray-300" size={32} />
          <h3 className="mt-3 font-medium text-gray-900">Nenhuma integração cadastrada</h3>
          <p className="mt-1 text-sm text-gray-500">
            Crie uma integração para gerar a primeira credencial de API.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {integrationsQuery.data?.map((integration) => (
          <div key={integration.id} className="rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 space-y-3">
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-gray-900">{integration.name}</h3>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                      integration.status === 'ACTIVE'
                        ? 'bg-emerald-50 text-emerald-700'
                        : 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {integration.status === 'ACTIVE' ? 'Ativa' : 'Revogada'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-3 text-sm text-gray-600 sm:grid-cols-2 xl:grid-cols-3">
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wide text-gray-400">Chave</span>
                    <code className="mt-1 block break-all text-xs text-gray-700">{integration.maskedKey}</code>
                  </div>
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wide text-gray-400">Criada em</span>
                    <span className="mt-1 block">{formatDate(integration.createdAt)}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-medium uppercase tracking-wide text-gray-400">Último uso</span>
                    <span className="mt-1 block">{formatDate(integration.lastUsedAt)}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  {integration.scopes.map((scope) => (
                    <span key={scope} className="rounded-md bg-blue-50 px-2 py-1 text-xs text-blue-700">
                      {scopeLabel.get(scope) ?? scope}
                    </span>
                  ))}
                </div>

                {integration.revokedAt && (
                  <p className="text-xs text-gray-500">Revogada em {formatDate(integration.revokedAt)}</p>
                )}
              </div>

              {integration.status === 'ACTIVE' && (
                <div className="flex shrink-0 flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setConfirm({ type: 'rotate', integration })}
                    className="inline-flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <RefreshCw size={15} />
                    Rotacionar chave
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirm({ type: 'revoke', integration })}
                    className="rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50"
                  >
                    Revogar
                  </button>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {createOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-5 py-4">
              <div>
                <h3 className="font-semibold text-gray-900">Criar integração</h3>
                <p className="mt-1 text-xs text-gray-500">Conceda somente as permissões necessárias.</p>
              </div>
              <button type="button" onClick={() => setCreateOpen(false)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>
            <div className="space-y-5 p-5">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Nome da integração</label>
                <input
                  autoFocus
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={80}
                  placeholder="Ex.: MsgDesk"
                  className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-blue-500"
                />
              </div>
              <fieldset>
                <legend className="mb-2 text-sm font-medium text-gray-700">Permissões</legend>
                <div className="space-y-2">
                  {SCOPE_OPTIONS.map((scope) => (
                    <label key={scope.value} className="flex cursor-pointer items-center gap-3 rounded-lg border border-gray-100 px-3 py-2.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={scopes.includes(scope.value)}
                        onChange={() => toggleScope(scope.value)}
                        className="h-4 w-4 rounded border-gray-300 text-blue-600"
                      />
                      <div>
                        <span className="block text-sm text-gray-800">{scope.label}</span>
                        <code className="text-xs text-gray-400">{scope.value}</code>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button type="button" onClick={() => setCreateOpen(false)} className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50">
                Cancelar
              </button>
              <button
                type="button"
                disabled={!canCreate || createMutation.isPending}
                onClick={() => createMutation.mutate()}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {createMutation.isPending ? 'Criando...' : 'Criar integração'}
              </button>
            </div>
          </div>
        </div>
      )}

      {secret && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-xl rounded-xl bg-white shadow-xl">
            <div className="border-b px-5 py-4">
              <div className="flex items-center gap-2 text-emerald-700">
                <ShieldCheck size={20} />
                <h3 className="font-semibold">{secret.title}</h3>
              </div>
            </div>
            <div className="space-y-4 p-5">
              <div className="flex gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 shrink-0" size={18} />
                <p>
                  <strong>Esta chave será exibida apenas uma vez.</strong> Guarde-a em um local seguro.
                  Depois de fechar esta janela, ela não poderá ser recuperada.
                </p>
              </div>
              <div className="rounded-lg border bg-gray-50 p-3">
                <code className="block break-all text-sm text-gray-800">{secret.key}</code>
              </div>
              <button
                type="button"
                onClick={copySecret}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied ? <Check size={16} /> : <Clipboard size={16} />}
                {copied ? 'Chave copiada' : 'Copiar chave'}
              </button>
            </div>
            <div className="flex justify-end border-t px-5 py-4">
              <button
                type="button"
                onClick={() => {
                  setSecret(null);
                  setCopied(false);
                }}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
              >
                Já guardei a chave
              </button>
            </div>
          </div>
        </div>
      )}

      {confirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white shadow-xl">
            <div className="p-5">
              <h3 className="font-semibold text-gray-900">
                {confirm.type === 'revoke' ? 'Revogar integração?' : 'Rotacionar chave?'}
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                {confirm.type === 'revoke'
                  ? `A integração “${confirm.integration.name}” deixará de autenticar imediatamente. O registro será mantido para histórico.`
                  : `A chave atual de “${confirm.integration.name}” deixará de funcionar imediatamente e uma nova chave será exibida apenas uma vez.`}
              </p>
            </div>
            <div className="flex justify-end gap-2 border-t px-5 py-4">
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => setConfirm(null)}
                className="rounded-lg border px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => {
                  if (confirm.type === 'revoke') revokeMutation.mutate(confirm.integration.id);
                  else rotateMutation.mutate(confirm.integration.id);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${
                  confirm.type === 'revoke' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {isSubmitting ? 'Processando...' : confirm.type === 'revoke' ? 'Revogar' : 'Rotacionar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
