'use client';

import { useState, useEffect } from 'react';
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
  LogOut,
  Network,
  ChevronDown,
  ChevronRight,
  Activity,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavItem[];
}

const navItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Federation',
    href: '/admin/federation',
    icon: Network,
    children: [
      {
        title: 'Spokes',
        href: '/admin/federation/spokes',
        icon: Server,
      },
      {
        title: 'Policies',
        href: '/admin/federation/policies',
        icon: ShieldCheck,
      },
      {
        title: 'OPAL Status',
        href: '/admin/federation/opal',
        icon: Activity,
      },
    ]
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
    href: '/admin/users',
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
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Fetch pending spoke count
  useEffect(() => {
    const fetchPendingCount = async () => {
      try {
        const response = await fetch('/api/federation/health');
        if (response.ok) {
          const data = await response.json();
          setPendingCount(data.statistics?.pendingApprovals || 0);
        }
      } catch (error) {
        // Silently fail - this is just for the badge
      }
    };

    fetchPendingCount();
    const interval = setInterval(fetchPendingCount, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-expand Federation if on a federation page
  useEffect(() => {
    if (pathname.startsWith('/admin/federation')) {
      setExpandedItems((prev) => 
        prev.includes('Federation') ? prev : [...prev, 'Federation']
      );
    }
  }, [pathname]);

  const toggleExpanded = (title: string) => {
    setExpandedItems((prev) =>
      prev.includes(title)
        ? prev.filter((t) => t !== title)
        : [...prev, title]
    );
  };

  const isActive = (href: string) => {
    if (href === '/admin/dashboard') {
      return pathname === href;
    }
    return pathname.startsWith(href);
  };

  const renderNavItem = (item: NavItem, index: number) => {
    const Icon = item.icon;
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedItems.includes(item.title);
    const active = isActive(item.href);

    // Add pending badge to Federation → Spokes
    const showBadge = item.href === '/admin/federation/spokes' && pendingCount > 0;

    if (hasChildren) {
      return (
        <div key={index}>
          <button
            onClick={() => toggleExpanded(item.title)}
            className={cn(
              "flex items-center justify-between w-full rounded-lg px-3 py-2 transition-all hover:text-gray-900 dark:hover:text-gray-50",
              active
                ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
                : "text-gray-500 dark:text-gray-400"
            )}
          >
            <div className="flex items-center gap-3">
              <Icon className="h-4 w-4" />
              <span>{item.title}</span>
              {pendingCount > 0 && item.title === 'Federation' && (
                <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full animate-pulse">
                  {pendingCount}
                </span>
              )}
            </div>
            {isExpanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </button>
          {isExpanded && (
            <div className="ml-4 mt-1 space-y-1 border-l border-gray-200 dark:border-gray-700 pl-3">
              {item.children!.map((child, childIndex) => {
                const ChildIcon = child.icon;
                const childActive = isActive(child.href);
                const childShowBadge = child.href === '/admin/federation/spokes' && pendingCount > 0;

                return (
                  <Link
                    key={childIndex}
                    href={child.href}
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all hover:text-gray-900 dark:hover:text-gray-50",
                      childActive
                        ? "bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                        : "text-gray-500 dark:text-gray-400"
                    )}
                  >
                    <ChildIcon className="h-4 w-4" />
                    <span>{child.title}</span>
                    {childShowBadge && (
                      <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full">
                        {pendingCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    return (
      <Link
        key={index}
        href={item.href}
        className={cn(
          "flex items-center gap-3 rounded-lg px-3 py-2 transition-all hover:text-gray-900 dark:hover:text-gray-50",
          active
            ? "bg-gray-100 text-gray-900 dark:bg-gray-800 dark:text-gray-50"
            : "text-gray-500 dark:text-gray-400"
        )}
      >
        <Icon className="h-4 w-4" />
        {item.title}
        {showBadge && (
          <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-amber-500 text-white text-xs font-bold rounded-full">
            {pendingCount}
          </span>
        )}
      </Link>
    );
  };

  return (
    <div className="hidden border-r bg-gray-100/40 dark:bg-gray-800/40 lg:block w-64 min-h-screen flex-col">
      <div className="flex h-14 items-center border-b px-6">
        <Link className="flex items-center gap-2 font-semibold" href="/dashboard">
          <span className="">DIVE V3 Admin</span>
        </Link>
      </div>
      <div className="flex-1 overflow-auto py-2">
        <nav className="grid items-start px-4 text-sm font-medium gap-1">
          {navItems.map((item, index) => renderNavItem(item, index))}
        </nav>
      </div>
      <div className="mt-auto p-4">
        <div className="border-t pt-4">
          {/* Use SecureLogoutButton for proper session cleanup */}
          <SecureLogoutButton compact />
        </div>
      </div>
    </div>
  );
}
