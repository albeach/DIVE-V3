/**
 * Admin Middleware
 *
 * Checks if authenticated user has admin role
 * Used to protect admin endpoints
 *
 * Phase 3: Clearance Management Admin UI
 * Date: 2026-01-04
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Require admin role for access
 *
 * Checks for: 'dive-admin', 'admin', or 'super_admin' role
 * Must be used after authenticateJWT middleware
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;

    if (!user) {
        logger.warn('Admin access attempted without authentication');
        res.status(401).json({
            success: false,
            error: 'Authentication required',
            message: 'You must be logged in to access this resource'
        });
        return;
    }

    // Check for admin roles
    const roles = user.roles || [];
    const isAdmin = roles.includes('dive-admin') ||
                    roles.includes('admin') ||
                    roles.includes('super_admin');

    if (!isAdmin) {
        logger.warn('Non-admin user attempted to access admin endpoint', {
            uniqueID: user.uniqueID,
            email: user.email,
            roles: roles,
            path: req.path
        });

        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Admin role required to access this resource'
        });
        return;
    }

    // User is admin - proceed
    logger.debug('Admin access granted', {
        uniqueID: user.uniqueID,
        email: user.email,
        path: req.path
    });

    next();
}

/**
 * Require super admin role for sensitive operations
 *
 * More restrictive than requireAdmin
 * Only allows 'super_admin' role
 */
export function requireSuperAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;

    if (!user) {
        logger.warn('Super admin access attempted without authentication');
        res.status(401).json({
            success: false,
            error: 'Authentication required',
            message: 'You must be logged in to access this resource'
        });
        return;
    }

    // Check for super admin role only
    const roles = user.roles || [];
    const isSuperAdmin = roles.includes('super_admin');

    if (!isSuperAdmin) {
        logger.warn('Non-super-admin user attempted to access super admin endpoint', {
            uniqueID: user.uniqueID,
            email: user.email,
            roles: roles,
            path: req.path
        });

        res.status(403).json({
            success: false,
            error: 'Forbidden',
            message: 'Super admin role required to access this resource'
        });
        return;
    }

    // User is super admin - proceed
    logger.debug('Super admin access granted', {
        uniqueID: user.uniqueID,
        email: user.email,
        path: req.path
    });

    next();
}
