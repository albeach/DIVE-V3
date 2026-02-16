/**
 * Role-Based Access Control (RBAC) Middleware
 * 
 * Provides role checking middleware for protecting routes.
 * Integrates with JWT authentication to verify user roles.
 * 
 * @version 1.0.0
 * @date 2026-02-07
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { IUserPayload } from '../types/auth.types';

// Re-export for backward compatibility
export type { IUserPayload as IAuthenticatedUser } from '../types/auth.types';

// ============================================
// Types & Interfaces
// ============================================

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  ADMIN_TENANT = 'admin_tenant',
  ADMIN_HUB = 'hub_admin',
  SUPER_ADMIN = 'super_admin',
}

// Extend Express Request to include user (uses centralized IUserPayload)
declare global {
  namespace Express {
    interface Request {
      user?: IUserPayload;
    }
  }
}

// ============================================
// Role Checking Middleware
// ============================================

/**
 * Middleware to require specific role(s) for route access
 * 
 * @param allowedRoles - Array of roles that can access the route
 * @returns Express middleware function
 * 
 * @example
 * router.post('/admin', authenticateJWT, requireRole(['admin', 'super_admin']), handler);
 */
export function requireRole(allowedRoles: (UserRole | string)[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    // Check if user is authenticated
    if (!req.user) {
      logger.warn('Role check failed: No authenticated user', {
        path: req.path,
        method: req.method
      });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Authentication required'
      });
      return;
    }

    // Check if user has required role
    const userRole = req.user.role;
    const hasRequiredRole = allowedRoles.includes(userRole ?? '');

    if (!hasRequiredRole) {
      logger.warn('Role check failed: Insufficient permissions', {
        user: req.user.uniqueID,
        userRole,
        requiredRoles: allowedRoles,
        path: req.path,
        method: req.method
      });
      res.status(403).json({
        error: 'Forbidden',
        message: 'Insufficient permissions',
        requiredRoles: allowedRoles,
        userRole
      });
      return;
    }

    // Role check passed
    logger.debug('Role check passed', {
      user: req.user.uniqueID,
      role: userRole,
      path: req.path
    });

    next();
  };
}

/**
 * Middleware to require admin role (any admin level)
 */
export function requireAdmin() {
  return requireRole([
    UserRole.ADMIN,
    UserRole.ADMIN_TENANT,
    UserRole.ADMIN_HUB,
    UserRole.SUPER_ADMIN
  ]);
}

/**
 * Middleware to require super admin role (highest privilege)
 */
export function requireSuperAdmin() {
  return requireRole([UserRole.SUPER_ADMIN]);
}

/**
 * Middleware to require hub admin role or higher
 */
export function requireHubAdmin() {
  return requireRole([
    UserRole.ADMIN_HUB,
    UserRole.SUPER_ADMIN
  ]);
}

/**
 * Check if user has specific role (for use in route handlers)
 * 
 * @param user - Authenticated user object
 * @param role - Role to check for
 * @returns true if user has the role
 */
export function hasRole(user: IUserPayload | undefined, role: UserRole | string): boolean {
  if (!user) return false;
  return user.role === role;
}

/**
 * Check if user has any of the specified roles
 * 
 * @param user - Authenticated user object
 * @param roles - Array of roles to check
 * @returns true if user has any of the roles
 */
export function hasAnyRole(user: IUserPayload | undefined, roles: (UserRole | string)[]): boolean {
  if (!user) return false;
  return user.role !== undefined && roles.includes(user.role);
}

/**
 * Check if user is admin (any level)
 */
export function isAdmin(user: IUserPayload | undefined): boolean {
  return hasAnyRole(user, [
    UserRole.ADMIN,
    UserRole.ADMIN_TENANT,
    UserRole.ADMIN_HUB,
    UserRole.SUPER_ADMIN
  ]);
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user: IUserPayload | undefined): boolean {
  return hasRole(user, UserRole.SUPER_ADMIN);
}

/**
 * Check if user is hub admin or higher
 */
export function isHubAdmin(user: IUserPayload | undefined): boolean {
  return hasAnyRole(user, [
    UserRole.ADMIN_HUB,
    UserRole.SUPER_ADMIN
  ]);
}
