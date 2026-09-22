'use client';

import { CreditCard, QrCode } from 'lucide-react';
import type { PaymentMethod } from '@/lib/types';
import { CardPayment } from './card-payment';
import { PixPayment } from './pix-payment';

export function PaymentMethodSelector({value,onChange,maxInstallments}:{value:PaymentMethod;onChange:(value:PaymentMethod)=>void;maxInstallments:number}) {
  return <div>
    <fieldset>
      <legend className="text-sm font-semibold text-slate-900">Como você prefere pagar?</legend>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className={'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-canfy-500 '+(value==='PIX'?'border-canfy-500 bg-canfy-50':'border-slate-200 bg-white hover:border-slate-300')}>
          <input type="radio" name="paymentMethod" value="PIX" checked={value==='PIX'} onChange={()=>onChange('PIX')} className="h-4 w-4 accent-[#09bb5a]"/>
          <QrCode aria-hidden="true" className="h-5 w-5 text-canfy-600"/><span className="text-sm font-semibold text-slate-800">Pix</span>
        </label>
        <label className={'flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition focus-within:ring-2 focus-within:ring-canfy-500 '+(value==='CREDIT_CARD'?'border-canfy-500 bg-canfy-50':'border-slate-200 bg-white hover:border-slate-300')}>
          <input type="radio" name="paymentMethod" value="CREDIT_CARD" checked={value==='CREDIT_CARD'} onChange={()=>onChange('CREDIT_CARD')} className="h-4 w-4 accent-[#09bb5a]"/>
          <CreditCard aria-hidden="true" className="h-5 w-5 text-canfy-600"/><span className="text-sm font-semibold text-slate-800">Cartão de crédito</span>
        </label>
      </div>
    </fieldset>
    <div className="mt-5">{value==='PIX'?<PixPayment/>:<CardPayment maxInstallments={maxInstallments}/>}</div>
  </div>;
}
