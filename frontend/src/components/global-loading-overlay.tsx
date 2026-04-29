'use client';

import { useEffect, useState } from 'react';
import { useIsFetching, useIsMutating } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';

export function GlobalLoadingOverlay() {
  const fetching = useIsFetching();
  const mutating = useIsMutating();
  const busy = fetching + mutating > 0;
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!busy) {
      setShow(false);
      return;
    }
    const t = setTimeout(() => setShow(true), 250);
    return () => clearTimeout(t);
  }, [busy]);

  if (!show) return null;

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/30 backdrop-blur-[1px] flex items-center justify-center pointer-events-auto"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="flex items-center gap-3 bg-white rounded-xl shadow-lg px-5 py-3">
        <Loader2 className="animate-spin text-blue-600" size={22} />
        <span className="text-sm font-medium text-gray-700">Carregando...</span>
      </div>
    </div>
  );
}
