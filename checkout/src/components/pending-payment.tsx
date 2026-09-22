import { Clock3, CreditCard, RefreshCw } from 'lucide-react';
import type { PublicCharge } from '@/lib/types';
import { CheckoutShell } from './checkout-shell';
import { OrderSummary } from './order-summary';
import { PixPayment } from './pix-payment';

function safeInvoiceUrl(value: string): string | null {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function PendingPayment({
  charge,
  refreshing,
  refreshIssue,
  onRefresh,
}: {
  charge: PublicCharge;
  refreshing: boolean;
  refreshIssue: boolean;
  onRefresh: () => void;
}) {
  const payment = charge.activePayment;

  if (payment?.method === 'PIX') {
    return (
      <CheckoutShell
        summary={<OrderSummary charge={charge} />}
        main={
          <PixPayment
            payment={payment}
            refreshing={refreshing}
            refreshIssue={refreshIssue}
            onRefresh={onRefresh}
          />
        }
      />
    );
  }

  if (payment?.method === 'CARD') {
    const invoiceUrl = payment.invoiceUrl ? safeInvoiceUrl(payment.invoiceUrl) : null;
    return (
      <CheckoutShell
        summary={<OrderSummary charge={charge} />}
        main={
          <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-canfy-50 text-canfy-600">
              <CreditCard aria-hidden="true" className="h-6 w-6" />
            </div>
            <h1 className="mt-5 text-2xl font-bold text-slate-950">
              Pagamento aguardando conclusão
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
              O pagamento com cartão é concluído na página segura da Asaas. Reabrir este link não cria uma nova cobrança.
            </p>

            {invoiceUrl && (
              <button
                type="button"
                onClick={() => window.location.assign(invoiceUrl)}
                className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2 sm:w-auto"
              >
                <CreditCard aria-hidden="true" className="h-4 w-4" />
                Continuar pagamento com cartão
              </button>
            )}

            {refreshIssue && (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
                Não conseguimos atualizar o status na última tentativa. O pagamento continua preservado.
              </p>
            )}

            <div className="mt-5">
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
              >
                <RefreshCw
                  aria-hidden="true"
                  className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')}
                />
                {refreshing ? 'Atualizando...' : 'Atualizar status'}
              </button>
            </div>
          </section>
        }
      />
    );
  }

  return (
    <CheckoutShell
      summary={<OrderSummary charge={charge} />}
      main={
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
            <Clock3 aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">
            Pagamento em processamento
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Existe uma tentativa de pagamento em andamento. Atualize o status para recuperar os dados disponíveis sem criar uma nova cobrança.
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"
          >
            <RefreshCw
              aria-hidden="true"
              className={'h-4 w-4 ' + (refreshing ? 'animate-spin' : '')}
            />
            {refreshing ? 'Atualizando...' : 'Atualizar status'}
          </button>
        </section>
      }
    />
  );
}
