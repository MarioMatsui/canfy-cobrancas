'use client';

import { useState } from 'react';
import { ArrowLeft, ArrowRight, MapPin } from 'lucide-react';
import { formatPhone, formatPostalCode } from '@/lib/format';
import { prepareShippingAddress, validateShippingAddress, type AddressErrors } from '@/lib/shipping-address-service';
import type { ShippingAddressInput, ShippingAddressPayload } from '@/lib/types';

const STATES = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB','PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'];

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-xs font-medium text-red-600">{message}</p>;
}

export function AddressForm({
  customerName,
  initialValue,
  onBack,
  onContinue,
}: {
  customerName: string;
  initialValue?: ShippingAddressPayload;
  onBack: () => void;
  onContinue: (address: ShippingAddressPayload) => void;
}) {
  const [values, setValues] = useState<ShippingAddressInput>(() => ({
    recipientName: initialValue?.recipientName ?? customerName,
    recipientPhone: initialValue?.recipientPhone ? formatPhone(initialValue.recipientPhone) : '',
    postalCode: initialValue?.postalCode ? formatPostalCode(initialValue.postalCode) : '',
    street: initialValue?.street ?? '',
    number: initialValue?.number ?? '',
    complement: initialValue?.complement ?? '',
    neighborhood: initialValue?.neighborhood ?? '',
    city: initialValue?.city ?? '',
    state: initialValue?.state ?? '',
    reference: initialValue?.reference ?? '',
  }));
  const [errors, setErrors] = useState<AddressErrors>({});

  const setValue = (field: keyof ShippingAddressInput, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = () => {
    const nextErrors = validateShippingAddress(values);
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      const firstField = Object.keys(nextErrors)[0];
      document.getElementById(firstField)?.focus();
      return;
    }
    onContinue(prepareShippingAddress(values));
  };

  const inputClass = (field: keyof ShippingAddressInput) =>
    'mt-1.5 w-full rounded-xl border bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:ring-2 focus:ring-canfy-500/20 ' +
    (errors[field] ? 'border-red-400 focus:border-red-500' : 'border-slate-300 focus:border-canfy-500');

  return <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-card sm:p-7">
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-canfy-50 text-canfy-600"><MapPin aria-hidden="true" className="h-5 w-5"/></div>
      <div><h1 className="text-xl font-bold text-slate-950 sm:text-2xl">Endereço de entrega</h1><p className="mt-1 text-sm leading-6 text-slate-600">Informe onde este pedido deve ser entregue.</p></div>
    </div>

    <div className="mt-7 grid gap-4 sm:grid-cols-2">
      <label className="text-sm font-medium text-slate-700" htmlFor="recipientName">Nome do destinatário
        <input id="recipientName" name="recipientName" autoComplete="name" value={values.recipientName} onChange={(event)=>setValue('recipientName',event.target.value)} aria-invalid={Boolean(errors.recipientName)} aria-describedby={errors.recipientName?'recipientName-error':undefined} className={inputClass('recipientName')}/>
        <FieldError id="recipientName-error" message={errors.recipientName}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="recipientPhone">Telefone
        <input id="recipientPhone" name="recipientPhone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 99999-9999" value={values.recipientPhone} onChange={(event)=>setValue('recipientPhone',formatPhone(event.target.value))} aria-invalid={Boolean(errors.recipientPhone)} aria-describedby={errors.recipientPhone?'recipientPhone-error':undefined} className={inputClass('recipientPhone')}/>
        <FieldError id="recipientPhone-error" message={errors.recipientPhone}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="postalCode">CEP
        <input id="postalCode" name="postalCode" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000" value={values.postalCode} onChange={(event)=>setValue('postalCode',formatPostalCode(event.target.value))} aria-invalid={Boolean(errors.postalCode)} aria-describedby={errors.postalCode?'postalCode-error':undefined} className={inputClass('postalCode')}/>
        <FieldError id="postalCode-error" message={errors.postalCode}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="number">Número
        <input id="number" name="number" autoComplete="off" placeholder="123 ou S/N" value={values.number} onChange={(event)=>setValue('number',event.target.value)} aria-invalid={Boolean(errors.number)} aria-describedby={errors.number?'number-error':undefined} className={inputClass('number')}/>
        <FieldError id="number-error" message={errors.number}/>
      </label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700" htmlFor="street">Rua / Avenida
        <input id="street" name="street" autoComplete="address-line1" value={values.street} onChange={(event)=>setValue('street',event.target.value)} aria-invalid={Boolean(errors.street)} aria-describedby={errors.street?'street-error':undefined} className={inputClass('street')}/>
        <FieldError id="street-error" message={errors.street}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="complement">Complemento <span className="font-normal text-slate-400">(opcional)</span>
        <input id="complement" name="complement" autoComplete="address-line2" placeholder="Apto, bloco, sala..." value={values.complement} onChange={(event)=>setValue('complement',event.target.value)} className={inputClass('complement')}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="neighborhood">Bairro
        <input id="neighborhood" name="neighborhood" value={values.neighborhood} onChange={(event)=>setValue('neighborhood',event.target.value)} aria-invalid={Boolean(errors.neighborhood)} aria-describedby={errors.neighborhood?'neighborhood-error':undefined} className={inputClass('neighborhood')}/>
        <FieldError id="neighborhood-error" message={errors.neighborhood}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="city">Cidade
        <input id="city" name="city" autoComplete="address-level2" value={values.city} onChange={(event)=>setValue('city',event.target.value)} aria-invalid={Boolean(errors.city)} aria-describedby={errors.city?'city-error':undefined} className={inputClass('city')}/>
        <FieldError id="city-error" message={errors.city}/>
      </label>
      <label className="text-sm font-medium text-slate-700" htmlFor="state">UF
        <select id="state" name="state" autoComplete="address-level1" value={values.state} onChange={(event)=>setValue('state',event.target.value)} aria-invalid={Boolean(errors.state)} aria-describedby={errors.state?'state-error':undefined} className={inputClass('state')}>
          <option value="">Selecione</option>{STATES.map((state)=><option key={state} value={state}>{state}</option>)}
        </select>
        <FieldError id="state-error" message={errors.state}/>
      </label>
      <label className="sm:col-span-2 text-sm font-medium text-slate-700" htmlFor="reference">Ponto de referência <span className="font-normal text-slate-400">(opcional)</span>
        <input id="reference" name="reference" placeholder="Ex.: próximo à portaria principal" value={values.reference} onChange={(event)=>setValue('reference',event.target.value)} className={inputClass('reference')}/>
      </label>
    </div>

    <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
      <button type="button" onClick={onBack} className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"><ArrowLeft aria-hidden="true" className="h-4 w-4"/>Voltar</button>
      <button type="button" onClick={submit} className="inline-flex items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2">Continuar para pagamento<ArrowRight aria-hidden="true" className="h-4 w-4"/></button>
    </div>
  </section>;
}
