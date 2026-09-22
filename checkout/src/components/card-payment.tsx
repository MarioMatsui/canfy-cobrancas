import { CreditCard } from 'lucide-react';

export function CardPayment({maxInstallments}:{maxInstallments:number}) {
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
    <div className="mb-5 flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-canfy-600 shadow-sm"><CreditCard aria-hidden="true" className="h-5 w-5"/></div><div><p className="text-sm font-semibold text-slate-800">Cartão de crédito</p><p className="text-xs text-slate-500">Campos preparados; coleta desabilitada nesta etapa.</p></div></div>
    <fieldset disabled aria-describedby="card-disabled-note" className="grid gap-4 sm:grid-cols-2 disabled:opacity-60">
      <label className="sm:col-span-2 text-sm font-medium text-slate-700">Número do cartão<input inputMode="numeric" autoComplete="cc-number" placeholder="0000 0000 0000 0000" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm"/></label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700">Nome do titular<input autoComplete="cc-name" placeholder="Como aparece no cartão" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm"/></label>
      <label className="text-sm font-medium text-slate-700">Validade<input inputMode="numeric" autoComplete="cc-exp" placeholder="MM/AA" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm"/></label>
      <label className="text-sm font-medium text-slate-700">CVV<input inputMode="numeric" autoComplete="cc-csc" placeholder="000" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm"/></label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700">Parcelamento<select defaultValue="1" className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-3 text-sm">{Array.from({length:Math.max(1,maxInstallments)},(_,index)=>index+1).map(installments=><option key={installments} value={installments}>{installments}x</option>)}</select></label>
    </fieldset>
    <p id="card-disabled-note" className="mt-4 text-xs leading-5 text-slate-500">Os dados reais do cartão só serão coletados quando a estratégia de processamento seguro estiver implementada. PAN e CVV não são persistidos, enviados ou registrados por este checkout agora.</p>
  </div>;
}
