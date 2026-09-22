'use client';

import { useEffect, useRef, useState } from 'react';
import { CreditCard, LoaderCircle, QrCode, ShieldCheck } from 'lucide-react';
import { firstName } from '@/lib/format';
import { startPublicPayment } from '@/lib/public-api';
import type {
  PaymentMethod,
  PublicCharge,
  PublicPaymentStartResponse,
} from '@/lib/types';

function friendlyStartError(kind: string): string {
  if (kind === 'gone') {
    return 'Este link de pagamento não está mais disponível.';
  }
  if (kind === 'not_found') {
    return 'Não encontramos este pagamento. Confira o link enviado pela CanFy.';
  }
  return 'Não foi possível iniciar o pagamento agora. Tente novamente em alguns instantes.';
}

function safeInvoiceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function CheckoutFlow({
  charge,
  onStarted,
}: {
  charge: PublicCharge;
  onStarted: (result: PublicPaymentStartResponse) => void;
}) {
  const [loadingMethod, setLoadingMethod] = useState<PaymentMethod | null>(null);
  const [switchMethod, setSwitchMethod] = useState<PaymentMethod | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestController = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => requestController.current?.abort();
  }, []);

  const start = async (method: PaymentMethod) => {
    if (loadingMethod) return;

    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    setLoadingMethod(method);
    setError(null);

    try {
      const result = await startPublicPayment(charge.publicToken, method, controller.signal);
      if (result.kind !== 'success') {
        setError(friendlyStartError(result.kind));
        return;
      }

      onStarted(result.data);

      if (method === 'CARD' && result.data.orderStatus !== 'PAID') {
        const invoiceUrl = result.data.activePayment?.invoiceUrl;
        const destination = invoiceUrl ? safeInvoiceUrl(invoiceUrl) : null;
        if (!destination) {
          setError('Não foi possível abrir o pagamento com cartão agora. Atualize a página e tente novamente.');
          return;
        }
        window.location.assign(destination);
      }
    } catch (requestError: unknown) {
      if (!(requestError instanceof DOMException && requestError.name === 'AbortError')) {
        setError('Não foi possível iniciar o pagamento agora. Tente novamente em alguns instantes.');
      }
    } finally {
      if (!controller.signal.aborted) setLoadingMethod(null);
    }
  };

  const chooseMethod = (method: PaymentMethod) => {
    if (loadingMethod) return;

    if (charge.activePayment && charge.activePayment.method !== method) {
      setError(null);
      setSwitchMethod(method);
      return;
    }

    void start(method);
  };

  const confirmMethodSwitch = () => {
    if (!switchMethod) return;
    const method = switchMethod;
    setSwitchMethod(null);
    void start(method);
  };

  const customerFirstName = firstName(charge.customerName);
  const currentMethodLabel = charge.activePayment?.method === 'PIX' ? 'Pix' : 'cartão';
  const switchMethodLabel = switchMethod === 'PIX' ? 'Pix' : 'Cartão';

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-canfy-50 text-canfy-600">
          <ShieldCheck aria-hidden="true" className="h-5 w-5" />
        </div>
        <h1 className="mt-4 text-xl font-bold text-slate-950 sm:text-2xl">
          {customerFirstName
            ? customerFirstName + ', escolha como pagar'
            : 'Escolha como pagar'}
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-6 text-slate-600">
          Confira o resumo do pedido e selecione a forma de pagamento.
        </p>
      </div>

      <div className="mt-6">
        <p className="text-sm font-semibold text-slate-900">Forma de pagamento</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => chooseMethod('PIX')}
            disabled={loadingMethod !== null}
            aria-busy={loadingMethod === 'PIX'}
            className="group flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-canfy-300 hover:bg-canfy-50/40 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canfy-50 text-canfy-600">
              {loadingMethod === 'PIX' ? (
                <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
              ) : (
                <QrCode aria-hidden="true" className="h-5 w-5" />
              )}
            </span>
            <span>
              <span className="block text-base font-bold text-slate-900">Pix</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                QR Code e código copia e cola
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => chooseMethod('CARD')}
            disabled={loadingMethod !== null}
            aria-busy={loadingMethod === 'CARD'}
            className="group flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 bg-white px-5 py-4 text-left transition hover:border-canfy-300 hover:bg-canfy-50/40 disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canfy-50 text-canfy-600">
              {loadingMethod === 'CARD' ? (
                <LoaderCircle aria-hidden="true" className="h-5 w-5 animate-spin" />
              ) : (
                <CreditCard aria-hidden="true" className="h-5 w-5" />
              )}
            </span>
            <span>
              <span className="block text-base font-bold text-slate-900">Cartão</span>
              <span className="mt-0.5 block text-xs leading-5 text-slate-500">
                Pagamento seguro na página da Asaas
              </span>
            </span>
          </button>
        </div>
      </div>

      {switchMethod && charge.activePayment && (
        <div
          className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4"
          role="alertdialog"
          aria-labelledby="switch-payment-title"
          aria-describedby="switch-payment-description"
        >
          <p id="switch-payment-title" className="text-sm font-bold text-slate-900">
            Alterar forma de pagamento?
          </p>
          <p
            id="switch-payment-description"
            className="mt-1 text-sm leading-6 text-slate-600"
          >
            Vamos verificar o pagamento atual em {currentMethodLabel}. Se ele ainda estiver
            pendente, essa tentativa será encerrada antes de iniciar {switchMethodLabel}. O
            pedido e este link de pagamento continuam os mesmos.
          </p>
          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={() => setSwitchMethod(null)}
              className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={confirmMethodSwitch}
              className="inline-flex items-center justify-center rounded-xl bg-canfy-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
            >
              Alterar para {switchMethodLabel}
            </button>
          </div>
        </div>
      )}

      {error && (
        <p
          className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-5 text-red-700"
          role="alert"
        >
          {error}
        </p>
      )}

      <p className="mt-5 text-xs leading-5 text-slate-500">
        A CanFy não solicita nem armazena os dados do seu cartão neste checkout.
      </p>
    </section>
  );
}
