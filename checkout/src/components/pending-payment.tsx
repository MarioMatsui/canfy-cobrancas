import { ArrowLeft, CreditCard, LoaderCircle } from 'lucide-react';
import type { PublicActivePayment, PublicCharge } from '@/lib/types';
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
  payment,
  refreshIssue,
  onChangePaymentMethod,
}: {
  charge: PublicCharge;
  payment: PublicActivePayment;
  refreshIssue: boolean;
  onChangePaymentMethod: () => void;
}) {
  if (payment.method === 'PIX') {
    return (
      <CheckoutShell
        summary={<OrderSummary charge={charge} />}
        main={
          <PixPayment
            payment={payment}
            refreshIssue={refreshIssue}
            onChangePaymentMethod={onChangePaymentMethod}
          />
        }
      />
    );
  }

  const invoiceUrl = payment.invoiceUrl ? safeInvoiceUrl(payment.invoiceUrl) : null;

  return (
    <CheckoutShell
      summary={<OrderSummary charge={charge} />}
      main={
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
          <button type="button" onClick={onChangePaymentMethod}
            className="inline-flex items-center gap-2 rounded-lg px-1 py-1 text-sm font-semibold text-slate-600 transition hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />
            Alterar forma de pagamento
          </button>

          <div className="mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-canfy-50 text-canfy-600">
            <CreditCard aria-hidden="true" className="h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950">Pagamento com cartão</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            O pagamento é concluído na página segura da Asaas. Esta aba da CanFy pode permanecer aberta enquanto aguardamos a confirmação.
          </p>

          {invoiceUrl ? (
            <a href={invoiceUrl} target="_blank" rel="noopener noreferrer"
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2 sm:w-auto">
              <CreditCard aria-hidden="true" className="h-4 w-4" />
              Continuar pagamento com cartão
            </a>
          ) : (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
              O link seguro do cartão ainda não está disponível. Esta página continuará atualizando automaticamente.
            </p>
          )}

          <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-slate-600" role="status">
            <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin text-canfy-600" />
            Aguardando confirmação do pagamento
          </div>

          {refreshIssue && (
            <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">
              A atualização automática falhou na última tentativa. Seu pagamento continua preservado e tentaremos novamente.
            </p>
          )}
        </section>
      }
    />
  );
}
