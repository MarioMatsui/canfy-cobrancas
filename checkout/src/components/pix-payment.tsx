import { Copy, LoaderCircle, QrCode } from 'lucide-react';

export type PixState = 'idle' | 'generating' | 'ready' | 'waiting' | 'paid';

export function PixPayment({state='idle',copyCode,onCopy,copied=false}:{state?:PixState;copyCode?:string;onCopy?:()=>void;copied?:boolean}) {
  if (state==='generating') return <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center" role="status"><LoaderCircle aria-hidden="true" className="mx-auto h-6 w-6 animate-spin text-canfy-600"/><p className="mt-3 text-sm font-medium text-slate-700">Gerando Pix...</p></div>;
  if ((state==='ready'||state==='waiting')&&copyCode) return <div className="rounded-xl border border-slate-200 bg-slate-50 p-5">
    <div className="mx-auto flex h-40 w-40 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white text-center text-xs text-slate-500">QR Code fornecido pelo backend</div>
    <label className="mt-5 block text-sm font-medium text-slate-700">Código Pix copia e cola<textarea readOnly rows={3} value={copyCode} className="mt-2 w-full resize-none rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-700"/></label>
    <button type="button" onClick={onCopy} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-canfy-500 px-4 py-3 text-sm font-semibold text-white"><Copy aria-hidden="true" className="h-4 w-4"/>{copied?'Código copiado':'Copiar código Pix'}</button>
    {state==='waiting'&&<p className="mt-3 text-center text-xs text-slate-500">Aguardando confirmação do pagamento...</p>}
  </div>;
  return <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-center"><div className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-white text-canfy-600 shadow-sm"><QrCode aria-hidden="true" className="h-5 w-5"/></div><p className="mt-3 text-sm font-semibold text-slate-800">Pix</p><p className="mx-auto mt-1 max-w-md text-xs leading-5 text-slate-500">A geração do QR Code será habilitada quando o backend tiver o endpoint público de início de pagamento. Nenhum código fictício é gerado nesta etapa.</p></div>;
}
