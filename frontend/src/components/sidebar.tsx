'use client';

import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Receipt,
  GitBranch,
  Webhook,
  Settings,
  LogOut,
  UserCog,
} from 'lucide-react';
import { useAuth } from '@/contexts/auth';
import { NavLink } from '@/components/nav-link';

const allMenuItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, roles: ['ADMIN', 'ATTENDANT'] },
  { href: '/subaccounts', label: 'Subcontas', icon: Users, roles: ['ADMIN'] },
  { href: '/charges', label: 'Cobranças', icon: Receipt, roles: ['ADMIN', 'ATTENDANT'] },
  { href: '/splits', label: 'Splits', icon: GitBranch, roles: ['ADMIN', 'ATTENDANT'] },
  { href: '/webhooks', label: 'Webhooks', icon: Webhook, roles: ['ADMIN'] },
  { href: '/users', label: 'Usuários', icon: UserCog, roles: ['ADMIN'] },
  { href: '/settings', label: 'Configurações', icon: Settings, roles: ['ADMIN', 'ATTENDANT'] },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user } = useAuth();
  const role = user?.role || 'ATTENDANT';

  const menuItems = allMenuItems.filter((item) => item.roles.includes(role));

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  return (
    <aside className="w-64 shrink-0 bg-gray-900 text-white sticky top-0 h-screen flex flex-col">
      <div className="p-6 border-b border-gray-800">
        <Image src="/logo-canfy.svg" alt="Canfy" width={150} height={48} className="brightness-100" />
      </div>

      <nav className="flex-1 p-4 space-y-1 overflow-y-auto">{menuItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <NavLink
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                isActive
                  ? 'bg-blue-600 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon size={20} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        {user && (
          <div className="px-4 py-2 mb-2">
            <p className="text-sm font-medium text-gray-300 truncate">{user.name}</p>
            <p className="text-xs text-gray-500">{role === 'ADMIN' ? 'Administrador' : 'Atendimento'}</p>
          </div>
        )}
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-lg text-gray-300 hover:bg-gray-800 hover:text-white w-full transition-colors"
        >
          <LogOut size={20} />
          <span>Sair</span>
        </button>
      </div>
    </aside>
  );
}
