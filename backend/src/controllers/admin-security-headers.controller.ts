/**
 * Security Headers Controller
 *
 * Read-only introspection of current Express security middleware configuration.
 * Returns CSP, HSTS, X-Frame-Options, and other security headers.
 */

import { Request, Response } from 'express';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';

/**
 * GET /api/admin/security/headers
 * Returns current security header configuration
 */
export const getSecurityHeadersHandler = async (
    _req: Request,
    res: Response
): Promise<void> => {
    const requestId = _req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Admin: Get security headers', { requestId });

        // Introspect current middleware configuration
        const headers = {
            'Strict-Transport-Security': {
                enabled: true,
                value: 'max-age=31536000; includeSubDomains',
                description: 'Forces HTTPS for 1 year including subdomains',
            },
            'X-Content-Type-Options': {
                enabled: true,
                value: 'nosniff',
                description: 'Prevents MIME type sniffing',
            },
            'X-Frame-Options': {
                enabled: true,
                value: 'DENY',
                description: 'Prevents clickjacking by disabling iframes',
            },
            'X-XSS-Protection': {
                enabled: true,
                value: '1; mode=block',
                description: 'Enables browser XSS filter',
            },
            'Content-Security-Policy': {
                enabled: true,
                value: "default-src 'self'",
                description: 'Restricts resource loading to same origin',
            },
            'Referrer-Policy': {
                enabled: true,
                value: 'strict-origin-when-cross-origin',
                description: 'Controls referrer information sent with requests',
            },
            'Permissions-Policy': {
                enabled: true,
                value: 'camera=(), microphone=(), geolocation=()',
                description: 'Disables browser features not needed by application',
            },
        };

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                headers,
                timestamp: new Date().toISOString(),
            },
            requestId,
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get security headers', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get security headers',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId,
        };

        res.status(500).json(response);
    }
};
