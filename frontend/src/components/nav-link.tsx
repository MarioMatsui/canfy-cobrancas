'use client';

import Link, { LinkProps } from 'next/link';
import { usePathname } from 'next/navigation';
import { ReactNode, MouseEvent } from 'react';
import { useNavigation } from '@/contexts/navigation';

type NavLinkProps = LinkProps & {
  children: ReactNode;
  className?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
};

export function NavLink({ children, onClick, href, ...rest }: NavLinkProps) {
  const { startNavigation } = useNavigation();
  const pathname = usePathname();

  const handleClick = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    // skip overlay if same route, modifier keys, or non-left click
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    const target = typeof href === 'string' ? href : href.pathname;
    if (target && pathname && pathname.startsWith(target)) return;
    startNavigation();
  };

  return (
    <Link href={href} onClick={handleClick} {...rest}>
      {children}
    </Link>
  );
}
