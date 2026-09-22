import { Check } from 'lucide-react';
export type CheckoutStep = 'review' | 'address' | 'payment';
export function StepIndicator({steps,current}:{steps:Array<{id:CheckoutStep;label:string}>;current:CheckoutStep}) {
  const currentIndex=steps.findIndex(step=>step.id===current);
  return <ol className="flex items-center gap-2" aria-label="Etapas do pagamento">{steps.map((step,index)=>{const done=index<currentIndex;const active=index===currentIndex;return <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2"><div className="flex min-w-0 flex-1 items-center gap-2"><span className={'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold '+(done||active?'bg-canfy-500 text-white':'border border-slate-300 bg-white text-slate-500')} aria-current={active?'step':undefined}>{done?<Check aria-hidden="true" className="h-4 w-4"/>:index+1}</span><span className={'truncate text-xs font-medium '+(active?'text-slate-900':'text-slate-500')}>{step.label}</span></div>{index<steps.length-1&&<span aria-hidden="true" className="h-px w-4 shrink-0 bg-slate-200 sm:w-8"/>}</li>;})}</ol>;
}
