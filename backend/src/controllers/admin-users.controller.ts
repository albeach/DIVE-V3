/**
 * Admin User Management Controller
 * 
 * Handles user operations via Keycloak Admin Service
 * Requires super_admin role (enforced by adminAuthMiddleware)
 */

import { Request, Response } from 'express';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { logger } from '../utils/logger';
import { logAdminAction } from '../middleware/admin-auth.middleware';
import { IAdminAPIResponse } from '../types/admin.types';

interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
    };
}

/**
 * GET /api/admin/users
 * List users with pagination and search
 */
export const listUsersHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { page = '1', limit = '10', search = '' } = req.query;

    try {
        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const first = (pageNum - 1) * limitNum;

        logger.info('Admin: List users request', {
            requestId,
            admin: authReq.user?.uniqueID,
            page: pageNum,
            limit: limitNum,
            search
        });

        const result = await keycloakAdminService.listUsers(limitNum, first, search as string);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_users',
            outcome: 'success',
            details: { count: result.users.length, total: result.total }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                users: result.users,
                total: result.total,
                page: pageNum,
                limit: limitNum,
                totalPages: Math.ceil(result.total / limitNum)
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to list users', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to list users',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/users/:id
 * Get user details
 */
export const getUserHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { id } = req.params;

    try {
        const user = await keycloakAdminService.getUserById(id);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'get_user',
            target: id,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: user,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get user', {
            requestId,
            userId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get user',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(error instanceof Error && error.message.includes('not found') ? 404 : 500).json(response);
    }
};

/**
 * POST /api/admin/users
 * Create new user
 */
export const createUserHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const userData = req.body;

    try {
        logger.info('Admin: Create user request', {
            requestId,
            admin: authReq.user?.uniqueID,
            username: userData.username
        });

        const userId = await keycloakAdminService.createUser(userData);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_user',
            target: userId,
            outcome: 'success',
            details: { username: userData.username }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: { id: userId },
            message: 'User created successfully',
            requestId
        };

        res.status(201).json(response);
    } catch (error) {
        logger.error('Failed to create user', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_user',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to create user',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * PUT /api/admin/users/:id
 * Update user
 */
export const updateUserHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { id } = req.params;
    const userData = req.body;

    try {
        logger.info('Admin: Update user request', {
            requestId,
            admin: authReq.user?.uniqueID,
            userId: id
        });

        await keycloakAdminService.updateUser(id, userData);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_user',
            target: id,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            message: 'User updated successfully',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to update user', {
            requestId,
            userId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to update user',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
export const deleteUserHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { id } = req.params;

    try {
        logger.info('Admin: Delete user request', {
            requestId,
            admin: authReq.user?.uniqueID,
            userId: id
        });

        await keycloakAdminService.deleteUser(id);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'delete_user',
            target: id,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            message: 'User deleted successfully',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to delete user', {
            requestId,
            userId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to delete user',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password
 */
export const resetPasswordHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { id } = req.params;
    const { password, temporary } = req.body;

    if (!password) {
        res.status(400).json({
            success: false,
            error: 'Bad Request',
            message: 'Password is required',
            requestId
        });
        return;
    }

    try {
        logger.info('Admin: Reset password request', {
            requestId,
            admin: authReq.user?.uniqueID,
            userId: id,
            temporary
        });

        await keycloakAdminService.resetPassword(id, password, temporary);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'reset_password',
            target: id,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            message: 'Password reset successfully',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to reset password', {
            requestId,
            userId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to reset password',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};











