/**
 * OTP Routes
 * 
 * Routes for OTP enrollment and management
 * 
 * Endpoints:
 * - POST /setup - Generate OTP secret and QR code
 * - POST /verify - Verify OTP code and create Keycloak credential
 * - POST /status - Check if user has OTP configured
 */

import { Router } from 'express';
import { otpSetupHandler, otpVerifyHandler, otpStatusHandler } from '../controllers/otp.controller';

const router = Router();

// Generate OTP secret and QR code for enrollment
router.post('/setup', otpSetupHandler);

// Verify OTP code and create credential
router.post('/verify', otpVerifyHandler);

// Check OTP status for user
router.post('/status', otpStatusHandler);

export default router;

