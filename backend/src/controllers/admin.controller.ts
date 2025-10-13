/**
 * Admin Controller
 * 
 * Handles Identity Provider management operations
 * All endpoints require super_admin role (enforced by adminAuthMiddleware)
 * 
 * Endpoints:
 * - GET /api/admin/idps - List all IdPs
 * - GET /api/admin/idps/:alias - Get specific IdP
 * - POST /api/admin/idps - Create new IdP
 * - PUT /api/admin/idps/:alias - Update IdP
 * - DELETE /api/admin/idps/:alias - Delete IdP
 * - POST /api/admin/idps/:alias/test - Test IdP connectivity
 */

import { Request, Response } from 'express';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { idpApprovalService } from '../services/idp-approval.service';
import { logger } from '../utils/logger';
import { logAdminAction } from '../middleware/admin-auth.middleware';
import {
    IIdPCreateRequest,
    IIdPUpdateRequest
} from '../types/keycloak.types';
import { IAdminAPIResponse } from '../types/admin.types';

/**
 * Extended Request with authenticated user
 */
interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
        roles?: string[];
    };
}

// ============================================
// Identity Provider Management Handlers
// ============================================

/**
 * GET /api/admin/idps
 * List all Identity Providers
 */
export const listIdPsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        logger.info('Admin: List IdPs request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const result = await keycloakAdminService.listIdentityProviders();

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_idps',
            outcome: 'success',
            details: { count: result.total }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to list IdPs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_idps',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to retrieve identity providers',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/idps/:alias
 * Get specific Identity Provider
 */
export const getIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Get IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        const idp = await keycloakAdminService.getIdentityProvider(alias);

        if (!idp) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Not Found',
                message: `Identity provider ${alias} not found`,
                requestId
            };
            res.status(404).json(response);
            return;
        }

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'get_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: idp,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'get_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to retrieve identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/idps
 * Create new Identity Provider
 */
export const createIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const createRequest: IIdPCreateRequest = {
            ...req.body,
            submittedBy: authReq.user?.uniqueID || 'unknown'
        };

        logger.info('Admin: Create IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias: createRequest.alias,
            protocol: createRequest.protocol
        });

        // Validate request
        if (!createRequest.alias || !createRequest.displayName || !createRequest.protocol) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Bad Request',
                message: 'Missing required fields: alias, displayName, protocol',
                requestId
            };
            res.status(400).json(response);
            return;
        }

        // Create IdP based on protocol
        let alias: string;
        if (createRequest.protocol === 'oidc') {
            alias = await keycloakAdminService.createOIDCIdentityProvider(createRequest);
        } else if (createRequest.protocol === 'saml') {
            alias = await keycloakAdminService.createSAMLIdentityProvider(createRequest);
        } else {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Bad Request',
                message: `Unsupported protocol: ${createRequest.protocol}`,
                requestId
            };
            res.status(400).json(response);
            return;
        }

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_idp',
            target: alias,
            outcome: 'success',
            details: {
                protocol: createRequest.protocol,
                displayName: createRequest.displayName
            }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                alias,
                status: 'pending',
                message: 'Identity provider created and pending approval'
            },
            message: 'IdP submitted for approval',
            requestId
        };

        res.status(201).json(response);
    } catch (error) {
        logger.error('Failed to create IdP', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_idp',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to create identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * PUT /api/admin/idps/:alias
 * Update Identity Provider
 */
export const updateIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        const updateRequest: IIdPUpdateRequest = req.body;

        logger.info('Admin: Update IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        await keycloakAdminService.updateIdentityProvider(alias, updateRequest);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_idp',
            target: alias,
            outcome: 'success',
            details: updateRequest
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                alias,
                message: 'Identity provider updated successfully'
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to update IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to update identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * DELETE /api/admin/idps/:alias
 * Delete Identity Provider
 */
export const deleteIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Delete IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        await keycloakAdminService.deleteIdentityProvider(alias);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'delete_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                alias,
                message: 'Identity provider deleted successfully'
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to delete IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'delete_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to delete identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/idps/:alias/test
 * Test Identity Provider connectivity
 */
export const testIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Test IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        const testResult = await keycloakAdminService.testIdentityProvider(alias);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'test_idp',
            target: alias,
            outcome: testResult.success ? 'success' : 'failure',
            details: testResult
        });

        const response: IAdminAPIResponse = {
            success: testResult.success,
            data: testResult,
            message: testResult.message,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to test IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'test_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to test identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

// ============================================
// IdP Approval Workflow Handlers
// ============================================

/**
 * GET /api/admin/approvals/pending
 * Get pending IdP submissions
 */
export const getPendingApprovalsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        logger.info('Admin: Get pending approvals request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const pending = await idpApprovalService.getPendingIdPs();

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_approvals',
            outcome: 'success',
            details: { count: pending.length }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: { pending, total: pending.length },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get pending approvals', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get pending approvals',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/approvals/:alias/approve
 * Approve pending IdP
 */
export const approveIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Approve IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        const result = await idpApprovalService.approveIdP(
            alias,
            authReq.user?.uniqueID || 'unknown'
        );

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'approve_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            message: 'Identity provider approved',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to approve IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'approve_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to approve identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/approvals/:alias/reject
 * Reject pending IdP
 */
export const rejectIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;
    const { reason } = req.body;

    try {
        logger.info('Admin: Reject IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias,
            reason
        });

        const result = await idpApprovalService.rejectIdP(
            alias,
            reason || 'No reason provided',
            authReq.user?.uniqueID || 'unknown'
        );

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'reject_idp',
            target: alias,
            outcome: 'success',
            details: { reason }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            message: 'Identity provider rejected',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to reject IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'reject_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to reject identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

