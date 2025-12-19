/**
 * OTP Routes
 * 
 * Routes for OTP enrollment and management
 * 
 * Endpoints:
 * - POST /setup - Generate OTP secret and QR code
 * - POST /verify - Verify OTP code and create Keycloak credential
 * - POST /status - Check if user has OTP configured
 * - GET /pending-secret/:userId - Get pending secret from Redis (called by Custom SPI)
 * - DELETE /pending-secret/:userId - Remove pending secret after credential creation
 */

import { Router } from 'express';
import { 
    otpSetupHandler, 
    otpVerifyHandler, 
    otpStatusHandler,
    getPendingSecretHandler,
    removePendingSecretHandler
} from '../controllers/otp.controller';

const router = Router();

// Generate OTP secret and QR code for enrollment
router.post('/setup', otpSetupHandler);

// Verify OTP code and create credential
router.post('/verify', otpVerifyHandler);

// Check OTP status for user
router.post('/status', otpStatusHandler);

// Get pending OTP secret from Redis (called by Custom SPI)
router.get('/pending-secret/:userId', getPendingSecretHandler);

// Remove pending OTP secret from Redis (called by Custom SPI after credential creation)
router.delete('/pending-secret/:userId', removePendingSecretHandler);

export default router;
