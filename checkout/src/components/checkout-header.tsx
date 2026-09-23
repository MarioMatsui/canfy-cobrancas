import Image from 'next/image';
import { LockKeyhole } from 'lucide-react';

const socialLinkClass =
  'group inline-flex h-8 w-8 items-center justify-center focus-visible:rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canfy-500 focus-visible:ring-offset-2';

const socialLinks = [
  {
    href: 'https://www.instagram.com/canfy.brasil/',
    label: 'Instagram da Canfy',
    title: 'Instagram',
    icon: '/redesSociais/instagram.svg',
  },
  {
    href: 'https://www.youtube.com/@canfybr/',
    label: 'YouTube da Canfy',
    title: 'YouTube',
    icon: '/redesSociais/youtube.svg',
  },
  {
    href: 'https://www.linkedin.com/company/canfybr/',
    label: 'LinkedIn da Canfy',
    title: 'LinkedIn',
    icon: '/redesSociais/linkedin.svg',
  },
  {
    href: 'https://www.reclameaqui.com.br/empresa/canfy-tecnologia-e-solucoes-ltda/',
    label: 'Canfy no Reclame Aqui',
    title: 'Reclame Aqui',
    icon: '/redesSociais/reclameAqui.svg',
  },
  {
    href: 'https://share.google/KRQa2XpKOYIQXuwB6',
    label: 'Canfy no Google',
    title: 'Google',
    icon: '/redesSociais/google.svg',
  },
] as const;

export function CheckoutHeader() {
  return (
    <header className="border-b border-slate-200/80 bg-white/95">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-11 w-28 items-center justify-center rounded-xl bg-canfy-500 px-3 shadow-sm">
            <Image src="/logo-canfy.svg" alt="Canfy" width={96} height={31} priority />
          </div>

          <nav aria-label="Redes sociais da Canfy" className="flex items-center gap-1.5">
            {socialLinks.map((social) => (
              <a
                key={social.title}
                href={social.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={social.label}
                title={social.title}
                className={socialLinkClass}
              >
                <Image
                  src={social.icon}
                  alt=""
                  width={20}
                  height={20}
                  aria-hidden="true"
                  className="h-5 w-5 object-contain transition-[filter] duration-150 ease-out group-hover:brightness-75 group-focus-visible:brightness-75"
                />
              </a>
            ))}
          </nav>
        </div>

        <div className="hidden w-fit items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-600 sm:flex">
          <LockKeyhole aria-hidden="true" className="h-4 w-4 text-canfy-600" />
          <span>Checkout Canfy</span>
        </div>
      </div>
    </header>
  );
}
