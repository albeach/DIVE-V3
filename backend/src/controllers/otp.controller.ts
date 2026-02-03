/**
 * OTP Controller
 *
 * Handles OTP enrollment and verification endpoints for custom login flow
 *
 * Endpoints:
 * - POST /api/auth/otp/setup - Generate OTP secret and QR code
 * - POST /api/auth/otp/verify - Verify OTP code and create Keycloak credential
 *
 * Architecture:
 * Frontend → Backend → OTP Service → Speakeasy (validation) → Keycloak Admin API (credential creation)
 *
 * This bypasses Direct Grant flow limitations for multi-step enrollment
 */

import { Request, Response } from 'express';
import { otpService } from '../services/otp.service';
import { logger } from '../utils/logger';
import { getPendingOTPSecret, removePendingOTPSecret } from '../services/otp-redis.service';
import { getClientSecretForRealm } from '../config/realm-client-secrets';

/**
 * POST /api/auth/otp/setup
 * Generate OTP secret and QR code for user enrollment
 */
export const otpSetupHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { idpAlias, username, password } = req.body;

    try {
        // Validation
        if (!idpAlias || !username || !password) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: idpAlias, username, password'
            });
            return;
        }

        // Get realm name from IdP alias
        let realmName: string;
        if (idpAlias === 'dive-v3-broker') {
            realmName = 'dive-v3-broker';
        } else if (idpAlias.includes('-realm-broker')) {
            const countryCode = idpAlias.split('-')[0];
            realmName = `dive-v3-${countryCode}`;
        } else {
            realmName = idpAlias.replace('-idp', '');
        }

        // First, verify username and password are correct (security check)
        // We don't want to generate OTP secrets for invalid credentials
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        const clientId = process.env.KEYCLOAK_CLIENT_ID || 'dive-v3-broker-client';

        // Phase 2.1: Use realm-specific client secret
        const clientSecret = getClientSecretForRealm(realmName);

        try {
            const axios = (await import('axios')).default;
            const tokenUrl = `${keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`;

            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', clientId);
            if (clientSecret) params.append('client_secret', clientSecret);
            params.append('username', username);
            params.append('password', password);

            await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            // If we get here, credentials are valid
            logger.info('Credentials validated for OTP setup', {
                requestId,
                username,
                realmName
            });
        } catch (authError: any) {
            logger.warn('Invalid credentials for OTP setup', {
                requestId,
                username,
                realmName
            });

            res.status(401).json({
                success: false,
                error: 'Invalid username or password'
            });
            return;
        }

        // Generate OTP secret and QR code
        const otpData = await otpService.generateOTPSecret(username, realmName);

        logger.info('OTP setup initiated', {
            requestId,
            username,
            realmName,
            userId: otpData.userId
        });

        res.status(200).json({
            success: true,
            data: {
                secret: otpData.secret,
                qrCodeUrl: otpData.qrCodeUrl,
                qrCodeDataUrl: otpData.qrCodeDataUrl,
                userId: otpData.userId
            },
            message: 'Scan the QR code with your authenticator app and enter the 6-digit code'
        });
    } catch (error) {
        logger.error('OTP setup failed', {
            requestId,
            username: req.body.username,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to initiate OTP setup. Please try again.'
        });
    }
};

/**
 * POST /api/auth/otp/verify
 * Verify OTP code and create Keycloak credential
 */
export const otpVerifyHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { idpAlias, username, secret, otp, userId } = req.body;

    // Debug: Log full request body
    logger.info('OTP verify request received', {
        requestId,
        bodyKeys: Object.keys(req.body),
        bodyValues: {
            idpAlias: idpAlias || 'MISSING',
            username: username || 'MISSING',
            secret: secret ? '[REDACTED]' : 'MISSING',
            otp: otp ? '[REDACTED]' : 'MISSING',
            userId: userId || 'MISSING'
        },
        bodyTypes: {
            idpAlias: typeof idpAlias,
            username: typeof username,
            secret: typeof secret,
            otp: typeof otp,
            userId: typeof userId
        }
    });

    try {
        // Validation - check each field individually for better debugging
        const missingFields: string[] = [];
        if (!idpAlias) missingFields.push('idpAlias');
        if (!username) missingFields.push('username');
        if (!secret) missingFields.push('secret');
        if (!otp) missingFields.push('otp');
        if (!userId) missingFields.push('userId');

        if (missingFields.length > 0) {
            logger.warn('OTP verification failed - missing fields', {
                requestId,
                missingFields,
                receivedFields: {
                    idpAlias: idpAlias || 'MISSING',
                    username: username || 'MISSING',
                    secret: secret ? '[REDACTED]' : 'MISSING',
                    otp: otp ? '[REDACTED]' : 'MISSING',
                    userId: userId || 'MISSING'
                }
            });

            res.status(400).json({
                success: false,
                error: `Missing required fields: ${missingFields.join(', ')}`
            });
            return;
        }

        // Get realm name from IdP alias
        let realmName: string;
        if (idpAlias === 'dive-v3-broker') {
            realmName = 'dive-v3-broker';
        } else if (idpAlias.includes('-realm-broker')) {
            const countryCode = idpAlias.split('-')[0];
            realmName = `dive-v3-${countryCode}`;
        } else {
            realmName = idpAlias.replace('-idp', '');
        }

        logger.info('OTP verification attempt', {
            requestId,
            username,
            realmName,
            userId
        });

        // Step 1: Verify OTP code with speakeasy
        const verificationResult = otpService.verifyOTPCode(secret, otp);

        if (!verificationResult.valid) {
            logger.warn('OTP verification failed', {
                requestId,
                username,
                realmName,
                reason: verificationResult.message
            });

            res.status(400).json({
                success: false,
                error: verificationResult.message
            });
            return;
        }

        // Step 2: Store the validated secret for Custom SPI to create credential
        // KEYCLOAK 26 FIX: Cannot create OTP credential via Admin API
        // Instead, store the validated secret in user attribute
        // The Custom SPI will create the credential on next login
        const credentialMarked = await otpService.createOTPCredential(userId, realmName, secret);

        if (!credentialMarked) {
            logger.error('Failed to store pending OTP secret', {
                requestId,
                username,
                realmName,
                userId
            });

            res.status(500).json({
                success: false,
                error: 'Failed to save OTP configuration. Please try again.'
            });
            return;
        }

        logger.info('OTP verification completed - credential will be created on next login', {
            requestId,
            username,
            realmName,
            userId
        });

        // SUCCESS: OTP validated and secret stored
        // The Custom SPI will create the actual credential on next authentication
        res.status(200).json({
            success: true,
            message: 'OTP verification successful. Your OTP has been configured. Please log in again.',
            requiresReauth: true  // Tell frontend to trigger re-authentication
        });
    } catch (error) {
        logger.error('OTP verification failed', {
            requestId,
            username: req.body.username,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to verify OTP. Please try again.'
        });
    }
};

/**
 * POST /api/auth/otp/status
 * Check if user has MFA configured (OTP or WebAuthn)
 * Returns: { hasOTP, hasWebAuthn, hasMFA }
 */
export const otpStatusHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { idpAlias, username } = req.body;

    try {
        // Validation
        if (!idpAlias || !username) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: idpAlias, username'
            });
            return;
        }

        // Get realm name from IdP alias
        let realmName: string;
        if (idpAlias === 'dive-v3-broker') {
            realmName = 'dive-v3-broker';
        } else if (idpAlias.includes('-realm-broker')) {
            const countryCode = idpAlias.split('-')[0];
            realmName = `dive-v3-${countryCode}`;
        } else {
            realmName = idpAlias.replace('-idp', '');
        }

        // Get user ID first
        const axios = (await import('axios')).default;
        const adminToken = await getAdminToken();
        const usersUrl = `${process.env.KEYCLOAK_URL}/admin/realms/${realmName}/users?username=${encodeURIComponent(username)}&exact=true`;

        const usersResponse = await axios.get(usersUrl, {
            headers: { 'Authorization': `Bearer ${adminToken}` }
        });

        if (!usersResponse.data || usersResponse.data.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        const userId = usersResponse.data[0].id;

        // Check MFA status (OTP and WebAuthn)
        const mfaStatus = await otpService.getMFAStatus(userId, realmName);

        logger.info('MFA status checked', {
            requestId,
            username,
            realmName,
            ...mfaStatus
        });

        res.status(200).json({
            success: true,
            data: {
                hasOTP: mfaStatus.hasOTP,
                hasWebAuthn: mfaStatus.hasWebAuthn,
                hasMFA: mfaStatus.hasMFA,
                username,
                realmName
            }
        });
    } catch (error) {
        logger.error('OTP status check failed', {
            requestId,
            username: req.body.username,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to check OTP status'
        });
    }
};

/**
 * GET /api/auth/otp/pending-secret/:userId
 * Get pending OTP secret from Redis (called by Custom SPI)
 *
 * This endpoint is called by the Keycloak Custom SPI during Direct Grant authentication
 * to retrieve the pending OTP secret for credential creation.
 */
export const getPendingSecretHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { userId } = req.params;

    try {
        // Validation
        if (!userId) {
            res.status(400).json({
                success: false,
                error: 'Missing required parameter: userId'
            });
            return;
        }

        // Get pending secret from Redis
        const pendingSecret = await getPendingOTPSecret(userId);

        if (!pendingSecret) {
            logger.debug('No pending OTP secret found for user', {
                requestId,
                userId
            });

            res.status(404).json({
                success: false,
                error: 'No pending OTP secret found'
            });
            return;
        }

        logger.info('Pending OTP secret retrieved for Custom SPI', {
            requestId,
            userId
        });

        res.status(200).json({
            success: true,
            data: {
                secret: pendingSecret,
                userId
            }
        });
    } catch (error) {
        logger.error('Failed to get pending OTP secret', {
            requestId,
            userId: req.params.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve pending OTP secret'
        });
    }
};

/**
 * DELETE /api/auth/otp/pending-secret/:userId
 * Remove pending OTP secret from Redis (called by Custom SPI after credential creation)
 */
export const removePendingSecretHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { userId } = req.params;

    try {
        // Validation
        if (!userId) {
            res.status(400).json({
                success: false,
                error: 'Missing required parameter: userId'
            });
            return;
        }

        // Remove pending secret from Redis
        const removed = await removePendingOTPSecret(userId);

        logger.info('Pending OTP secret removal requested', {
            requestId,
            userId,
            removed
        });

        res.status(200).json({
            success: true,
            data: {
                removed,
                userId
            }
        });
    } catch (error) {
        logger.error('Failed to remove pending OTP secret', {
            requestId,
            userId: req.params.userId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to remove pending OTP secret'
        });
    }
};

/**
 * Helper function to get admin token
 */
async function getAdminToken(): Promise<string> {
    const axios = (await import('axios')).default;
    const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
    const tokenUrl = `${keycloakUrl}/realms/master/protocol/openid-connect/token`;

    const params = new URLSearchParams();
    params.append('grant_type', 'password');
    params.append('client_id', 'admin-cli');
    params.append('username', process.env.KEYCLOAK_ADMIN_USERNAME || 'admin');
    params.append('password', process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin');

    const response = await axios.post(tokenUrl, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
    });

    return response.data.access_token;
}
