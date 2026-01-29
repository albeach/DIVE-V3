/**
 * DIVE V3 Admin Navigation - Single Source of Truth
 *
 * This is the ONLY place where admin navigation is defined.
 * All navigation components (AdminSidebar, nav-config, mobile-drawer, navigation)
 * must import from this file.
 *
 * @version 2.0.0
 * @date 2026-01-29
 */

import {
  LayoutDashboard,
  Globe2,
  Network,
  Server,
  Users,
  ShieldCheck,
  FileText,
  Shield,
  Activity,
  Wrench,
  Zap,
  FileCheck,
  Building2,
  Key,
  CheckSquare,
  ScrollText,
  Settings,
  BookOpen,
  ClipboardCheck,
  Bug,
  BarChart3,
  Layers,
  type LucideIcon,
} from 'lucide-react';

/**
 * Clearance levels for min clearance filtering
 */
export type ClearanceLevel = 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';

/**
 * Navigation categories for grouping
 */
export type NavCategory = 'overview' | 'identity' | 'federation' | 'policy' | 'security' | 'audit' | 'system';

/**
 * Admin Navigation Item Interface
 * Comprehensive structure supporting all admin features
 */
export interface AdminNavItem {
  /** Unique identifier for the nav item */
  id: string;

  /** Display label (supports i18n keys) */
  label: string;

  /** Route path */
  href: string;

  /** Lucide icon component */
  icon: LucideIcon;

  /** Description for tooltips and help text */
  description: string;

  /** Badge text or count (e.g., pending approvals) */
  badge?: string | number;

  /** Child navigation items (for nested menus) */
  children?: AdminNavItem[];

  /** Only show for hub admins */
  hubOnly?: boolean;

  /** Only show for spoke admins */
  spokeOnly?: boolean;

  /** Require super_admin role */
  superAdminOnly?: boolean;

  /** Minimum clearance level required */
  minClearance?: ClearanceLevel;

  /** Category for grouping (used in command palette) */
  category?: NavCategory;

  /** Keywords for search (command palette fuzzy search) */
  searchKeywords?: string[];

  /** Tooltip text (overrides description) */
  tooltip?: string;

  /** Show in command palette quick actions */
  quickAction?: boolean;

  /** Track as recently used */
  recentlyUsed?: boolean;

  /** Mark as beta feature */
  betaFeature?: boolean;

  /** Only show in development mode */
  devOnly?: boolean;

  /** Hide from navigation (but keep route accessible) */
  hidden?: boolean;
}

/**
 * Main Admin Navigation Configuration
 *
 * Order represents priority in navigation menus.
 * All 25 admin pages should be represented here.
 */
export const ADMIN_NAVIGATION: AdminNavItem[] = [
  // ==========================================
  // OVERVIEW
  // ==========================================
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/admin/dashboard',
    icon: LayoutDashboard,
    description: 'Admin overview and system metrics',
    category: 'overview',
    searchKeywords: ['dashboard', 'overview', 'metrics', 'home'],
    quickAction: true,
  },

  // ==========================================
  // FEDERATION (HUB ONLY)
  // ==========================================
  {
    id: 'federation',
    label: 'Federation',
    href: '/admin/federation',
    icon: Network,
    description: 'Hub-spoke federation management',
    category: 'federation',
    hubOnly: true,
    searchKeywords: ['federation', 'hub', 'spokes', 'opal', 'policy distribution'],
    children: [
      {
        id: 'federation-spokes',
        label: 'Spokes',
        href: '/admin/federation/spokes',
        icon: Server,
        description: 'Manage spoke instance registrations',
        category: 'federation',
        searchKeywords: ['spokes', 'instances', 'registry', 'approve', 'suspend'],
        quickAction: true,
      },
      {
        id: 'federation-policies',
        label: 'Policies',
        href: '/admin/federation/policies',
        icon: ShieldCheck,
        description: 'Federation policy bundles and distribution',
        category: 'federation',
        searchKeywords: ['policy', 'bundle', 'distribution', 'sync'],
      },
      {
        id: 'federation-opal',
        label: 'OPAL Status',
        href: '/admin/federation/opal',
        icon: Activity,
        description: 'OPAL server and client status',
        category: 'federation',
        searchKeywords: ['opal', 'policy distribution', 'clients', 'transactions'],
      },
    ],
  },

  // ==========================================
  // SPOKE ADMIN (SPOKE ONLY)
  // ==========================================
  {
    id: 'spoke',
    label: 'Spoke Admin',
    href: '/admin/spoke',
    icon: Server,
    description: 'Spoke administration and hub connectivity',
    category: 'federation',
    spokeOnly: true,
    searchKeywords: ['spoke', 'hub', 'connectivity', 'circuit breaker', 'failover'],
    children: [
      {
        id: 'spoke-status',
        label: 'Status',
        href: '/admin/spoke',
        icon: Activity,
        description: 'Spoke health and hub connectivity',
        category: 'federation',
        searchKeywords: ['spoke status', 'health', 'connectivity'],
        quickAction: true,
      },
      {
        id: 'spoke-failover',
        label: 'Failover',
        href: '/admin/spoke/failover',
        icon: Zap,
        description: 'Hub failover and circuit breaker',
        category: 'federation',
        searchKeywords: ['failover', 'circuit breaker', 'resilience'],
      },
      {
        id: 'spoke-maintenance',
        label: 'Maintenance',
        href: '/admin/spoke/maintenance',
        icon: Wrench,
        description: 'Maintenance mode management',
        category: 'federation',
        searchKeywords: ['maintenance', 'downtime', 'scheduled'],
      },
      {
        id: 'spoke-audit',
        label: 'Audit Queue',
        href: '/admin/spoke/audit',
        icon: FileText,
        description: 'Audit event queue status',
        category: 'audit',
        searchKeywords: ['audit', 'queue', 'events', 'sync'],
      },
    ],
  },

  // ==========================================
  // IDENTITY & ACCESS
  // ==========================================
  {
    id: 'idp',
    label: 'Identity Providers',
    href: '/admin/idp',
    icon: Globe2,
    description: 'Configure federation identity providers',
    category: 'identity',
    searchKeywords: ['idp', 'identity provider', 'oidc', 'saml', 'keycloak'],
    quickAction: true,
    children: [
      {
        id: 'idp-new',
        label: 'Add IdP',
        href: '/admin/idp/new',
        icon: Globe2,
        description: 'Register new identity provider',
        category: 'identity',
        searchKeywords: ['add idp', 'new identity provider', 'register'],
        quickAction: true,
        superAdminOnly: true,
      },
    ],
  },
  {
    id: 'users',
    label: 'Users',
    href: '/admin/users',
    icon: Users,
    description: 'User management and sessions',
    category: 'identity',
    searchKeywords: ['users', 'accounts', 'sessions', 'roles'],
  },
  {
    id: 'clearance-management',
    label: 'Clearance Management',
    href: '/admin/clearance-management',
    icon: Shield,
    description: 'Manage clearance level mappings',
    category: 'identity',
    searchKeywords: ['clearance', 'classification', 'nato', 'security level'],
    superAdminOnly: true,
  },

  // ==========================================
  // SERVICE PROVIDERS
  // ==========================================
  {
    id: 'sp-registry',
    label: 'Service Providers',
    href: '/admin/sp-registry',
    icon: Building2,
    description: 'External service provider registry',
    category: 'identity',
    searchKeywords: ['service provider', 'sp', 'oauth', 'client'],
    children: [
      {
        id: 'sp-registry-new',
        label: 'Register SP',
        href: '/admin/sp-registry/new',
        icon: Building2,
        description: 'Register new service provider',
        category: 'identity',
        searchKeywords: ['register sp', 'new service provider'],
        quickAction: true,
      },
    ],
  },

  // ==========================================
  // POLICIES & AUTHORIZATION
  // ==========================================
  {
    id: 'opa-policy',
    label: 'OPA Policies',
    href: '/admin/opa-policy',
    icon: ShieldCheck,
    description: 'Real-time policy editor and management',
    category: 'policy',
    searchKeywords: ['opa', 'policy', 'rego', 'authorization', 'rules'],
    badge: 'DEMO',
  },

  // ==========================================
  // SECURITY & CERTIFICATES
  // ==========================================
  {
    id: 'certificates',
    label: 'Certificates',
    href: '/admin/certificates',
    icon: FileCheck,
    description: 'PKI certificate lifecycle management',
    category: 'security',
    searchKeywords: ['certificates', 'pki', 'rotation', 'crl', 'tls'],
    superAdminOnly: true,
  },

  // ==========================================
  // APPROVALS
  // ==========================================
  {
    id: 'approvals',
    label: 'Approvals',
    href: '/admin/approvals',
    icon: CheckSquare,
    description: 'Pending approval requests (IdPs, Spokes)',
    category: 'system',
    searchKeywords: ['approvals', 'pending', 'review', 'requests'],
    badge: 0, // Dynamic - should be updated from API
    quickAction: true,
  },

  // ==========================================
  // AUDIT & LOGS
  // ==========================================
  {
    id: 'logs',
    label: 'Audit Logs',
    href: '/admin/logs',
    icon: ScrollText,
    description: 'System audit trail and security events',
    category: 'audit',
    searchKeywords: ['logs', 'audit', 'events', 'security', 'violations'],
  },

  // ==========================================
  // ANALYTICS
  // ==========================================
  {
    id: 'analytics',
    label: 'IdP Governance',
    href: '/admin/analytics',
    icon: BarChart3,
    description: 'Partner IdP health and governance metrics',
    category: 'system',
    searchKeywords: ['analytics', 'governance', 'metrics', 'idp health', 'sla'],
  },

  // ==========================================
  // COMPLIANCE
  // ==========================================
  {
    id: 'compliance',
    label: 'Compliance',
    href: '/admin/compliance',
    icon: ClipboardCheck,
    description: 'Policy compliance and drift detection',
    category: 'audit',
    searchKeywords: ['compliance', 'drift', 'tests', 'sla'],
    badge: 'BETA',
  },

  // ==========================================
  // INTEGRATION GUIDE
  // ==========================================
  {
    id: 'integration-guide',
    label: 'Integration Guide',
    href: '/integration/federation-vs-object',
    icon: BookOpen,
    description: 'Federation vs object-level integration patterns',
    category: 'system',
    searchKeywords: ['integration', 'guide', 'documentation', 'federation'],
    badge: 'NEW',
  },

  // ==========================================
  // DEBUG TOOLS (DEV ONLY)
  // ==========================================
  {
    id: 'debug',
    label: 'Debug Tools',
    href: '/admin/debug',
    icon: Bug,
    description: 'Development debug console',
    category: 'system',
    searchKeywords: ['debug', 'console', 'session', 'diagnostics'],
    superAdminOnly: true,
    devOnly: true,
    hidden: process.env.NODE_ENV === 'production',
  },
];

/**
 * Get filtered navigation items based on user context
 *
 * @param user - User object with roles, clearance, instance type
 * @returns Filtered navigation items
 */
export function getAdminNavigation(user: {
  roles?: string[];
  clearance?: string;
  countryOfAffiliation?: string;
  instanceType?: 'hub' | 'spoke';
}): AdminNavItem[] {
  const roles = user.roles || [];
  const isSuperAdmin = roles.includes('super_admin');
  const isHubAdmin = roles.some(r => ['hub_admin', 'admin', 'super_admin'].includes(r));
  const isSpokeAdmin = roles.some(r => ['spoke_admin', 'admin', 'super_admin'].includes(r));
  const instanceType = user.instanceType || 'hub';
  const isHub = instanceType === 'hub';
  const isSpoke = instanceType === 'spoke';
  const isDev = process.env.NODE_ENV === 'development';

  return ADMIN_NAVIGATION.filter(item => filterNavItem(item, {
    isSuperAdmin,
    isHub,
    isSpoke,
    isDev,
  })).map(item => ({
    ...item,
    children: item.children?.filter(child => filterNavItem(child, {
      isSuperAdmin,
      isHub,
      isSpoke,
      isDev,
    })),
  }));
}

/**
 * Filter individual nav item based on context
 */
function filterNavItem(
  item: AdminNavItem,
  context: { isSuperAdmin: boolean; isHub: boolean; isSpoke: boolean; isDev: boolean }
): boolean {
  // Filter by super admin requirement
  if (item.superAdminOnly && !context.isSuperAdmin) return false;

  // Filter by instance type
  if (item.hubOnly && !context.isHub) return false;
  if (item.spokeOnly && !context.isSpoke) return false;

  // Filter by dev mode
  if (item.devOnly && !context.isDev) return false;

  // Filter hidden items
  if (item.hidden) return false;

  return true;
}

/**
 * Get all quick action items (for command palette)
 */
export function getQuickActions(user: {
  roles?: string[];
  instanceType?: 'hub' | 'spoke';
}): AdminNavItem[] {
  const allItems = getAdminNavigation(user);
  const flattenItems = (items: AdminNavItem[]): AdminNavItem[] => {
    return items.flatMap(item => [
      item,
      ...(item.children ? flattenItems(item.children) : []),
    ]);
  };
  return flattenItems(allItems).filter(item => item.quickAction);
}

/**
 * Search navigation items by keyword
 *
 * @param query - Search query
 * @param user - User context for filtering
 * @returns Matching navigation items
 */
export function searchNavigation(
  query: string,
  user: { roles?: string[]; instanceType?: 'hub' | 'spoke' }
): AdminNavItem[] {
  const allItems = getAdminNavigation(user);
  const flattenItems = (items: AdminNavItem[]): AdminNavItem[] => {
    return items.flatMap(item => [
      item,
      ...(item.children ? flattenItems(item.children) : []),
    ]);
  };

  const lowerQuery = query.toLowerCase();

  return flattenItems(allItems).filter(item => {
    // Search in label
    if (item.label.toLowerCase().includes(lowerQuery)) return true;

    // Search in description
    if (item.description.toLowerCase().includes(lowerQuery)) return true;

    // Search in keywords
    if (item.searchKeywords?.some(kw => kw.toLowerCase().includes(lowerQuery))) return true;

    return false;
  });
}

/**
 * Get navigation item by ID
 */
export function getNavItemById(id: string): AdminNavItem | undefined {
  const flattenItems = (items: AdminNavItem[]): AdminNavItem[] => {
    return items.flatMap(item => [
      item,
      ...(item.children ? flattenItems(item.children) : []),
    ]);
  };
  return flattenItems(ADMIN_NAVIGATION).find(item => item.id === id);
}

/**
 * Get navigation items by category
 */
export function getNavItemsByCategory(category: NavCategory): AdminNavItem[] {
  const flattenItems = (items: AdminNavItem[]): AdminNavItem[] => {
    return items.flatMap(item => [
      item,
      ...(item.children ? flattenItems(item.children) : []),
    ]);
  };
  return flattenItems(ADMIN_NAVIGATION).filter(item => item.category === category);
}
