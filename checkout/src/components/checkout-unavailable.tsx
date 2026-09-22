import { AlertCircle, FileQuestion, RefreshCw, TimerOff } from 'lucide-react';

type UnavailableKind = 'not_found' | 'gone' | 'temporary_error' | 'unexpected_response';
const copy: Record<UnavailableKind,{title:string;body:string}> = {
  not_found:{title:'Não encontramos este pagamento.',body:'Confira se você abriu exatamente o link enviado pela CanFy.'},
  gone:{title:'Este link de pagamento não está mais disponível.',body:'Entre em contato com a CanFy caso ainda precise concluir este pedido.'},
  temporary_error:{title:'Não foi possível carregar o pagamento agora.',body:'Sua cobrança não foi alterada. Tente novamente em instantes.'},
  unexpected_response:{title:'Não foi possível exibir este pagamento.',body:'Tente novamente. Se o problema continuar, fale com a CanFy.'},
};

export function CheckoutUnavailable({kind,onRetry}:{kind:UnavailableKind;onRetry?:()=>void}) {
  const Icon = kind === 'not_found' ? FileQuestion : kind === 'gone' ? TimerOff : AlertCircle;
  const content = copy[kind];
  return <main className="mx-auto flex w-full max-w-xl flex-1 items-center px-4 py-14 sm:px-6"><section className="w-full rounded-2xl border border-slate-200 bg-white p-7 text-center shadow-card sm:p-10">
    <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-600"><Icon aria-hidden="true" className="h-7 w-7"/></div>
    <h1 className="mt-5 text-xl font-bold text-slate-950 sm:text-2xl">{content.title}</h1>
    <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-slate-600">{content.body}</p>
    {onRetry && (kind === 'temporary_error' || kind === 'unexpected_response') && <button type="button" onClick={onRetry} className="mt-6 inline-flex items-center justify-center gap-2 rounded-xl bg-canfy-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2"><RefreshCw aria-hidden="true" className="h-4 w-4"/>Tentar novamente</button>}
  </section></main>;
}
