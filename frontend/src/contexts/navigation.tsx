'use client';

import { createContext, useCallback, useContext, useEffect, useRef, useState, ReactNode } from 'react';
import { usePathname } from 'next/navigation';

interface NavigationContextType {
  isNavigating: boolean;
  startNavigation: () => void;
}

const NavigationContext = createContext<NavigationContextType>({
  isNavigating: false,
  startNavigation: () => {},
});

export function NavigationProvider({ children }: { children: ReactNode }) {
  const [isNavigating, setIsNavigating] = useState(false);
  const pathname = usePathname();
  const lastPathRef = useRef(pathname);
  const safetyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startNavigation = useCallback(() => {
    setIsNavigating(true);
    if (safetyTimeoutRef.current) clearTimeout(safetyTimeoutRef.current);
    // safety net: never lock the screen for more than 10s
    safetyTimeoutRef.current = setTimeout(() => setIsNavigating(false), 10000);
  }, []);

  useEffect(() => {
    if (pathname !== lastPathRef.current) {
      lastPathRef.current = pathname;
      // pathname changed -> the new page mounted. Hold the flag briefly so
      // react-query has time to register its first fetch and keep the overlay
      // visible without flicker.
      const t = setTimeout(() => setIsNavigating(false), 150);
      if (safetyTimeoutRef.current) {
        clearTimeout(safetyTimeoutRef.current);
        safetyTimeoutRef.current = null;
      }
      return () => clearTimeout(t);
    }
  }, [pathname]);

  return (
    <NavigationContext.Provider value={{ isNavigating, startNavigation }}>
      {children}
    </NavigationContext.Provider>
  );
}

export const useNavigation = () => useContext(NavigationContext);
