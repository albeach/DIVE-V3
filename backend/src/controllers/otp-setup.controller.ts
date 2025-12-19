/**
 * OTP Setup Controller
 * 
 * Handles OTP/TOTP configuration for users via custom UI
 * - Generate OTP secret and QR code
 * - Verify OTP configuration
 * - Enable OTP for user account
 * 
 * Phase 4.2: Custom OTP Setup Handler
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';

// ============================================
// Generate OTP Secret and QR Code
// ============================================

/**
 * POST /api/auth/otp/setup
 * Initiate OTP setup - returns QR code and secret
 */
export const initiateOTPSetup = async (
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

        logger.info('Initiating OTP setup', {
            requestId,
            idpAlias,
            username
        });

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

        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';

        // Step 1: Get admin access token to manage user
        const adminTokenResponse = await axios.post(
            `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: 'admin',
                password: 'admin'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const adminToken = adminTokenResponse.data.access_token;

        // Step 2: Get user ID
        const usersResponse = await axios.get(
            `${keycloakUrl}/admin/realms/${realmName}/users?username=${username}`,
            {
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );

        if (!usersResponse.data || usersResponse.data.length === 0) {
            res.status(404).json({
                success: false,
                error: 'User not found'
            });
            return;
        }

        const userId = usersResponse.data[0].id;

        // Step 3: Generate OTP credential for user
        // First, get the OTP policy from realm
        const realmResponse = await axios.get(
            `${keycloakUrl}/admin/realms/${realmName}`,
            {
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );

        const otpAlgorithm = realmResponse.data.otpPolicyAlgorithm || 'HmacSHA256';
        const otpDigits = realmResponse.data.otpPolicyDigits || 6;
        const otpPeriod = realmResponse.data.otpPolicyPeriod || 30;

        // Step 4: Generate TOTP secret using speakeasy
        // This ensures proper Base32 encoding compatible with authenticator apps
        const speakeasy = require('speakeasy');

        // Customize label based on username or role
        // For admin-dive, show as "God Mode", otherwise show username
        const displayLabel = username === 'admin-dive' ? 'God Mode' : username;

        const secretObj = speakeasy.generateSecret({
            name: `DIVE ICAM (${displayLabel})`,
            issuer: 'DIVE ICAM',
            length: 32 // 32 bytes = 256 bits of entropy
        });

        const secret = secretObj.base32; // This is the Base32-encoded secret
        const otpAuthUrl = secretObj.otpauth_url;

        logger.info('OTP setup initiated successfully', {
            requestId,
            username,
            userId
        });

        res.status(200).json({
            success: true,
            data: {
                userId,
                secret,
                qrCodeUrl: otpAuthUrl,
                algorithm: otpAlgorithm,
                digits: otpDigits,
                period: otpPeriod
            },
            message: 'OTP setup initiated. Scan QR code with your authenticator app.'
        });

    } catch (error: any) {
        logger.error('OTP setup initiation failed', {
            requestId,
            error: error.response?.data || error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to initiate OTP setup'
        });
    }
};

// ============================================
// Verify and Enable OTP
// ============================================

/**
 * POST /api/auth/otp/verify
 * Verify OTP and enable it for the user
 */
export const verifyAndEnableOTP = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { idpAlias, username, password, otp, secret, userId } = req.body;

    try {
        // Validation
        if (!idpAlias || !username || !password || !otp || !secret || !userId) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields'
            });
            return;
        }

        logger.info('Verifying OTP configuration', {
            requestId,
            username,
            userId
        });

        // Get realm name
        let realmName: string;
        if (idpAlias === 'dive-v3-broker') {
            realmName = 'dive-v3-broker';
        } else if (idpAlias.includes('-realm-broker')) {
            const countryCode = idpAlias.split('-')[0];
            realmName = `dive-v3-${countryCode}`;
        } else {
            realmName = idpAlias.replace('-idp', '');
        }

        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';

        // Step 1: Verify the OTP code against the secret
        const speakeasy = require('speakeasy');
        const verified = speakeasy.totp.verify({
            secret: secret,
            encoding: 'base32',
            token: otp,
            window: 1 // ±1 step = 90 seconds total (30s per step × 3 = current + ±1)
        });

        if (!verified) {
            logger.warn('Invalid OTP code provided', {
                requestId,
                username
            });

            res.status(401).json({
                success: false,
                error: 'Invalid OTP code. Please try again.'
            });
            return;
        }

        // Step 2: Get admin token
        const adminTokenResponse = await axios.post(
            `${keycloakUrl}/realms/master/protocol/openid-connect/token`,
            new URLSearchParams({
                grant_type: 'password',
                client_id: 'admin-cli',
                username: 'admin',
                password: 'admin'
            }),
            {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            }
        );

        const adminToken = adminTokenResponse.data.access_token;

        // Step 3: Store the TOTP secret and mark user as configured
        // Since Keycloak's Direct Grant flow validates TOTP directly via speakeasy in our controller,
        // we store the secret in user attributes for our backend to validate
        try {
            // Get current user data
            const userDataResponse = await axios.get(
                `${keycloakUrl}/admin/realms/${realmName}/users/${userId}`,
                {
                    headers: { Authorization: `Bearer ${adminToken}` }
                }
            );

            const currentUser = userDataResponse.data;

            // Update user with TOTP secret in attributes and mark totp as true
            await axios.put(
                `${keycloakUrl}/admin/realms/${realmName}/users/${userId}`,
                {
                    ...currentUser,
                    totp: true,  // Mark user as having TOTP configured
                    attributes: {
                        ...currentUser.attributes,
                        totp_secret: [secret],  // Store the Base32 secret
                        totp_configured: ['true']
                    }
                },
                {
                    headers: {
                        Authorization: `Bearer ${adminToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            logger.info('User TOTP secret stored in attributes', {
                requestId,
                username,
                userId
            });

        } catch (credError: any) {
            logger.error('Failed to store TOTP configuration', {
                requestId,
                error: credError.response?.data || credError.message
            });
            throw new Error('Failed to configure OTP credential in Keycloak');
        }

        // Step 4: Remove CONFIGURE_TOTP required action
        const userResponse = await axios.get(
            `${keycloakUrl}/admin/realms/${realmName}/users/${userId}`,
            {
                headers: { Authorization: `Bearer ${adminToken}` }
            }
        );

        const requiredActions = (userResponse.data.requiredActions || []).filter(
            (action: string) => action !== 'CONFIGURE_TOTP'
        );

        await axios.put(
            `${keycloakUrl}/admin/realms/${realmName}/users/${userId}`,
            {
                ...userResponse.data,
                requiredActions
            },
            {
                headers: {
                    Authorization: `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        logger.info('OTP configuration completed successfully', {
            requestId,
            username,
            userId
        });

        res.status(200).json({
            success: true,
            message: 'OTP configured successfully. You can now log in with your authenticator app.'
        });

    } catch (error: any) {
        logger.error('OTP verification failed', {
            requestId,
            error: error.response?.data || error.message
        });

        res.status(500).json({
            success: false,
            error: 'Failed to verify OTP configuration'
        });
    }
};
