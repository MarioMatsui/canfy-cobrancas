import { CheckCircle2 } from 'lucide-react';
import { firstName } from '@/lib/format';
import type { PublicCharge } from '@/lib/types';
import { CheckoutShell } from './checkout-shell';
import { OrderSummary } from './order-summary';

export function CheckoutPaid({ charge }: { charge: PublicCharge }) {
  const customerFirstName = firstName(charge.customerName);

  return (
    <CheckoutShell
      main={
        <section className="rounded-2xl border border-canfy-100 bg-white p-6 shadow-card sm:p-8">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-canfy-50 text-canfy-600">
            <CheckCircle2 aria-hidden="true" className="h-8 w-8" />
          </div>
          <h1 className="mt-5 text-2xl font-bold text-slate-950 sm:text-3xl">
            {customerFirstName ? `Obrigado, ${customerFirstName}!` : 'Obrigado!'}
          </h1>
          <p className="mt-3 text-base font-semibold text-canfy-700">Pagamento confirmado com sucesso</p>
          <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">
            Recebemos seu pagamento e já registramos tudo por aqui. Você não precisa realizar uma nova tentativa neste link. A Canfy dará continuidade ao seu atendimento.
          </p>
        </section>
      }
      summary={<OrderSummary charge={charge} />}
    />
  );
}
