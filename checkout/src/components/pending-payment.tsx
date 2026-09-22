import { Clock3, RefreshCw } from 'lucide-react';
import type { PublicCharge } from '@/lib/types';
import { CheckoutShell } from './checkout-shell';
import { OrderSummary } from './order-summary';

export function PendingPayment({charge,refreshing,refreshIssue,onRefresh}:{charge:PublicCharge;refreshing:boolean;refreshIssue:boolean;onRefresh:()=>void}) {
  return <CheckoutShell summary={<OrderSummary charge={charge}/>} main={<section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-card sm:p-8">
    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600"><Clock3 aria-hidden="true" className="h-6 w-6"/></div>
    <h1 className="mt-5 text-2xl font-bold text-slate-950">Pagamento em processamento</h1>
    <p className="mt-3 max-w-xl text-sm leading-6 text-slate-600">Já existe um pagamento em andamento para este pedido. Esta página acompanha o status pelo backend e não cria uma nova tentativa ao ser atualizada.</p>
    {refreshIssue && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800" role="status">Não conseguimos atualizar o status na última tentativa. O pedido continua preservado.</p>}
    <button type="button" onClick={onRefresh} disabled={refreshing} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"><RefreshCw aria-hidden="true" className={'h-4 w-4 '+(refreshing?'animate-spin':'')}/>{refreshing?'Atualizando...':'Atualizar status'}</button>
    <p className="mt-3 text-xs text-slate-500">O status também é atualizado periodicamente, sem gerar novas cobranças.</p>
  </section>}/>;
}
