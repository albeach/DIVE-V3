/**
 * Admin Authentication Middleware
 * 
 * Enforces super_admin role requirement for admin endpoints
 * Pattern:
 * 1. Verify JWT (reuse authenticateJWT)
 * 2. Extract roles from token
 * 3. Check for super_admin role
 * 4. Log admin action
 * 5. Fail-closed if role missing
 * 
 * Security: All admin actions are logged for audit compliance
 */

import { Request, Response, NextFunction } from 'express';
import { authenticateJWT } from './authz.middleware';
import { logger } from '../utils/logger';
import { ADMIN_ROLES, hasAdminRole } from '../types/admin.types';

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
        roles?: string[]; // Roles from JWT
    };
}

/**
 * Admin Authentication Middleware
 * Requires super_admin role
 */
export const adminAuthMiddleware = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        // ============================================
        // Step 1: Authenticate JWT
        // ============================================

        // First run JWT authentication
        await new Promise<void>((resolve, reject) => {
            authenticateJWT(req, res, (err?: any) => {
                if (err) {
                    reject(err);
                } else {
                    resolve();
                }
            });
        });

        // Check if JWT authentication succeeded
        const authReq = req as IAuthenticatedRequest;
        if (!authReq.user) {
            logger.warn('Admin access denied: No user from JWT authentication', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Authentication required',
                requestId
            });
            return;
        }

        // ============================================
        // Step 2: Extract roles from token
        // ============================================

        // Roles should be in JWT token (realm_access.roles or roles claim)
        // The authenticateJWT middleware should populate this
        // For now, we need to parse it from the JWT token

        const authHeader = req.headers.authorization;
        if (!authHeader) {
            logger.warn('Admin access denied: Missing authorization header', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing authorization header',
                requestId
            });
            return;
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Decode token to get roles (don't verify again, already done by authenticateJWT)
        let roles: string[] = [];
        try {
            const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

            // Extract roles from Keycloak token structure
            // Roles can be in: realm_access.roles, resource_access.{client}.roles, or roles claim
            if (payload.realm_access && Array.isArray(payload.realm_access.roles)) {
                roles = payload.realm_access.roles;
            } else if (Array.isArray(payload.roles)) {
                roles = payload.roles;
            }

            logger.debug('Extracted roles from JWT', {
                requestId,
                uniqueID: authReq.user.uniqueID,
                roles
            });
        } catch (error) {
            logger.error('Failed to extract roles from token', {
                requestId,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Invalid token structure',
                requestId
            });
            return;
        }

        // ============================================
        // Step 3: Check for admin role (any of: super_admin, admin, dive-admin)
        // ============================================

        if (!hasAdminRole(roles)) {
            logger.warn('Admin access denied: Missing admin role', {
                requestId,
                uniqueID: authReq.user.uniqueID,
                roles,
                required: ADMIN_ROLES
            });

            // Log security violation
            const { logAccessDeniedEvent } = await import('../utils/acp240-logger');
            logAccessDeniedEvent({
                requestId,
                subject: authReq.user.uniqueID,
                resourceId: 'admin-api',
                reason: `Missing required role: one of ${ADMIN_ROLES.join(', ')}`,
                subjectAttributes: {
                    clearance: authReq.user.clearance,
                    countryOfAffiliation: authReq.user.countryOfAffiliation,
                    acpCOI: authReq.user.acpCOI
                },
                policyEvaluation: {
                    allow: false,
                    reason: `User does not have any admin role (${ADMIN_ROLES.join(', ')})`,
                    evaluation_details: {
                        requiredRoles: ADMIN_ROLES,
                        userRoles: roles
                    }
                }
            });

            res.status(403).json({
                error: 'Forbidden',
                message: 'Administrator privileges required',
                details: {
                    requiredRoles: ADMIN_ROLES,
                    yourRoles: roles
                },
                requestId
            });
            return;
        }

        // ============================================
        // Step 4: Log admin action
        // ============================================

        logger.info('Admin access granted', {
            requestId,
            uniqueID: authReq.user.uniqueID,
            endpoint: req.path,
            method: req.method,
            roles
        });

        // Attach roles to request for later use
        authReq.user.roles = roles;

        // ============================================
        // Step 5: Allow access
        // ============================================

        next();

    } catch (error) {
        logger.error('Admin auth middleware error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Admin authentication failed',
            requestId
        });
    }
};

/**
 * Log admin action after successful operation
 * Call this after admin operations complete successfully
 */
export const logAdminAction = (params: {
    requestId: string;
    admin: string;
    action: string;
    target?: string;
    details?: Record<string, any>;
    outcome: 'success' | 'failure';
    reason?: string;
}): void => {
    const adminLogger = logger.child({ service: 'admin-audit' });

    adminLogger.info('Admin Action', {
        timestamp: new Date().toISOString(),
        requestId: params.requestId,
        admin: params.admin,
        action: params.action,
        target: params.target,
        details: params.details,
        outcome: params.outcome,
        reason: params.reason
    });
};
