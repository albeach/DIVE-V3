'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { 
  LayoutDashboard, 
  Globe2, 
  Server, 
  Users, 
  ShieldCheck, 
  FileText, 
  Settings,
  LogOut
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { signOut } from 'next-auth/react';

const navItems = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Identity Providers',
    href: '/admin/idp',
    icon: Globe2
  },
  {
    title: 'Service Providers',
    href: '/admin/sp-registry',
    icon: Server
  },
  {
    title: 'Users',
    href: '/admin/users', // New route
    icon: Users
  },
  {
    title: 'Policies',
    href: '/admin/opa-policy',
    icon: ShieldCheck
  },
  {
    title: 'Logs',
    href: '/admin/logs',
    icon: FileText
  }
];

export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <div className="hidden border-r bg-gray-100/40 dark:bg-gray-800/40 lg:block w-64 min-h-screen flex-col">
      <div className="flex h-14 items-center border-b px-6">
        <Link className="flex items-center gap-2 font-semibold" href="/dashboard">
          <span className="">DIVE V3 Admin</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-4 text-sm font-medium">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            return (
              <Link
                key={index}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-gray-900 dark:hover:text-gray-50",
                  pathname === item.href 
                    ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50" 
                    : "text-gray-500 dark:text-gray-400"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.title}
              </Link>
            );
          })}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <div className="border-t pt-4">
          <button
            onClick={() => signOut()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-500 transition-all hover:bg-red-50 hover:text-red-600"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}


