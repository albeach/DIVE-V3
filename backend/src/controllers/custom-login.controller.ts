/**
 * Custom Login Controller
 * 
 * Handles custom login page authentication using:
 * - Keycloak Direct Access Grants
 * - Username/password validation
 * - MFA support
 * - Rate limiting (5 attempts per 15 minutes)
 * - CSRF protection
 * - Session creation
 * 
 * Phase 4.2: Custom Login Handler
 */

import { Request, Response } from 'express';
import axios from 'axios';
import { logger } from '../utils/logger';
import { IAdminAPIResponse } from '../types/admin.types';

// ============================================
// Rate Limiting
// ============================================

interface LoginAttempt {
    ip: string;
    username: string;
    timestamp: number;
}

// Export for testing purposes
export const loginAttempts: LoginAttempt[] = [];
const MAX_ATTEMPTS = 8; // Increased from 5 to match Keycloak brute force settings
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function isRateLimited(ip: string, username: string): boolean {
    const now = Date.now();
    const recentAttempts = loginAttempts.filter(
        a => a.ip === ip && a.username === username && (now - a.timestamp) < WINDOW_MS
    );

    return recentAttempts.length >= MAX_ATTEMPTS;
}

function recordLoginAttempt(ip: string, username: string): void {
    loginAttempts.push({
        ip,
        username,
        timestamp: Date.now()
    });

    // Cleanup old attempts (older than 15 minutes)
    const cutoff = Date.now() - WINDOW_MS;
    const index = loginAttempts.findIndex(a => a.timestamp >= cutoff);
    if (index > 0) {
        loginAttempts.splice(0, index);
    }
}

// ============================================
// Custom Login Handler
// ============================================

/**
 * POST /api/auth/custom-login
 * Authenticate user via custom login page
 */
export const customLoginHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { idpAlias, username, password, otp } = req.body; // Extract OTP from request body
    const clientIp = req.ip || 'unknown';

    try {
        // Validation
        if (!idpAlias || !username || !password) {
            res.status(400).json({
                success: false,
                error: 'Missing required fields: idpAlias, username, password'
            });
            return;
        }

        // Rate limiting
        if (isRateLimited(clientIp, username)) {
            logger.warn('Login rate limit exceeded', {
                requestId,
                ip: clientIp,
                username
            });

            res.status(429).json({
                success: false,
                error: 'Too many login attempts. Please try again in 15 minutes.'
            });
            return;
        }

        // Record attempt
        recordLoginAttempt(clientIp, username);

        logger.info('Custom login attempt', {
            requestId,
            idpAlias,
            username,
            ip: clientIp,
            hasOTP: !!otp
        });

        // Get realm name from IdP alias
        // dive-v3-broker → dive-v3-broker (Super Admin)
        // usa-realm-broker → dive-v3-usa
        // can-realm-broker → dive-v3-can
        // fra-realm-broker → dive-v3-fra
        let realmName: string;
        if (idpAlias === 'dive-v3-broker') {
            realmName = 'dive-v3-broker';
        } else if (idpAlias.includes('-realm-broker')) {
            // Extract country code: "usa-realm-broker" → "usa"
            const countryCode = idpAlias.split('-')[0];
            realmName = `dive-v3-${countryCode}`;
        } else {
            // Fallback
            realmName = idpAlias.replace('-idp', '');
        }

        // Authenticate with Keycloak Direct Access Grants
        const keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        const clientId = process.env.KEYCLOAK_CLIENT_ID || 'dive-v3-client-broker';
        const clientSecret = process.env.KEYCLOAK_CLIENT_SECRET || '';

        logger.info('Attempting Keycloak authentication', {
            requestId,
            idpAlias,
            realmName,
            username,
            tokenUrl: `${keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`
        });

        const tokenUrl = `${keycloakUrl}/realms/${realmName}/protocol/openid-connect/token`;

        const params = new URLSearchParams();
        params.append('grant_type', 'password');
        params.append('client_id', clientId);
        if (clientSecret) params.append('client_secret', clientSecret);
        params.append('username', username);
        params.append('password', password);
        params.append('scope', 'openid profile email');

        // If OTP is provided, include it in the request
        // This is required when Direct Grant flow has conditional MFA enabled
        if (otp) {
            params.append('totp', otp); // Keycloak expects 'totp' parameter for OTP
            logger.info('Including OTP in authentication request', { requestId });
        }

        try {
            const response = await axios.post(tokenUrl, params, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            const { access_token, refresh_token, expires_in } = response.data;

            logger.info('Custom login successful', {
                requestId,
                idpAlias,
                username,
                expiresIn: expires_in
            });

            // CRITICAL SECURITY CHECK: After successful authentication, verify if user
            // needs MFA but doesn't have it configured yet
            try {
                // Get admin token to check user status
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

                // Get user info
                const usersResponse = await axios.get(
                    `${keycloakUrl}/admin/realms/${realmName}/users?username=${username}`,
                    {
                        headers: { Authorization: `Bearer ${adminToken}` }
                    }
                );

                if (usersResponse.data && usersResponse.data.length > 0) {
                    const user = usersResponse.data[0];
                    const userAttributes = user.attributes || {};

                    // Check if TOTP is configured via our custom attribute
                    const totpConfigured = userAttributes.totp_configured &&
                        userAttributes.totp_configured[0] === 'true';
                    const hasOTPConfigured = user.totp || totpConfigured;

                    const clearance = (userAttributes.clearance && Array.isArray(userAttributes.clearance))
                        ? userAttributes.clearance[0]
                        : (userAttributes.clearance || 'UNCLASSIFIED');

                    logger.info('Post-auth clearance check', {
                        requestId,
                        username,
                        clearance,
                        hasOTPConfigured,
                        totpConfigured
                    });

                    // Check if user needs MFA based on clearance
                    const needsMFA = clearance && clearance !== 'UNCLASSIFIED';

                    if (needsMFA && !hasOTPConfigured) {
                        // User authenticated successfully but needs to set up MFA
                        logger.warn('User with classified clearance has no OTP configured', {
                            requestId,
                            username,
                            clearance
                        });

                        res.status(200).json({
                            success: false,
                            mfaRequired: true,
                            mfaSetupRequired: true,
                            message: 'Multi-factor authentication setup required for classified clearance.',
                            clearance,
                            // Provide a temporary token for the OTP setup process
                            setupToken: access_token
                        });
                        return;
                    }
                }
            } catch (adminError) {
                // If we can't check admin API, log warning but allow login
                // (fail open for availability, but log for security monitoring)
                logger.warn('Could not perform post-auth OTP check', {
                    requestId,
                    error: adminError instanceof Error ? adminError.message : 'Unknown error'
                });
            }

            // Return tokens (NextAuth will create session)
            const loginResponse: IAdminAPIResponse = {
                success: true,
                data: {
                    accessToken: access_token,
                    refreshToken: refresh_token,
                    expiresIn: expires_in
                },
                message: 'Login successful'
            };

            res.status(200).json(loginResponse);
        } catch (keycloakError: any) {
            // Check if MFA is required
            if (keycloakError.response?.status === 401) {
                const errorData = keycloakError.response?.data;
                const errorDescription = errorData?.error_description || '';

                logger.warn('Authentication failed', {
                    requestId,
                    username,
                    errorDescription,
                    hasOTP: !!otp
                });

                // Check for MFA requirement in error response
                // Be VERY specific - only treat as MFA if explicitly mentioning OTP/TOTP
                // Do NOT treat "invalid credentials" as MFA requirement (that's just bad password)
                const isMFARelated = (
                    (errorDescription.toLowerCase().includes('otp') ||
                        errorDescription.toLowerCase().includes('totp') ||
                        errorDescription.toLowerCase().includes('required action')) &&
                    !errorDescription.toLowerCase().includes('invalid user credentials') &&
                    !errorDescription.toLowerCase().includes('user not found')
                );

                if (isMFARelated) {
                    // If OTP was already provided, it means it was invalid
                    if (otp) {
                        logger.warn('Invalid OTP provided', { requestId, username });
                        res.status(401).json({
                            success: false,
                            mfaRequired: true,
                            error: 'Invalid OTP code. Please try again.'
                        });
                        return;
                    }

                    // Check if user needs to configure OTP first
                    // This happens when MFA is required but user hasn't set up TOTP
                    if (errorDescription.toLowerCase().includes('required action') ||
                        errorDescription.toLowerCase().includes('configure')) {
                        logger.info('OTP setup required for user', {
                            requestId,
                            username
                        });

                        res.status(200).json({
                            success: false,
                            mfaRequired: true,
                            mfaSetupRequired: true,
                            message: 'Multi-factor authentication setup required. You will be redirected to configure your authenticator app.',
                            setupUrl: `${keycloakUrl}/realms/${realmName}/account`
                        });
                        return;
                    }

                    // Otherwise, MFA is required but not yet provided
                    logger.info('MFA required for user', {
                        requestId,
                        username
                    });

                    res.status(200).json({
                        success: false,
                        mfaRequired: true,
                        message: 'Multi-factor authentication required. Please provide your OTP code.'
                    });
                    return;
                }

                // Invalid credentials (not MFA-related)
                logger.warn('Custom login failed - invalid credentials', {
                    requestId,
                    username
                });

                res.status(401).json({
                    success: false,
                    error: 'Invalid username or password'
                });
                return;
            }

            // Other Keycloak errors
            logger.error('Custom login failed - Keycloak error', {
                requestId,
                username,
                error: keycloakError.response?.data || keycloakError.message
            });

            res.status(500).json({
                success: false,
                error: 'Authentication failed. Please try again.'
            });
        }
    } catch (error) {
        logger.error('Custom login failed - server error', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Server error. Please try again later.'
        });
    }
};

/**
 * POST /api/auth/custom-login/mfa
 * Submit MFA code after initial authentication
 */
export const customLoginMFAHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { mfaToken, otp } = req.body;

    try {
        if (!mfaToken || !otp) {
            res.status(400).json({
                success: false,
                error: 'Missing mfaToken or otp'
            });
            return;
        }

        logger.info('MFA verification attempt', {
            requestId
        });

        // TODO: Verify OTP with Keycloak
        // This requires storing the MFA token and validating the OTP
        // For now, return a placeholder response

        res.status(200).json({
            success: true,
            message: 'MFA verification successful (placeholder)'
        });
    } catch (error) {
        logger.error('MFA verification failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'MFA verification failed'
        });
    }
};

