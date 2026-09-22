'use client';

import { useMemo, useState } from 'react';
import { ArrowLeft, ArrowRight, CalendarClock, MapPin, PackageCheck, Stethoscope } from 'lucide-react';
import { firstName, formatDate } from '@/lib/format';
import type { PaymentMethod, PublicCharge, ShippingAddressPayload } from '@/lib/types';
import { AddressForm } from './address-form';
import { PaymentMethodSelector } from './payment-method-selector';
import { StepIndicator, type CheckoutStep } from './step-indicator';

export function CheckoutFlow({ charge }: { charge: PublicCharge }) {
  const needsAddress = charge.orderKind === 'PRODUCT';
  const [step, setStep] = useState<CheckoutStep>('review');
  const [address, setAddress] = useState<ShippingAddressPayload>();
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX');

  const steps = useMemo(
    () => needsAddress
      ? [
          { id: 'review' as const, label: 'Pedido' },
          { id: 'address' as const, label: 'Entrega' },
          { id: 'payment' as const, label: 'Pagamento' },
        ]
      : [
          { id: 'review' as const, label: 'Pedido' },
          { id: 'payment' as const, label: 'Pagamento' },
        ],
    [needsAddress],
  );

  const validStep = steps.some((entry) => entry.id === step) ? step : 'review';
  const expiration = charge.expiresAt ? formatDate(charge.expiresAt) : null;

  if (validStep === 'address' && needsAddress) {
    return <div className="space-y-5">
      <StepIndicator steps={steps} current="address" />
      <AddressForm
        customerName={charge.customerName}
        initialValue={address}
        onBack={() => setStep('review')}
        onContinue={(nextAddress) => {
          setAddress(nextAddress);
          setStep('payment');
        }}
      />
    </div>;
  }

  if (validStep === 'payment') {
    return <div className="space-y-5">
      <StepIndicator steps={steps} current="payment" />
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Pagamento</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">Escolha a forma de pagamento para este pedido.</p>
        </div>

        {needsAddress && address && <div className="mt-5 flex items-start justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 p-4">
          <div className="flex min-w-0 gap-3">
            <MapPin aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-canfy-600" />
            <div className="min-w-0 text-sm text-slate-600">
              <p className="font-semibold text-slate-800">Entrega para {address.recipientName}</p>
              <p className="mt-1 break-words">{address.street}, {address.number}{address.complement ? ` · ${address.complement}` : ''}</p>
              <p>{address.neighborhood} · {address.city}/{address.state}</p>
            </div>
          </div>
          <button type="button" onClick={() => setStep('address')} className="shrink-0 text-xs font-semibold text-canfy-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500">Editar</button>
        </div>}

        <div className="mt-6"><PaymentMethodSelector value={paymentMethod} onChange={setPaymentMethod} maxInstallments={charge.maxInstallments} /></div>
        <div className="mt-6 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500">
          O processamento ainda não está habilitado nesta etapa do projeto. Recarregar ou abrir esta tela não cria uma cobrança no Asaas.
        </div>
        <div className="mt-6">
          <button type="button" onClick={() => setStep(needsAddress ? 'address' : 'review')} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2">
            <ArrowLeft aria-hidden="true" className="h-4 w-4" />Voltar
          </button>
        </div>
      </section>
    </div>;
  }

  const Icon = charge.orderKind === 'CONSULTATION' ? Stethoscope : PackageCheck;
  const customerFirstName = firstName(charge.customerName);

  return <div className="space-y-5">
    <StepIndicator steps={steps} current="review" />
    <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-canfy-50 text-canfy-600"><Icon aria-hidden="true" className="h-5 w-5" /></div>
        <div>
          <h1 className="text-xl font-bold text-slate-950 sm:text-2xl">{customerFirstName ? `${customerFirstName}, confira seu pedido` : 'Confira seu pedido'}</h1>
          <p className="mt-1 text-sm leading-6 text-slate-600">Revise as informações antes de seguir para {needsAddress ? 'a entrega e o pagamento' : 'o pagamento'}.</p>
        </div>
      </div>

      <div className="mt-6 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
        <div className="flex items-center justify-between gap-4"><span>Tipo</span><span className="font-semibold text-slate-800">{charge.orderKind === 'PRODUCT' ? 'Produtos' : charge.orderKind === 'CONSULTATION' ? 'Consulta' : 'Pagamento'}</span></div>
        <div className="flex items-center justify-between gap-4"><span>Itens</span><span className="font-semibold text-slate-800">{charge.items.length}</span></div>
        {expiration && <div className="flex items-start justify-between gap-4 border-t border-slate-200 pt-3"><span className="inline-flex items-center gap-2"><CalendarClock aria-hidden="true" className="h-4 w-4" /> Validade</span><span className="text-right font-semibold text-slate-800">{expiration}</span></div>}
      </div>

      <button type="button" onClick={() => setStep(needsAddress ? 'address' : 'payment')} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3.5 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2 sm:w-auto">
        {needsAddress ? 'Continuar para entrega' : 'Continuar para pagamento'}<ArrowRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </section>
  </div>;
}
