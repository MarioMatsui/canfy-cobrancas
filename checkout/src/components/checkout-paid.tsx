import { CheckCircle2 } from 'lucide-react';
import type { PublicCharge } from '@/lib/types';
import { OrderSummary } from './order-summary';

export function CheckoutPaid({charge}:{charge:PublicCharge}) {
  return <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 lg:py-14">
    <section className="rounded-2xl border border-canfy-100 bg-white p-6 text-center shadow-card sm:p-9">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-canfy-50 text-canfy-600"><CheckCircle2 aria-hidden="true" className="h-9 w-9"/></div>
      <h1 className="mt-5 text-2xl font-bold text-slate-950 sm:text-3xl">Pagamento confirmado</h1>
      <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-600">Recebemos a confirmação do pagamento. Você não precisa realizar uma nova tentativa por este link.</p>
    </section>
    <div className="mt-6"><OrderSummary charge={charge} compact/></div>
  </main>;
}
