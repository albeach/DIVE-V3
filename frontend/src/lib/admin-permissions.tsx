/**
 * Admin Permissions System
 * 
 * Granular permission checking for admin features:
 * - Role-based access control
 * - Permission-based feature hiding
 * - Action authorization
 */

// ============================================
// Types
// ============================================

export type AdminRole = 
  | 'super_admin'      // Full access
  | 'admin'            // Most access
  | 'security_admin'   // Security-focused access
  | 'policy_admin'     // Policy management
  | 'user_admin'       // User management
  | 'idp_admin'        // IdP management
  | 'auditor'          // Read-only access
  | 'operator';        // Basic operations

export type AdminPermission =
  // User Management
  | 'users:read'
  | 'users:create'
  | 'users:update'
  | 'users:delete'
  | 'users:reset-password'
  | 'users:assign-roles'
  // IdP Management
  | 'idps:read'
  | 'idps:create'
  | 'idps:update'
  | 'idps:delete'
  | 'idps:enable'
  | 'idps:disable'
  // Policy Management
  | 'policies:read'
  | 'policies:create'
  | 'policies:update'
  | 'policies:delete'
  | 'policies:publish'
  | 'policies:test'
  // Federation
  | 'federation:read'
  | 'federation:approve'
  | 'federation:suspend'
  | 'federation:revoke'
  | 'federation:rotate-tokens'
  // Audit
  | 'audit:read'
  | 'audit:export'
  // Security
  | 'security:read'
  | 'security:sessions-terminate'
  | 'security:certificates-manage'
  | 'security:mfa-configure'
  // System
  | 'system:read'
  | 'system:configure'
  | 'system:restart';

// ============================================
// Role → Permission Mapping
// ============================================

const ROLE_PERMISSIONS: Record<AdminRole, AdminPermission[]> = {
  super_admin: [
    // All permissions
    'users:read', 'users:create', 'users:update', 'users:delete', 'users:reset-password', 'users:assign-roles',
    'idps:read', 'idps:create', 'idps:update', 'idps:delete', 'idps:enable', 'idps:disable',
    'policies:read', 'policies:create', 'policies:update', 'policies:delete', 'policies:publish', 'policies:test',
    'federation:read', 'federation:approve', 'federation:suspend', 'federation:revoke', 'federation:rotate-tokens',
    'audit:read', 'audit:export',
    'security:read', 'security:sessions-terminate', 'security:certificates-manage', 'security:mfa-configure',
    'system:read', 'system:configure', 'system:restart',
  ],

  admin: [
    'users:read', 'users:create', 'users:update', 'users:reset-password', 'users:assign-roles',
    'idps:read', 'idps:create', 'idps:update', 'idps:enable', 'idps:disable',
    'policies:read', 'policies:update', 'policies:test',
    'federation:read', 'federation:approve', 'federation:suspend',
    'audit:read', 'audit:export',
    'security:read', 'security:sessions-terminate',
    'system:read',
  ],

  security_admin: [
    'users:read',
    'idps:read',
    'policies:read',
    'federation:read', 'federation:suspend', 'federation:revoke',
    'audit:read', 'audit:export',
    'security:read', 'security:sessions-terminate', 'security:certificates-manage', 'security:mfa-configure',
    'system:read',
  ],

  policy_admin: [
    'users:read',
    'idps:read',
    'policies:read', 'policies:create', 'policies:update', 'policies:delete', 'policies:publish', 'policies:test',
    'federation:read',
    'audit:read',
    'system:read',
  ],

  user_admin: [
    'users:read', 'users:create', 'users:update', 'users:delete', 'users:reset-password', 'users:assign-roles',
    'idps:read',
    'audit:read',
    'system:read',
  ],

  idp_admin: [
    'users:read',
    'idps:read', 'idps:create', 'idps:update', 'idps:delete', 'idps:enable', 'idps:disable',
    'federation:read', 'federation:approve', 'federation:suspend',
    'audit:read',
    'system:read',
  ],

  auditor: [
    'users:read',
    'idps:read',
    'policies:read',
    'federation:read',
    'audit:read', 'audit:export',
    'security:read',
    'system:read',
  ],

  operator: [
    'users:read',
    'idps:read',
    'policies:read',
    'federation:read',
    'audit:read',
    'system:read',
  ],
};

// ============================================
// Permission Utilities
// ============================================

/**
 * Get all permissions for a role
 */
export function getPermissionsForRole(role: AdminRole): AdminPermission[] {
  return ROLE_PERMISSIONS[role] || [];
}

/**
 * Get all permissions for multiple roles (union)
 */
export function getPermissionsForRoles(roles: AdminRole[]): AdminPermission[] {
  const permissions = new Set<AdminPermission>();
  for (const role of roles) {
    for (const permission of getPermissionsForRole(role)) {
      permissions.add(permission);
    }
  }
  return Array.from(permissions);
}

/**
 * Check if role(s) have a specific permission
 */
export function hasPermission(
  roles: AdminRole | AdminRole[],
  permission: AdminPermission
): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  const permissions = getPermissionsForRoles(roleArray);
  return permissions.includes(permission);
}

/**
 * Check if role(s) have all specified permissions
 */
export function hasAllPermissions(
  roles: AdminRole | AdminRole[],
  requiredPermissions: AdminPermission[]
): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  const permissions = getPermissionsForRoles(roleArray);
  return requiredPermissions.every(p => permissions.includes(p));
}

/**
 * Check if role(s) have any of the specified permissions
 */
export function hasAnyPermission(
  roles: AdminRole | AdminRole[],
  requiredPermissions: AdminPermission[]
): boolean {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  const permissions = getPermissionsForRoles(roleArray);
  return requiredPermissions.some(p => permissions.includes(p));
}

// ============================================
// React Hook
// ============================================

import { useSession } from 'next-auth/react';
import { useMemo } from 'react';

interface AdminSession {
  roles?: string[];
  adminRoles?: AdminRole[];
}

export function useAdminPermissions() {
  const { data: session, status } = useSession();

  const adminRoles = useMemo((): AdminRole[] => {
    if (status !== 'authenticated' || !session?.user) {
      return [];
    }

    const user = session.user as AdminSession;
    
    // Check for explicit admin roles
    if (user.adminRoles && Array.isArray(user.adminRoles)) {
      return user.adminRoles;
    }

    // Derive from general roles
    const roles = user.roles || [];
    const derivedRoles: AdminRole[] = [];

    if (roles.includes('super_admin') || roles.includes('superadmin')) {
      derivedRoles.push('super_admin');
    }
    if (roles.includes('admin') || roles.includes('dive-admin')) {
      derivedRoles.push('admin');
    }
    if (roles.includes('security_admin')) {
      derivedRoles.push('security_admin');
    }
    if (roles.includes('policy_admin')) {
      derivedRoles.push('policy_admin');
    }
    if (roles.includes('user_admin')) {
      derivedRoles.push('user_admin');
    }
    if (roles.includes('idp_admin')) {
      derivedRoles.push('idp_admin');
    }
    if (roles.includes('auditor')) {
      derivedRoles.push('auditor');
    }
    if (roles.includes('operator')) {
      derivedRoles.push('operator');
    }

    // Default to operator if no specific admin role
    if (derivedRoles.length === 0 && roles.length > 0) {
      derivedRoles.push('operator');
    }

    return derivedRoles;
  }, [session, status]);

  const permissions = useMemo(() => {
    return getPermissionsForRoles(adminRoles);
  }, [adminRoles]);

  return {
    roles: adminRoles,
    permissions,
    isLoading: status === 'loading',
    isAuthenticated: status === 'authenticated',
    isSuperAdmin: adminRoles.includes('super_admin'),
    isAdmin: adminRoles.includes('admin') || adminRoles.includes('super_admin'),
    
    // Permission checkers
    can: (permission: AdminPermission) => permissions.includes(permission),
    canAll: (requiredPermissions: AdminPermission[]) => 
      requiredPermissions.every(p => permissions.includes(p)),
    canAny: (requiredPermissions: AdminPermission[]) => 
      requiredPermissions.some(p => permissions.includes(p)),
  };
}

// ============================================
// React Components
// ============================================

import React from 'react';

interface RequirePermissionProps {
  permission: AdminPermission | AdminPermission[];
  mode?: 'all' | 'any';
  fallback?: React.ReactNode;
  children: React.ReactNode;
}

export function RequirePermission({
  permission,
  mode = 'all',
  fallback = null,
  children,
}: RequirePermissionProps) {
  const { can, canAll, canAny } = useAdminPermissions();

  const permissions = Array.isArray(permission) ? permission : [permission];
  const hasAccess = mode === 'all' ? canAll(permissions) : canAny(permissions);

  if (!hasAccess) {
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface PermissionGateProps {
  permission: AdminPermission;
  children: (hasPermission: boolean) => React.ReactNode;
}

export function PermissionGate({ permission, children }: PermissionGateProps) {
  const { can } = useAdminPermissions();
  return <>{children(can(permission))}</>;
}

// ============================================
// Export
// ============================================

export default {
  getPermissionsForRole,
  getPermissionsForRoles,
  hasPermission,
  hasAllPermissions,
  hasAnyPermission,
  useAdminPermissions,
  RequirePermission,
  PermissionGate,
};

