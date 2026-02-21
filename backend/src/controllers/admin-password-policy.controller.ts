/**
 * Password Policy Controller
 *
 * GET/PUT password policy via Keycloak admin API.
 * Reads and updates the realm-level password policy string.
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';
import { keycloakAdminService } from '../services/keycloak-admin.service';

/**
 * GET /api/admin/security/password-policy
 * Returns current Keycloak realm password policy
 */
export const getPasswordPolicyHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get password policy', { requestId });

        const realmConfig = await keycloakAdminService.getRealmConfig();

        const passwordPolicy = realmConfig.passwordPolicy as string || '';

        // Parse Keycloak password policy string (e.g., "length(8) and upperCase(1) and digits(1)")
        const rules: Record<string, number | boolean> = {};
        if (passwordPolicy) {
            const parts = passwordPolicy.split(' and ');
            for (const part of parts) {
                const match = part.match(/^(\w+)\((\d+)\)$/);
                if (match) {
                    rules[match[1]] = parseInt(match[2], 10);
                } else if (part.match(/^\w+$/)) {
                    rules[part] = true;
                }
            }
        }

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                rawPolicy: passwordPolicy,
                rules,
                timestamp: new Date().toISOString(),
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get password policy', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get password policy',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};

/**
 * PUT /api/admin/security/password-policy
 * Update Keycloak realm password policy
 */
export const updatePasswordPolicyHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        const { policy } = req.body;

        if (typeof policy !== 'string') {
            res.status(400).json({
                success: false,
                error: 'Missing required field: policy (string)',
                requestId,
            });
            return;
        }

        logger.info('Admin: Update password policy', { requestId, policy });

        await keycloakAdminService.updateRealmConfig({ passwordPolicy: policy });

        const response: IAdminAPIResponse = {
            success: true,
            message: 'Password policy updated',
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to update password policy', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to update password policy',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};
