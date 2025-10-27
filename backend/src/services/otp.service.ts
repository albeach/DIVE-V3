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

            // Generate QR code URL (otpauth:// format)
            const qrCodeUrl = secret.otpauth_url || '';

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

            // Verify TOTP code
            // window=1 allows for ±30 seconds clock skew (recommended)
            const verified = speakeasy.totp.verify({
                secret,
                encoding: 'base32',
                token,
                window: 1 // Allow 1 step before/after (±30s)
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
            // Get admin access token
            const adminToken = await this.getAdminToken();

            // Create TOTP credential via Admin API
            // https://www.keycloak.org/docs-api/26.0.0/rest-api/index.html#_users_resource
            const credentialUrl = `${this.keycloakUrl}/admin/realms/${realmName}/users/${userId}/credentials`;

            const credentialPayload = {
                type: 'otp',
                value: secret,
                temporary: false,
                // IMPORTANT: Keycloak expects secretData and credentialData as stringified JSON
                secretData: JSON.stringify({
                    value: secret,
                    algorithm: 'HmacSHA1', // Standard TOTP algorithm
                    digits: 6,
                    period: 30
                }),
                credentialData: JSON.stringify({
                    subType: 'totp',
                    algorithm: 'HmacSHA1',
                    digits: 6,
                    period: 30,
                    counter: 0
                })
            };

            logger.info('Creating OTP credential in Keycloak', {
                userId,
                realmName,
                credentialUrl
            });

            const response = await axios.post(credentialUrl, credentialPayload, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.status === 204 || response.status === 201) {
                logger.info('OTP credential created successfully', {
                    userId,
                    realmName,
                    statusCode: response.status
                });

                // Set totp_configured custom attribute to true
                await this.setUserAttribute(userId, realmName, 'totp_configured', 'true', adminToken);

                return true;
            } else {
                logger.warn('Unexpected status code when creating OTP credential', {
                    userId,
                    realmName,
                    statusCode: response.status,
                    responseData: response.data
                });
                return false;
            }
        } catch (error: any) {
            logger.error('Failed to create OTP credential in Keycloak', {
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

            // Update user
            await axios.put(userUrl, updatedUser, {
                headers: {
                    'Authorization': `Bearer ${adminToken}`,
                    'Content-Type': 'application/json'
                }
            });

            logger.info('User attribute updated', {
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
}

// Export singleton instance
export const otpService = new OTPService();

