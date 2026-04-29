'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'react-hot-toast';
import { useState } from 'react';
import { AuthProvider } from '@/contexts/auth';
import { NavigationProvider } from '@/contexts/navigation';
import { GlobalLoadingOverlay } from '@/components/global-loading-overlay';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30 * 1000,
            retry: 1,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <NavigationProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
        <GlobalLoadingOverlay />
      </NavigationProvider>
      <Toaster position="top-right" />
    </QueryClientProvider>
  );
}
