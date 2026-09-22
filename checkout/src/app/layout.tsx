import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import './globals.css';
import { CheckoutHeader } from '@/components/checkout-header';

export const metadata: Metadata = {
  title: 'Pagamento | CanFy',
  description: 'Checkout de pagamento CanFy',
  robots: { index: false, follow: false, noarchive: true },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#ffffff' };

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR"><body><div className="flex min-h-screen flex-col">
      <CheckoutHeader />
      <div className="flex flex-1 flex-col">{children}</div>
      <footer className="border-t border-slate-200 bg-white px-4 py-5 text-center text-xs text-slate-500">CanFy · Pagamento</footer>
    </div></body></html>
  );
}
