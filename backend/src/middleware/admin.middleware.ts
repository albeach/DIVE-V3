/**
 * Admin Middleware
 *
 * Checks if authenticated user has admin role OR valid X-Admin-Key
 * Used to protect admin endpoints
 *
 * Supports both:
 * - JWT authentication with admin roles (for UI/API access)
 * - X-Admin-Key header (for CLI/admin tool access)
 *
 * Phase 3: Clearance Management Admin UI
 * Date: 2026-01-04
 * Updated: 2026-01-16 - Added X-Admin-Key support for CLI compatibility
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Require admin role for access
 *
 * Checks for:
 * 1. JWT authentication with 'dive-admin', 'admin', or 'super_admin' role, OR
 * 2. Valid X-Admin-Key header for CLI/admin tool access
 *
 * Must be used after authenticateJWT middleware (for JWT path) OR standalone (for CLI path)
 */
export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    const user = (req as any).user;
    const adminKey = req.headers['x-admin-key'] as string;

    // Check for valid X-Admin-Key (CLI/admin tool access)
    if (adminKey && adminKey === process.env.FEDERATION_ADMIN_KEY) {
        logger.debug('Admin access granted via X-Admin-Key (CLI)', {
            path: req.path,
            method: req.method
        });
        next();
        return;
    }

    // Check for JWT authentication with admin roles
    if (!user) {
        logger.warn('Admin access attempted without authentication or valid admin key');
        res.status(401).json({
            success: false,
            error: 'Authentication required',
            message: 'You must be logged in or provide a valid admin key to access this resource'
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
    logger.debug('Admin access granted via JWT', {
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
    // Check for valid X-Admin-Key (CLI/admin tool access) — same key as requireAdmin
    const adminKey = req.headers['x-admin-key'] as string;
    if (adminKey && adminKey === process.env.FEDERATION_ADMIN_KEY) {
        logger.debug('Super admin access granted via X-Admin-Key (CLI)', {
            path: req.path,
            method: req.method
        });
        next();
        return;
    }

    // DEV ONLY: Allow CLI bypass for local development
    // WARNING: This should NEVER be enabled in production
    const cliBypass = process.env.NODE_ENV !== 'production' &&
                      req.headers['x-cli-bypass'] === 'dive-cli-local-dev';

    if (cliBypass) {
        logger.debug('CLI bypass enabled for super admin endpoint (dev only)', {
            path: req.path,
            method: req.method
        });
        next();
        return;
    }

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
