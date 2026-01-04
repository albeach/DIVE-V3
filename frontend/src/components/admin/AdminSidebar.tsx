'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from 'next-auth/react';
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
  Wrench,
  Zap,
  FileText as Audit,
  Shield,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { SecureLogoutButton } from '@/components/auth/secure-logout-button';
import { HUB_ADMIN_ROLES, SPOKE_ADMIN_ROLES, hasHubAdminRole, hasSpokeAdminRole } from '@/types/admin.types';

interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number;
  children?: NavItem[];
  spokeOnly?: boolean;
  hubOnly?: boolean;
}

// Hub Admin Navigation
const hubNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Federation',
    href: '/admin/federation',
    icon: Network,
    hubOnly: true,
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

// Spoke Admin Navigation
const spokeNavItems: NavItem[] = [
  {
    title: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard
  },
  {
    title: 'Spoke Admin',
    href: '/admin/spoke',
    icon: Server,
    spokeOnly: true,
    children: [
      {
        title: 'Status',
        href: '/admin/spoke',
        icon: Activity,
      },
      {
        title: 'Failover',
        href: '/admin/spoke/failover',
        icon: Zap,
      },
      {
        title: 'Maintenance',
        href: '/admin/spoke/maintenance',
        icon: Wrench,
      },
      {
        title: 'Policies',
        href: '/admin/spoke/policies',
        icon: Shield,
      },
      {
        title: 'Audit Queue',
        href: '/admin/spoke/audit',
        icon: Audit,
      },
    ]
  },
  {
    title: 'Identity Providers',
    href: '/admin/idp',
    icon: Globe2
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

/**
 * Check if user has hub admin roles (can modify federation)
 * Uses JWT claims via admin_role claim populated by Keycloak protocol mapper
 */
function isHubAdmin(roles: string[] = [], adminRoles: string[] = []): boolean {
  // Check both roles and admin_role claims for backwards compatibility
  const allRoles = [...new Set([...roles, ...adminRoles])];
  return hasHubAdminRole(allRoles);
}

/**
 * Check if user has spoke admin roles (read-only federation view)
 * Uses JWT claims via admin_role claim populated by Keycloak protocol mapper
 */
function isSpokeAdmin(roles: string[] = [], adminRoles: string[] = []): boolean {
  // Check both roles and admin_role claims for backwards compatibility
  const allRoles = [...new Set([...roles, ...adminRoles])];
  return hasSpokeAdminRole(allRoles);
}

/**
 * Detect instance type from session or hostname
 * Primary: Check session for instance_type claim
 * Fallback: Check hostname/port for spoke indicators
 */
function isOnSpokeInstance(session: any): boolean {
  // Check session for explicit instance type (populated by Keycloak)
  const instanceType = session?.user?.instanceType || session?.instanceType;
  if (instanceType === 'spoke') return true;
  if (instanceType === 'hub') return false;

  // Fallback to hostname/port detection
  if (typeof window === 'undefined') return false;
  const hostname = window.location.hostname;
  const port = window.location.port;
  // Spoke instances typically run on different ports or have spoke in hostname
  const spokePorts = ['13000', '13001', '13002', '13003', '13010', '13020'];
  const spokeIndicators = ['spoke', 'nzl', 'fra', 'gbr', 'deu', 'can'];
  return spokePorts.includes(port) || spokeIndicators.some(s => hostname.includes(s));
}

export function AdminSidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [pendingCount, setPendingCount] = useState(0);
  const [expandedItems, setExpandedItems] = useState<string[]>([]);

  // Extract roles from session
  // JWT claims: roles (realm roles), admin_role (explicit admin roles)
  const user = session?.user as {
    roles?: string[];
    admin_role?: string[];
    instanceType?: string;
  } | undefined;

  const userRoles = user?.roles || [];
  const adminRoles = user?.admin_role || [];

  // Determine user type using JWT claims
  const isHub = isHubAdmin(userRoles, adminRoles);
  const isSpoke = isSpokeAdmin(userRoles, adminRoles);
  const onSpokeInstance = isOnSpokeInstance(session);

  // Determine which navigation to show:
  // 1. If user has hub_admin role, show hub nav (regardless of instance)
  // 2. If user has spoke_admin role OR is on spoke instance, show spoke nav
  // 3. Default to hub nav for backwards compatibility
  const useSpokenNav = (isSpoke && !isHub) || (onSpokeInstance && !isHub);
  const navItems = useSpokenNav ? spokeNavItems : hubNavItems;

  // Fetch pending spoke count (only for hub admins)
  useEffect(() => {
    if (!useSpokenNav) {
      const fetchPendingCount = async () => {
        try {
          const response = await fetch('/api/federation/health');
          if (response.ok) {
            const data = await response.json();
            setPendingCount(data.statistics?.pendingApprovals || 0);
          }
        } catch (_error) {
          // Silently fail - this is just for the badge
        }
      };

      fetchPendingCount();
      const interval = setInterval(fetchPendingCount, 30000);
      return () => clearInterval(interval);
    }
  }, [useSpokenNav]);

  // Auto-expand Federation/Spoke Admin if on relevant page
  useEffect(() => {
    if (pathname.startsWith('/admin/federation')) {
      setExpandedItems((prev) =>
        prev.includes('Federation') ? prev : [...prev, 'Federation']
      );
    }
    if (pathname.startsWith('/admin/spoke')) {
      setExpandedItems((prev) =>
        prev.includes('Spoke Admin') ? prev : [...prev, 'Spoke Admin']
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
