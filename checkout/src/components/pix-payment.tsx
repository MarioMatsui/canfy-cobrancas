'use client';

import Image from 'next/image';
import { useState } from 'react';
import { ArrowLeft, Check, Copy, LoaderCircle } from 'lucide-react';
import { formatDateTime, formatMoney } from '@/lib/format';
import type { PublicActivePayment } from '@/lib/types';

async function copyWithFallback(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }

  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.opacity = '0';
  document.body.appendChild(field);
  field.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(field);
  if (!copied) throw new Error('COPY_FAILED');
}

export function PixPayment({
  payment,
  refreshIssue,
  onChangePaymentMethod,
}: {
  payment: PublicActivePayment;
  refreshIssue: boolean;
  onChangePaymentMethod: () => void;
}) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const expiration = payment.pixExpirationDate
    ? formatDateTime(payment.pixExpirationDate)
    : null;
  const qrSource = payment.pixQrCode
    ? payment.pixQrCode.startsWith('data:')
      ? payment.pixQrCode
      : 'data:image/png;base64,' + payment.pixQrCode
    : null;

  const copy = async () => {
    if (!payment.pixCopyPaste) return;
    try {
      await copyWithFallback(payment.pixCopyPaste);
      setCopyState('copied');
      window.setTimeout(() => setCopyState('idle'), 2500);
    } catch {
      setCopyState('failed');
    }
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <button
        type="button"
        onClick={onChangePaymentMethod}
        className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
      >
        <ArrowLeft aria-hidden="true" className="h-4 w-4" />
        Alterar forma de pagamento
      </button>

      <div className="mt-4 text-center">
        <p className="text-sm font-semibold text-canfy-700">Pagamento via Pix</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">
          {formatMoney(payment.amount)}
        </h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Escaneie o QR Code ou copie o código Pix abaixo.
        </p>
      </div>

      {qrSource && payment.pixCopyPaste ? (
        <>
          <div className="mx-auto mt-6 w-fit rounded-2xl border border-slate-200 bg-white p-3 shadow-sm">
            <Image
              src={qrSource}
              alt="QR Code Pix para pagamento"
              width={256}
              height={256}
              unoptimized
              className="h-auto w-[min(68vw,256px)] max-w-64"
            />
          </div>

          <label className="mt-6 block text-sm font-semibold text-slate-800" htmlFor="pix-code">
            Pix Copia e Cola
          </label>
          <textarea
            id="pix-code"
            readOnly
            rows={3}
            value={payment.pixCopyPaste}
            onFocus={(event) => event.currentTarget.select()}
            className="mt-2 w-full resize-none break-all rounded-xl border border-slate-300 bg-slate-50 p-3 text-xs leading-5 text-slate-700 outline-none focus:border-canfy-500 focus:ring-2 focus:ring-canfy-500/20"
          />
          <button
            type="button"
            onClick={() => void copy()}
            className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
          >
            {copyState === 'copied' ? (
              <Check aria-hidden="true" className="h-4 w-4" />
            ) : (
              <Copy aria-hidden="true" className="h-4 w-4" />
            )}
            {copyState === 'copied' ? 'Código copiado' : 'Copiar código Pix'}
          </button>
          {copyState === 'failed' && (
            <p className="mt-2 text-center text-xs text-red-600" role="alert">
              Não foi possível copiar automaticamente. Selecione o código acima e copie manualmente.
            </p>
          )}
        </>
      ) : (
        <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm leading-6 text-amber-900">
          Não foi possível recuperar o QR Code agora. A atualização automática tentará novamente.
        </div>
      )}

      <div className="mt-5 border-t border-slate-100 pt-5 text-center">
        {expiration && (
          <p className="text-xs text-slate-500">Este Pix expira em {expiration}.</p>
        )}
        <div className="mt-3 inline-flex items-center gap-2 text-sm font-medium text-slate-600" role="status">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-canfy-600" />
          Aguardando confirmação do pagamento
        </div>
        {refreshIssue && (
          <p className="mt-3 text-xs leading-5 text-amber-700">
            A última atualização de status falhou, mas seu Pix continua preservado.
          </p>
        )}
      </div>
    </section>
  );
}
