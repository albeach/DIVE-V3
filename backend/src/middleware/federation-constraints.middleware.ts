/**
 * Federation Constraints RBAC Middleware
 *
 * Enforces authorization rules for federation constraint modifications.
 * Implements 3-layer defense-in-depth (RBAC + OPA + Audit).
 *
 * Phase 2, Task 1.3
 *
 * CRITICAL PROTECTION RULES:
 * 1. Only super_admin can create/modify/delete hub↔spoke constraints
 * 2. Tenant admins can only modify their own tenant's outbound constraints
 * 3. Hub tenant involvement (either side) requires super_admin
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

// ============================================
// Types & Interfaces
// ============================================

export enum UserRole {
  USER = 'user',
  ADMIN_TENANT = 'admin',           // Tenant administrator (spoke admin)
  ADMIN_HUB = 'hub_admin',          // Hub-specific administrator
  SUPER_ADMIN = 'super_admin',      // Hub super administrator (highest privilege)
}

export interface IAuthenticatedUser {
  uniqueID: string;
  role: UserRole | string;
  tenant: string;
  email: string;
}

interface IRolePermissions {
  role: UserRole;
  permissions: string[];
  constraints: {
    federation: {
      canCreateSpokeSpoke: boolean;
      canModifySpokeSpoke: boolean;
      canDeleteSpokeSpoke: boolean;
      canCreateHubSpoke: boolean;
      canModifyHubSpoke: boolean;
      canDeleteHubSpoke: boolean;
    };
    tenantScope: 'own' | 'all';
  };
}

// ============================================
// Role Permission Definitions
// ============================================

export const ROLE_PERMISSIONS: Record<UserRole, IRolePermissions> = {
  [UserRole.USER]: {
    role: UserRole.USER,
    permissions: ['read:resources', 'read:own_profile'],
    constraints: {
      federation: {
        canCreateSpokeSpoke: false,
        canModifySpokeSpoke: false,
        canDeleteSpokeSpoke: false,
        canCreateHubSpoke: false,
        canModifyHubSpoke: false,
        canDeleteHubSpoke: false,
      },
      tenantScope: 'own',
    },
  },
  [UserRole.ADMIN_TENANT]: {
    role: UserRole.ADMIN_TENANT,
    permissions: [
      'read:resources',
      'write:resources',
      'admin:tenant_config',
      'admin:trusted_issuers',
      'admin:federation_constraints_spoke_spoke',
    ],
    constraints: {
      federation: {
        canCreateSpokeSpoke: true,    // ✅ Can create spoke↔spoke
        canModifySpokeSpoke: true,    // ✅ Can modify own spoke↔spoke
        canDeleteSpokeSpoke: true,    // ✅ Can delete own spoke↔spoke
        canCreateHubSpoke: false,     // ❌ CANNOT create hub↔spoke
        canModifyHubSpoke: false,     // ❌ CANNOT modify hub↔spoke
        canDeleteHubSpoke: false,     // ❌ CANNOT delete hub↔spoke
      },
      tenantScope: 'own',              // Only their own tenant
    },
  },
  [UserRole.ADMIN_HUB]: {
    role: UserRole.ADMIN_HUB,
    permissions: [
      'read:resources',
      'write:resources',
      'admin:all_tenant_configs',
      'admin:federation_matrix',
      'admin:federation_constraints_spoke_spoke',
    ],
    constraints: {
      federation: {
        canCreateSpokeSpoke: true,
        canModifySpokeSpoke: true,
        canDeleteSpokeSpoke: true,
        canCreateHubSpoke: false,     // ❌ Still cannot modify hub↔spoke
        canModifyHubSpoke: false,     // ❌ (requires super_admin)
        canDeleteHubSpoke: false,
      },
      tenantScope: 'all',              // Can see all tenants
    },
  },
  [UserRole.SUPER_ADMIN]: {
    role: UserRole.SUPER_ADMIN,
    permissions: [
      'admin:*',                        // All permissions
      'admin:hub_spoke_federation',     // Special: hub↔spoke federation
    ],
    constraints: {
      federation: {
        canCreateSpokeSpoke: true,     // ✅ Full spoke↔spoke control
        canModifySpokeSpoke: true,
        canDeleteSpokeSpoke: true,
        canCreateHubSpoke: true,       // ✅ ONLY role that can create hub↔spoke
        canModifyHubSpoke: true,       // ✅ ONLY role that can modify hub↔spoke
        canDeleteHubSpoke: true,       // ✅ ONLY role that can delete hub↔spoke
      },
      tenantScope: 'all',
    },
  },
};

// ============================================
// Middleware Functions
// ============================================

/**
 * Middleware: Validate federation constraint modification authorization
 *
 * Enforces the following rules:
 * 1. Only super_admin can create/modify/delete hub↔spoke constraints
 * 2. Tenant admins can only modify their own tenant's outbound constraints
 * 3. All modifications must be for spoke↔spoke relationships (tenant admins)
 */
export async function validateFederationConstraintModification(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const user = (req as any).user as IAuthenticatedUser;
    const { ownerTenant, partnerTenant, relationshipType = 'spoke_spoke' } = req.body;

    // For PUT/DELETE, extract from params if not in body
    const normalizedOwner = (ownerTenant || req.params.ownerTenant)?.toUpperCase();
    const normalizedPartner = (partnerTenant || req.params.partnerTenant)?.toUpperCase();

    // Validation: Required fields
    if (!normalizedOwner || !normalizedPartner) {
      res.status(400).json({
        success: false,
        error: 'Missing required fields: ownerTenant, partnerTenant',
      });
      return;
    }

    // Validation: Cannot set constraint for same tenant (owner == partner)
    if (normalizedOwner === normalizedPartner) {
      res.status(400).json({
        success: false,
        error: 'Owner and partner tenants cannot be the same',
      });
      return;
    }

    // Get user permissions (handle both 'admin' and UserRole.ADMIN_TENANT)
    let permissions = ROLE_PERMISSIONS[user.role as UserRole];
    if (!permissions && user.role === 'admin') {
      permissions = ROLE_PERMISSIONS[UserRole.ADMIN_TENANT];
    }

    if (!permissions) {
      logger.error('Unknown user role', { role: user.role, user: user.uniqueID });
      res.status(403).json({
        success: false,
        error: 'Invalid user role',
      });
      return;
    }

    // ============================================
    // CRITICAL CHECK 1: Hub↔Spoke Protection
    // ============================================
    if (relationshipType === 'hub_spoke') {
      if (!permissions.constraints.federation.canCreateHubSpoke) {
        logger.warn('Unauthorized attempt to create hub↔spoke constraint', {
          user: user.uniqueID,
          role: user.role,
          ownerTenant: normalizedOwner,
          partnerTenant: normalizedPartner,
          ip: req.ip,
          method: req.method,
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Only hub super administrators can create/modify hub↔spoke federation constraints',
          requiredRole: UserRole.SUPER_ADMIN,
          userRole: user.role,
        });
        return;
      }

      logger.info('Super admin creating/modifying hub↔spoke constraint', {
        user: user.uniqueID,
        role: user.role,
        ownerTenant: normalizedOwner,
        partnerTenant: normalizedPartner,
        method: req.method,
      });

      return next();
    }

    // ============================================
    // CRITICAL CHECK 2: Hub Tenant Protection (either side)
    // ============================================
    if (normalizedOwner === 'HUB' || normalizedPartner === 'HUB') {
      if (user.role !== UserRole.SUPER_ADMIN && user.role !== 'super_admin') {
        logger.warn('Unauthorized attempt to involve HUB tenant in constraint', {
          user: user.uniqueID,
          role: user.role,
          ownerTenant: normalizedOwner,
          partnerTenant: normalizedPartner,
          ip: req.ip,
          method: req.method,
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Constraints involving HUB tenant require super_admin role',
          requiredRole: UserRole.SUPER_ADMIN,
          userRole: user.role,
        });
        return;
      }

      logger.info('Super admin modifying HUB tenant constraint', {
        user: user.uniqueID,
        role: user.role,
        ownerTenant: normalizedOwner,
        partnerTenant: normalizedPartner,
      });

      return next();
    }

    // ============================================
    // CHECK 3: Tenant Scope (tenant admins can only modify their own outbound)
    // ============================================
    if (user.role === UserRole.ADMIN_TENANT || user.role === 'admin') {
      if (!permissions.constraints.federation.canModifySpokeSpoke) {
        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'User role does not have permission to modify federation constraints',
        });
        return;
      }

      // Tenant admin MUST be modifying their own tenant's outbound constraint
      if (normalizedOwner !== user.tenant) {
        logger.warn('Tenant admin attempting to modify another tenant\'s constraint', {
          user: user.uniqueID,
          userTenant: user.tenant,
          requestedOwner: normalizedOwner,
          ip: req.ip,
          method: req.method,
        });

        res.status(403).json({
          success: false,
          error: 'Forbidden',
          message: 'Tenant administrators can only modify their own tenant\'s outbound constraints',
          userTenant: user.tenant,
          requestedOwner: normalizedOwner,
        });
        return;
      }

      logger.info('Tenant admin modifying spoke↔spoke constraint', {
        user: user.uniqueID,
        tenant: user.tenant,
        partnerTenant: normalizedPartner,
        operation: req.method,
      });

      return next();
    }

    // ============================================
    // Super admin and hub_admin can modify any spoke↔spoke
    // ============================================
    if (user.role === UserRole.SUPER_ADMIN || user.role === 'super_admin' || user.role === UserRole.ADMIN_HUB) {
      logger.info('Hub/super admin modifying spoke↔spoke constraint', {
        user: user.uniqueID,
        role: user.role,
        ownerTenant: normalizedOwner,
        partnerTenant: normalizedPartner,
        method: req.method,
      });

      return next();
    }

    // ============================================
    // Fallback: Deny
    // ============================================
    logger.warn('Unknown authorization case - denying by default', {
      user: user.uniqueID,
      role: user.role,
      relationshipType,
      method: req.method,
    });

    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Insufficient privileges to modify federation constraints',
    });
  } catch (error) {
    logger.error('Federation constraint authorization check failed', {
      error: error instanceof Error ? error.message : 'Unknown error',
      user: (req as any).user?.uniqueID,
      method: req.method,
    });

    res.status(500).json({
      success: false,
      error: 'Authorization check failed',
    });
  }
}

/**
 * Middleware: Require specific role (extends existing requireRole)
 */
export function requireFederationConstraintRole(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const user = (req as any).user as IAuthenticatedUser;

  if (!user) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Must be at least tenant admin to view/modify federation constraints
  const allowedRoles = [UserRole.ADMIN_TENANT, UserRole.ADMIN_HUB, UserRole.SUPER_ADMIN, 'admin', 'super_admin'];

  if (!allowedRoles.includes(user.role as UserRole) && user.role !== 'admin' && user.role !== 'super_admin') {
    res.status(403).json({
      success: false,
      error: 'Forbidden',
      message: 'Requires administrator role',
      userRole: user.role,
      requiredRoles: ['admin', 'super_admin'],
    });
    return;
  }

  next();
}

// Export for use in routes
export default {
  validateFederationConstraintModification,
  requireFederationConstraintRole,
  UserRole,
  ROLE_PERMISSIONS,
};
