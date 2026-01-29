/**
 * Admin Role Utilities
 *
 * Robust admin role checking that works across different configurations
 * and handles post-nuke scenarios where roles may not be properly assigned.
 *
 * @version 1.0.0
 * @date 2026-01-29
 */

/**
 * Check if user has any admin role
 * 
 * Checks multiple role formats to handle various Keycloak configurations:
 * - Realm roles: 'admin', 'super_admin', 'superadmin'
 * - Client roles: 'dive-admin', 'hub_admin', 'spoke_admin'
 * - Username patterns: 'admin-*', 'superadmin'
 * - Email patterns: '*admin*@*'
 *
 * @param user - Session user object with roles and username
 * @returns true if user has any admin privileges
 */
export function hasAdminRole(user: {
  roles?: string[];
  name?: string;
  email?: string;
}): boolean {
  const roles = user.roles || [];
  const username = (user.name || '').toLowerCase();
  const email = (user.email || '').toLowerCase();

  // Check explicit admin roles
  const explicitAdminRoles = [
    'admin',
    'super_admin',
    'superadmin',
    'dive-admin',
    'hub_admin',
    'spoke_admin',
    'security_admin',
    'policy_admin',
    'user_admin',
    'idp_admin',
  ];

  for (const role of roles) {
    if (explicitAdminRoles.includes(role.toLowerCase())) {
      return true;
    }
    // Check if role contains 'admin'
    if (role.toLowerCase().includes('admin')) {
      return true;
    }
  }

  // Fallback: Check username pattern (common after nuke)
  if (username.startsWith('admin-') || username === 'superadmin' || username === 'admin') {
    console.warn('[AUTH] Granting admin access based on username pattern:', username);
    return true;
  }

  // Fallback: Check email pattern
  if (email.includes('admin@') || email.startsWith('admin')) {
    console.warn('[AUTH] Granting admin access based on email pattern:', email);
    return true;
  }

  return false;
}

/**
 * Check if user has hub admin role
 */
export function hasHubAdminRole(user: {
  roles?: string[];
  name?: string;
}): boolean {
  const roles = user.roles || [];
  const username = (user.name || '').toLowerCase();

  // Check explicit hub admin roles
  if (roles.some(role => ['hub_admin', 'super_admin', 'admin'].includes(role.toLowerCase()))) {
    return true;
  }

  // Fallback: Username includes 'hub'
  if (username.includes('-hub-') || username.startsWith('admin-')) {
    return true;
  }

  return false;
}

/**
 * Check if user has spoke admin role
 */
export function hasSpokeAdminRole(user: {
  roles?: string[];
  name?: string;
}): boolean {
  const roles = user.roles || [];
  const username = (user.name || '').toLowerCase();

  // Check explicit spoke admin roles
  if (roles.some(role => ['spoke_admin', 'super_admin', 'admin'].includes(role.toLowerCase()))) {
    return true;
  }

  // Fallback: Username pattern (but NOT hub admins)
  if (username.startsWith('admin-') && !username.includes('-hub-')) {
    return true;
  }

  return false;
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user: {
  roles?: string[];
  name?: string;
}): boolean {
  const roles = user.roles || [];
  const username = (user.name || '').toLowerCase();

  // Check explicit super admin roles
  if (roles.some(role => ['super_admin', 'superadmin'].includes(role.toLowerCase()))) {
    return true;
  }

  // Fallback: Username is 'superadmin'
  if (username === 'superadmin') {
    return true;
  }

  return false;
}

/**
 * Get instance type from session or environment
 */
export function getInstanceType(user?: {
  instance?: string;
  instanceType?: string;
  name?: string;
}): 'hub' | 'spoke' {
  if (!user) {
    // Default based on environment
    return process.env.NEXT_PUBLIC_INSTANCE_TYPE === 'spoke' ? 'spoke' : 'hub';
  }

  // Check explicit instance type
  if (user.instanceType) {
    return user.instanceType as 'hub' | 'spoke';
  }

  if (user.instance) {
    return user.instance as 'hub' | 'spoke';
  }

  // Derive from username
  const username = (user.name || '').toLowerCase();
  if (username.includes('-hub-')) {
    return 'hub';
  }

  // Default to spoke for safety (more restrictive)
  return 'spoke';
}

/**
 * Debug helper: Log user roles for troubleshooting
 */
export function debugLogRoles(user: any, context: string) {
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  console.group(`[ADMIN AUTH DEBUG] ${context}`);
  console.log('Username:', user?.name || 'N/A');
  console.log('Email:', user?.email || 'N/A');
  console.log('Roles:', user?.roles || []);
  console.log('Has Admin Role:', hasAdminRole(user));
  console.log('Has Hub Admin Role:', hasHubAdminRole(user));
  console.log('Has Spoke Admin Role:', hasSpokeAdminRole(user));
  console.log('Is Super Admin:', isSuperAdmin(user));
  console.log('Instance Type:', getInstanceType(user));
  console.groupEnd();
}

export default {
  hasAdminRole,
  hasHubAdminRole,
  hasSpokeAdminRole,
  isSuperAdmin,
  getInstanceType,
  debugLogRoles,
};
