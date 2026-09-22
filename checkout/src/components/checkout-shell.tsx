import type { ReactNode } from 'react';

export function CheckoutShell({ main, summary }: { main: ReactNode; summary: ReactNode }) {
  return (
    <main className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-5 px-4 py-6 sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-8 lg:px-8 lg:py-10">
      <div className="order-2 min-w-0 lg:order-1">{main}</div>
      <aside className="order-1 min-w-0 lg:order-2"><div className="lg:sticky lg:top-6">{summary}</div></aside>
    </main>
  );
}
