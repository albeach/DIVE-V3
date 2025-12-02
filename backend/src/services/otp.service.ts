/**
 * OTP Service
 * 
 * Handles OTP (TOTP) generation, validation, and Keycloak credential management
 * using industry-standard speakeasy library and Keycloak Admin API
 * 
 * Architecture:
 * - Generate OTP secret → Return QR code to frontend
 * - Frontend shows QR → User scans with authenticator app
 * - User enters code → Backend validates with speakeasy
 * - If valid → Create credential via Keycloak Admin API
 * 
 * This approach is production-ready and avoids stateless Direct Grant limitations
 */

import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import axios from 'axios';
import { logger } from '../utils/logger';
import { storePendingOTPSecret, getPendingOTPSecret, removePendingOTPSecret } from './otp-redis.service';

interface OTPSetupData {
    secret: string;
    qrCodeUrl: string;
    qrCodeDataUrl: string;
    userId: string;
}

interface OTPVerificationResult {
    valid: boolean;
    message: string;
}

export class OTPService {
    private keycloakUrl: string;
    private keycloakAdminUsername: string;
    private keycloakAdminPassword: string;

    constructor() {
        this.keycloakUrl = process.env.KEYCLOAK_URL || 'http://keycloak:8080';
        this.keycloakAdminUsername = process.env.KEYCLOAK_ADMIN_USERNAME || 'admin';
        this.keycloakAdminPassword = process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
    }

    /**
     * Generate OTP secret and QR code for user enrollment
     * @param username User's username
     * @param realmName Keycloak realm name
     * @returns OTP setup data including secret and QR code
     */
    async generateOTPSecret(username: string, realmName: string): Promise<OTPSetupData> {
        try {
            // Get user ID from Keycloak
            const userId = await this.getUserId(username, realmName);

            // Generate TOTP secret
            const secret = speakeasy.generateSecret({
                name: `DIVE V3 (${username})`,
                issuer: 'DIVE V3 Coalition ICAM',
                length: 32 // 256-bit secret (recommended)
            });

            // CRITICAL FIX: Manually construct otpauth URL with SHA256 algorithm
            // speakeasy.generateSecret() defaults to SHA1, but Keycloak uses SHA256
            const qrCodeUrl = `otpauth://totp/DIVE%20V3%20Coalition%20ICAM:${encodeURIComponent(username)}?secret=${secret.base32}&issuer=DIVE%20V3%20Coalition%20ICAM&algorithm=SHA256&digits=6&period=30`;

            // Generate QR code as data URL (PNG image)
            const qrCodeDataUrl = await QRCode.toDataURL(qrCodeUrl);

            logger.info('Generated OTP secret for user', {
                username,
                realmName,
                userId,
                secretLength: secret.base32?.length || 0
            });

            return {
                secret: secret.base32 || '',
                qrCodeUrl,
                qrCodeDataUrl,
                userId
            };
        } catch (error) {
            logger.error('Failed to generate OTP secret', {
                username,
                realmName,
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            throw new Error('Failed to generate OTP secret');
        }
    }

    /**
     * Verify OTP code against a given secret
     * @param secret Base32-encoded TOTP secret
     * @param token 6-digit OTP code from user
     * @returns Verification result
     */
    verifyOTPCode(secret: string, token: string): OTPVerificationResult {
        try {
            // Validate input
            if (!secret || !token) {
                return {
                    valid: false,
                    message: 'Missing secret or token'
                };
            }

            if (token.length !== 6 || !/^\d{6}$/.test(token)) {
                return {
                    valid: false,
                    message: 'OTP code must be exactly 6 digits'
                };
            }

            // ============================================
            // DEMO MODE: Accept "123456" as valid code
            // ============================================
            // For demo/presentation purposes, allow code "123456" to work
            // This bypasses normal TOTP validation for convenience
            const DEMO_MODE = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV === 'demo';
            const DEMO_OTP_CODE = '123456';
            
            if (DEMO_MODE && token === DEMO_OTP_CODE) {
                logger.info('OTP code verified (DEMO MODE - using override code)', {
                    code: token,
                    warning: 'Demo mode enabled - using predictable OTP code'
                });
                return {
                    valid: true,
                    message: 'OTP code is valid (demo mode)'
                };
            }

            // Verify TOTP code
            // window=1 allows for ±30 seconds clock skew (recommended)
            // CRITICAL: Use SHA256 to match Keycloak's OTP policy
            const verified = speakeasy.totp.verify({
                secret,
                encoding: 'base32',
                token,
                window: 1, // Allow 1 step before/after (±30s)
                algorithm: 'sha256' // Must match Keycloak OTP policy
            });

            if (verified) {
                logger.info('OTP code verified successfully');
                return {
                    valid: true,
                    message: 'OTP code is valid'
                };
            } else {
                logger.warn('OTP code verification failed - invalid code');
                return {
                    valid: false,
                    message: 'Invalid OTP code. Please try again with a fresh code from your authenticator app.'
                };
            }
        } catch (error) {
            logger.error('OTP verification error', {
                error: error instanceof Error ? error.message : 'Unknown error'
            });
            return {
                valid: false,
                message: 'OTP verification failed'
            };
        }
    }

    /**
     * Create OTP credential in Keycloak via Admin API
     * @param userId Keycloak user ID
     * @param realmName Realm name
     * @param secret Base32-encoded TOTP secret
     * @returns Success status
     */
    async createOTPCredential(userId: string, realmName: string, secret: string): Promise<boolean> {
        try {
            // ============================================
            // KEYCLOAK 26 + TERRAFORM CONFLICT FIX
            // ============================================
            // Problem 1: Keycloak 26 removed POST /admin/realms/{realm}/users/{userId}/credentials endpoint
            // Problem 2: Terraform Provider 5.x bug where user attributes don't persist to PostgreSQL
            // Problem 3: Terraform null_resource workaround overwrites runtime attributes
            //
            // SOLUTION: Store pending secret in Redis with 10-minute TTL
            // The Custom SPI will query backend API for pending secret on next login
            // After credential creation, backend removes secret from Redis
            //
            // Architecture:
            // 1. Backend validates OTP and stores secret in Redis (this method)
            // 2. User re-authenticates with password + OTP code
            // 3. Custom SPI calls backend API endpoint /api/auth/otp/pending-secret/:userId
            // 4. SPI creates OTP credential using OTPCredentialProvider
            // 5. SPI notifies backend to remove secret from Redis
            // ============================================

            logger.info('Storing pending OTP secret in Redis', {
                userId,
                realmName,
                note: 'Credential will be created by Custom SPI on next login'
            });

            // Store secret in Redis with 10-minute TTL
            const stored = await storePendingOTPSecret(userId, secret, 600);

            if (!stored) {
                logger.error('Failed to store pending OTP secret in Redis', {
                    userId,
                    realmName
                });
                return false;
            }

            // Also set totp_configured custom attribute to true in Keycloak
            // This helps frontend show OTP status, but uses lifecycle.ignore_changes
            // so it won't conflict with Terraform
            try {
                const adminToken = await this.getAdminToken();
                await this.setUserAttribute(userId, realmName, 'totp_configured', 'true', adminToken);
                logger.info('Set totp_configured attribute (Terraform lifecycle ignored)');
            } catch (attrError) {
                // Non-critical: Redis is the source of truth
                logger.warn('Could not set totp_configured attribute (non-critical)', {
                    userId,
                    error: attrError instanceof Error ? attrError.message : 'Unknown error'
                });
            }

            logger.info('OTP pending secret stored successfully in Redis', {
                userId,
                realmName,
                ttl: 600
            });

            return true;
        } catch (error: any) {
            logger.error('Failed to store pending OTP secret', {
                userId,
                realmName,
                error: error.message,
                response: error.response?.data
            });
            return false;
        }
    }

    /**
     * Set user attribute in Keycloak
     * @param userId User ID
     * @param realmName Realm name
     * @param attributeName Attribute name
     * @param attributeValue Attribute value
     * @param adminToken Admin access token
     */
    private async setUserAttribute(
        userId: string,
        realmName: string,
        attributeName: string,
        attributeValue: string,
        adminToken: string
    ): Promise<void> {
        try {
            const userUrl = `${this.keycloakUrl}/admin/realms/${realmName}/users/${userId}`;

            // Get current user data
            const userResponse = await axios.get(userUrl, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            const user = userResponse.data;

            // Update attributes
            const updatedUser = {
                ...user,
                attributes: {
                    ...(user.attributes || {}),
                    [attributeName]: [attributeValue]
                }
            };

            logger.info('Updating user with attributes', {
                userId,
                realmName,
                attributeName,
                currentAttributes: user.attributes,
                newAttributes: updatedUser.attributes
            });

            // Update user
            await axios.put(userUrl, updatedUser, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info('User attribute updated successfully', {
                userId,
                realmName,
                attributeName,
                attributeValue
            });
        } catch (error: any) {
            logger.error('Failed to set user attribute', {
                userId,
                realmName,
                attributeName,
                error: error.message
            });
        }
    }

    /**
     * Get user ID from username
     * @param username Username
     * @param realmName Realm name
     * @returns User ID
     */
    private async getUserId(username: string, realmName: string): Promise<string> {
        try {
            const adminToken = await this.getAdminToken();

            const usersUrl = `${this.keycloakUrl}/admin/realms/${realmName}/users?username=${encodeURIComponent(username)}&exact=true`;

            const response = await axios.get(usersUrl, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            if (response.data && response.data.length > 0) {
                return response.data[0].id;
            } else {
                throw new Error(`User not found: ${username}`);
            }
        } catch (error: any) {
            logger.error('Failed to get user ID', {
                username,
                realmName,
                error: error.message
            });
            throw new Error('User not found');
        }
    }

    /**
     * Get Keycloak admin access token
     * @returns Admin access token
     */
    private async getAdminToken(): Promise<string> {
        try {
            const tokenUrl = `${this.keycloakUrl}/realms/master/protocol/openid-connect/token`;

            const params = new URLSearchParams();
            params.append('grant_type', 'password');
            params.append('client_id', 'admin-cli');
            params.append('username', this.keycloakAdminUsername);
            params.append('password', this.keycloakAdminPassword);

            const response = await axios.post(tokenUrl, params, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
            });

            return response.data.access_token;
        } catch (error: any) {
            logger.error('Failed to get admin token', {
                error: error.message
            });
            throw new Error('Failed to authenticate with Keycloak admin API');
        }
    }

    /**
     * Check if user has OTP configured
     * @param userId User ID
     * @param realmName Realm name
     * @returns True if OTP is configured
     */
    async hasOTPConfigured(userId: string, realmName: string): Promise<boolean> {
        try {
            const adminToken = await this.getAdminToken();

            const credentialsUrl = `${this.keycloakUrl}/admin/realms/${realmName}/users/${userId}/credentials`;

            const response = await axios.get(credentialsUrl, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            // Check if any credential is of type 'otp'
            const hasOTP = response.data.some((cred: any) => cred.type === 'otp');

            logger.info('Checked OTP configuration status', {
                userId,
                realmName,
                hasOTP
            });

            return hasOTP;
        } catch (error: any) {
            logger.error('Failed to check OTP configuration', {
                userId,
                realmName,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check if user has WebAuthn/passkey configured
     * @param userId User ID
     * @param realmName Realm name
     * @returns True if WebAuthn is configured
     */
    async hasWebAuthnConfigured(userId: string, realmName: string): Promise<boolean> {
        try {
            const adminToken = await this.getAdminToken();

            const credentialsUrl = `${this.keycloakUrl}/admin/realms/${realmName}/users/${userId}/credentials`;

            const response = await axios.get(credentialsUrl, {
                headers: { 'Authorization': `Bearer ${adminToken}` }
            });

            // Check if any credential is of type 'webauthn'
            const hasWebAuthn = response.data.some((cred: any) => 
                cred.type === 'webauthn' || cred.type === 'webauthn-passwordless'
            );

            logger.info('Checked WebAuthn configuration status', {
                userId,
                realmName,
                hasWebAuthn
            });

            return hasWebAuthn;
        } catch (error: any) {
            logger.error('Failed to check WebAuthn configuration', {
                userId,
                realmName,
                error: error.message
            });
            return false;
        }
    }

    /**
     * Check MFA status (OTP or WebAuthn)
     * @param userId User ID
     * @param realmName Realm name
     * @returns Object with OTP and WebAuthn status
     */
    async getMFAStatus(userId: string, realmName: string): Promise<{ hasOTP: boolean; hasWebAuthn: boolean; hasMFA: boolean }> {
        const [hasOTP, hasWebAuthn] = await Promise.all([
            this.hasOTPConfigured(userId, realmName),
            this.hasWebAuthnConfigured(userId, realmName)
        ]);

        return {
            hasOTP,
            hasWebAuthn,
            hasMFA: hasOTP || hasWebAuthn
        };
    }

    /**
     * Get pending OTP secret from Redis
     * Wrapper method for otp-enrollment.controller.ts compatibility
     * @param userId User ID
     * @returns Pending OTP secret or null
     */
    async getPendingSecret(userId: string): Promise<string | null> {
        return await getPendingOTPSecret(userId);
    }

    /**
     * Remove pending OTP secret from Redis
     * Wrapper method for otp-enrollment.controller.ts compatibility
     * @param userId User ID
     * @returns True if removed successfully
     */
    async removePendingSecret(userId: string): Promise<boolean> {
        return await removePendingOTPSecret(userId);
    }
}

// Export singleton instance
export const otpService = new OTPService();

