import Image from 'next/image';
import { Instagram, Linkedin, LockKeyhole, Youtube } from 'lucide-react';

const socialLinkClass =
  'inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-canfy-200 hover:bg-canfy-50 hover:text-canfy-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2';

export function CheckoutHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/95">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-28 items-center justify-center rounded-xl bg-canfy-500 px-3 shadow-sm">
            <Image src="/logo-canfy.svg" alt="Canfy" width={96} height={31} priority />
          </div>

          <nav aria-label="Redes sociais da Canfy" className="flex items-center gap-1.5">
            <a
              href="https://www.instagram.com/canfy.brasil/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Instagram da Canfy"
              title="Instagram"
              className={socialLinkClass}
            >
              <Instagram aria-hidden="true" className="h-4 w-4" />
            </a>
            <a
              href="https://www.youtube.com/@canfybr/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="YouTube da Canfy"
              title="YouTube"
              className={socialLinkClass}
            >
              <Youtube aria-hidden="true" className="h-4 w-4" />
            </a>
            <a
              href="https://www.linkedin.com/company/canfybr/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="LinkedIn da Canfy"
              title="LinkedIn"
              className={socialLinkClass}
            >
              <Linkedin aria-hidden="true" className="h-4 w-4" />
            </a>
            <a
              href="https://www.reclameaqui.com.br/empresa/canfy-tecnologia-e-solucoes-ltda/"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Canfy no Reclame Aqui"
              title="Reclame Aqui"
              className={socialLinkClass}
            >
              <span aria-hidden="true" className="text-[10px] font-bold tracking-tight">RA</span>
            </a>
            <a
              href="https://share.google/KRQa2XpKOYIQXuwB6"
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Canfy no Google"
              title="Google"
              className={socialLinkClass}
            >
              <span aria-hidden="true" className="text-sm font-bold">G</span>
            </a>
          </nav>
        </div>

        <div className="flex w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600">
          <LockKeyhole aria-hidden="true" className="h-4 w-4 text-canfy-600" />
          <span>Checkout Canfy</span>
        </div>
      </div>
    </header>
  );
}
