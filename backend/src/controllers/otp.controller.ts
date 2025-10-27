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
        const clientId = process.env.KEYCLOAK_CLIENT_ID || 'dive-v3-client-broker';
        const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || '';

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

    try {
        // Validation
        if (!idpAlias || !username || !secret || !otp || !userId) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: idpAlias, username, secret, otp, userId'
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

        // Step 2: Create OTP credential in Keycloak via Admin API
        const credentialCreated = await otpService.createOTPCredential(userId, realmName, secret);

        if (!credentialCreated) {
            logger.error('Failed to create OTP credential in Keycloak', {
                requestId,
                username,
                realmName,
                userId
            });

            res.status(500).json({
                success: false,
                error: 'Failed to save OTP credential. Please try again.'
            });
            return;
        }

        logger.info('OTP enrollment completed successfully', {
            requestId,
            username,
            realmName,
            userId
        });

        res.status(200).json({
            success: true,
            message: 'OTP enrollment completed successfully. You can now log in with your password and OTP code.'
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
 * Check if user has OTP configured
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

        // Check OTP status
        const hasOTP = await otpService.hasOTPConfigured(userId, realmName);

        logger.info('OTP status checked', {
            requestId,
            username,
            realmName,
            hasOTP
        });

        res.status(200).json({
            success: true,
            data: {
                hasOTP,
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

