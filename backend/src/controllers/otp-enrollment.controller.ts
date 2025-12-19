/**
 * OTP Enrollment Controller
 * 
 * Handles OTP enrollment finalization using Keycloak Admin API.
 * This separates enrollment from authentication, resolving Direct Grant flow limitations.
 * 
 * Architecture (Option B):
 * 1. Backend generates OTP secret (POST /api/auth/otp/setup)
 * 2. Frontend displays QR code to user
 * 3. User scans QR code and enters OTP to verify
 * 4. Frontend calls this controller to finalize enrollment
 * 5. This controller creates OTP credential via Keycloak Admin API
 * 6. Then Direct Grant authentication can proceed with OTP
 */

import { Request, Response } from 'express';
import { OTPService } from '../services/otp.service';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { logger } from '../utils/logger';
import speakeasy from 'speakeasy';

interface IFinalizeEnrollmentRequest {
    username: string;
    idpAlias: string;
    otpCode: string;
}

export class OTPEnrollmentController {
    /**
     * Finalize OTP enrollment by verifying code and creating credential via Keycloak Admin API
     * 
     * POST /api/auth/otp/finalize-enrollment
     * Body: { username, idpAlias, otpCode }
     */
    static async finalizeEnrollment(req: Request, res: Response): Promise<void> {
        const requestId = (req as any).id;
        const { username, idpAlias, otpCode } = req.body as IFinalizeEnrollmentRequest;

        logger.info({
            message: 'OTP enrollment finalization requested',
            username,
            idpAlias,
            requestId,
            service: 'dive-v3-backend'
        });

        try {
            // Validation
            if (!username || !idpAlias || !otpCode) {
                logger.error({
                    message: 'Missing required fields for OTP enrollment',
                    requestId,
                    service: 'dive-v3-backend'
                });
                res.status(400).json({
                    success: false,
                    error: 'Missing required fields: username, idpAlias, otpCode'
                });
                return;
            }

            // Convert idpAlias to realmName (CRITICAL FIX)
            let realmName: string;
            if (idpAlias === 'dive-v3-broker') {
                realmName = 'dive-v3-broker';
            } else if (idpAlias.includes('-realm-broker')) {
                // Convert usa-realm-broker → dive-v3-usa
                const countryCode = idpAlias.split('-')[0];
                realmName = `dive-v3-${countryCode}`;
            } else {
                realmName = idpAlias.replace('-idp', '');
            }

            logger.info({
                message: 'Realm name resolved',
                idpAlias,
                realmName,
                requestId,
                service: 'dive-v3-backend'
            });

            // Get user from Keycloak by username
            const user = await keycloakAdminService.getUserByUsername(realmName, username);

            if (!user || !user.id) {
                logger.error({
                    message: 'User not found in Keycloak',
                    username,
                    requestId,
                    service: 'dive-v3-backend'
                });
                res.status(404).json({
                    success: false,
                    error: 'User not found'
                });
                return;
            }

            // Get pending OTP secret from Redis
            const otpService = new OTPService();

            // Enhanced debug logging (Phase 5 Task 5.1)
            logger.info({
                message: 'Attempting to retrieve OTP secret from Redis',
                userId: user.id,
                userIdType: typeof user.id,
                userIdLength: user.id.length,
                redisKey: `otp:pending:${user.id}`,
                requestId,
                service: 'dive-v3-backend'
            });

            const pendingSecret = await otpService.getPendingSecret(user.id);

            if (!pendingSecret) {
                logger.error({
                    message: 'No pending OTP secret found in Redis',
                    userId: user.id,
                    userIdType: typeof user.id,
                    userIdLength: user.id.length,
                    redisKey: `otp:pending:${user.id}`,
                    possibleCauses: [
                        'Secret was never stored (bug in setup endpoint)',
                        'TTL expired (>10 minutes since setup)',
                        'Redis connection issue',
                        'userId mismatch between setup and finalize'
                    ],
                    requestId,
                    service: 'dive-v3-backend'
                });
                res.status(404).json({
                    success: false,
                    error: 'No pending OTP setup found. Please initiate OTP setup first.'
                });
                return;
            }

            logger.info({
                message: 'OTP secret successfully retrieved from Redis',
                userId: user.id,
                secretLength: pendingSecret.length,
                requestId,
                service: 'dive-v3-backend'
            });

            // Verify OTP code against pending secret
            const isValid = speakeasy.totp.verify({
                secret: pendingSecret,
                encoding: 'base32',
                token: otpCode,
                window: 1, // Allow ±30s
                algorithm: 'sha256' // Must match Keycloak OTP policy
            });

            if (!isValid) {
                logger.warn({
                    message: 'Invalid OTP code during enrollment',
                    userId: user.id,
                    requestId,
                    service: 'dive-v3-backend'
                });
                res.status(401).json({
                    success: false,
                    error: 'Invalid OTP code. Please try again.'
                });
                return;
            }

            // OTP code is valid - store secret for Custom SPI to create credential
            logger.info({
                message: 'OTP code verified - storing for Custom SPI credential creation',
                userId: user.id,
                realmName,
                requestId,
                service: 'dive-v3-backend'
            });

            // KEYCLOAK 26 FIX: Use otpService.createOTPCredential (stores in Redis)
            // NOT keycloakAdminService.createOTPCredential (uses removed Keycloak 26 endpoint)
            // The Custom SPI will create the actual credential on next login
            const credentialStored = await otpService.createOTPCredential(user.id, realmName, pendingSecret);

            if (!credentialStored) {
                logger.error({
                    message: 'Failed to store OTP credential for Custom SPI',
                    userId: user.id,
                    realmName,
                    requestId,
                    service: 'dive-v3-backend'
                });

                res.status(500).json({
                    success: false,
                    error: 'Failed to save OTP configuration. Please try again.'
                });
                return;
            }

            // Note: Secret stays in Redis for Custom SPI to retrieve on next login
            // Do NOT remove it here - it will be removed after SPI creates credential

            logger.info({
                message: 'OTP enrollment validated successfully',
                userId: user.id,
                username,
                realmName,
                requestId,
                service: 'dive-v3-backend',
                note: 'Credential will be created by Custom SPI on next login'
            });

            res.status(200).json({
                success: true,
                message: 'OTP verified successfully. Please log in again with your username, password, and OTP code to complete enrollment.'
            });

        } catch (error: any) {
            logger.error({
                message: 'Error during OTP enrollment finalization',
                error: error.message,
                stack: error.stack,
                requestId,
                service: 'dive-v3-backend'
            });

            res.status(500).json({
                success: false,
                error: 'Internal server error during OTP enrollment'
            });
        }
    }
}
