import Image from 'next/image';
import { LockKeyhole } from 'lucide-react';

export function CheckoutHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/95">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-28 items-center justify-center rounded-xl bg-canfy-500 px-3 shadow-sm">
            <Image src="/logo-canfy.svg" alt="CanFy" width={96} height={31} priority />
          </div>
          <div className="hidden sm:block">
            <p className="text-sm font-semibold text-slate-800">Pagamento CanFy</p>
            <p className="text-xs text-slate-500">Ambiente de pagamento</p>
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          <LockKeyhole aria-hidden="true" className="h-4 w-4 text-canfy-600" />
          <span>Checkout CanFy</span>
        </div>
      </div>
    </header>
  );
}
