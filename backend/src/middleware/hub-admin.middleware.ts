/**
 * Hub Admin Authorization Middleware
 *
 * Enforces hub_admin or super_admin role requirement for federation write operations.
 *
 * Pattern:
 * 1. Extract JWT token from request
 * 2. Decode and extract roles
 * 3. Check for hub_admin or super_admin role
 * 4. Allow/deny access
 * 5. Log decision for audit
 *
 * Use Cases:
 * - POST/DELETE /api/opal/trusted-issuers (add/remove issuers)
 * - POST/DELETE /api/opal/federation-matrix (modify trust relationships)
 * - POST /api/kas/registry/:kasId/approve (approve KAS)
 * - Any federation modification endpoints
 *
 * Security: All modifications are logged for compliance
 *
 * @version 1.0.0
 * @date 2026-01-03
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { hasHubAdminRole, hasFederationWriteAccess, ADMIN_ROLES, HUB_ADMIN_ROLES } from '../types/admin.types';

/**
 * Extended Request with user info (from authenticateJWT)
 */
interface IAuthenticatedRequest extends Request {
    user?: {
        sub: string;
        uniqueID: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
        email?: string;
        preferred_username?: string;
        roles?: string[];
    };
}

/**
 * Extract roles from JWT token
 */
function extractRolesFromToken(authHeader: string | undefined): string[] {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return [];
    }

    const token = authHeader.substring(7);

    try {
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        // Extract roles from Keycloak token structure
        // Roles can be in: realm_access.roles, resource_access.{client}.roles, roles claim, or admin_role claim
        let roles: string[] = [];

        if (payload.realm_access && Array.isArray(payload.realm_access.roles)) {
            roles = [...roles, ...payload.realm_access.roles];
        }

        if (Array.isArray(payload.roles)) {
            roles = [...roles, ...payload.roles];
        }

        if (Array.isArray(payload.admin_role)) {
            roles = [...roles, ...payload.admin_role];
        }

        return [...new Set(roles)]; // Deduplicate
    } catch (error) {
        logger.warn('Failed to extract roles from token', {
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        return [];
    }
}

/**
 * Require Hub Admin Role Middleware
 *
 * Allows access only to users with hub_admin or super_admin role.
 * Spoke admins will receive 403 Forbidden.
 */
export const requireHubAdmin = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    // Check if user is authenticated
    if (!authReq.user) {
        logger.warn('Hub admin access denied: No authenticated user', { requestId });
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
            requestId,
        });
        return;
    }

    // Extract roles from token
    const roles = extractRolesFromToken(req.headers.authorization);

    // Check for hub admin role
    if (!hasHubAdminRole(roles)) {
        logger.warn('Hub admin access denied: Missing hub_admin role', {
            requestId,
            uniqueID: authReq.user.uniqueID,
            roles,
            required: Array.from(HUB_ADMIN_ROLES),
            endpoint: req.path,
            method: req.method,
        });

        res.status(403).json({
            error: 'Forbidden',
            message: 'Hub administrator privileges required for this operation',
            details: {
                requiredRoles: Array.from(HUB_ADMIN_ROLES),
                yourRoles: roles,
                hint: 'Spoke administrators have read-only access to federation data',
            },
            requestId,
        });
        return;
    }

    logger.info('Hub admin access granted', {
        requestId,
        uniqueID: authReq.user.uniqueID,
        roles,
        endpoint: req.path,
        method: req.method,
    });

    // Attach roles to request for later use
    authReq.user.roles = roles;

    next();
};

/**
 * Require Federation Write Access Middleware
 *
 * More permissive version - allows access to users who can modify federation.
 * Currently same as requireHubAdmin but can be extended.
 */
export const requireFederationWrite = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    if (!authReq.user) {
        res.status(401).json({
            error: 'Unauthorized',
            message: 'Authentication required',
            requestId,
        });
        return;
    }

    const roles = extractRolesFromToken(req.headers.authorization);

    if (!hasFederationWriteAccess(roles)) {
        logger.warn('Federation write access denied', {
            requestId,
            uniqueID: authReq.user.uniqueID,
            roles,
            endpoint: req.path,
            method: req.method,
        });

        res.status(403).json({
            error: 'Forbidden',
            message: 'Federation write access required',
            details: {
                requiredRoles: ['super_admin', 'hub_admin'],
                yourRoles: roles,
            },
            requestId,
        });
        return;
    }

    authReq.user.roles = roles;
    next();
};

/**
 * Log federation modification for audit
 */
export const logFederationModification = (params: {
    requestId: string;
    admin: string;
    action: string;
    target: string;
    details?: Record<string, unknown>;
    outcome: 'success' | 'failure';
    error?: string;
}): void => {
    const auditLogger = logger.child({ service: 'federation-audit' });

    auditLogger.info('Federation Modification', {
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        admin: params.admin,
        action: params.action,
        target: params.target,
        details: params.details,
        outcome: params.outcome,
        error: params.error,
    });
};

export default {
    requireHubAdmin,
    requireFederationWrite,
    logFederationModification,
};
