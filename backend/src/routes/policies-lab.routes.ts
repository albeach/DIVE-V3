/**
 * Policies Lab Routes
 * 
 * API routes for policy upload, evaluation, and management.
 * 
 * Date: October 26, 2025
 */

import { Router } from 'express';
import multer from 'multer';
import rateLimit from 'express-rate-limit';
import {
    uploadPolicy,
    evaluatePolicyById,
    getPolicyMetadata,
    deletePolicy,
    listUserPolicies,
    loadSamplePolicies
} from '../controllers/policies-lab.controller';
import { authenticateJWT } from '../middleware/authz.middleware';

const router = Router();

// Rate limiters for Policies Lab endpoints
const uploadRateLimiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 5,
    message: 'Too many uploads, try again later',
    standardHeaders: true,
    legacyHeaders: false
});

const evaluateRateLimiter = rateLimit({
    windowMs: 60000, // 1 minute
    max: 100,
    message: 'Too many evaluations, try again later',
    standardHeaders: true,
    legacyHeaders: false
});

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 256 * 1024, // 256KB
        files: 1
    },
    fileFilter: (_req, file, cb) => {
        // Accept only .rego and .xml files
        const allowedExtensions = ['.rego', '.xml'];
        const extension = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));

        if (allowedExtensions.includes(extension)) {
            cb(null, true);
        } else {
            cb(new Error('Only .rego and .xml files are allowed'));
        }
    }
});

// ============================================================================
// Policy Lab Routes
// ============================================================================

/**
 * POST /api/policies/upload
 * Upload and validate a policy
 * Rate limit: 5 uploads per minute
 */
router.post(
    '/upload',
    authenticateJWT,
    uploadRateLimiter,
    upload.single('file'),
    uploadPolicy
);

/**
 * GET /api/policies/list
 * List user's policies
 */
router.get(
    '/list',
    authenticateJWT,
    listUserPolicies
);

/**
 * POST /api/policies/:id/evaluate
 * Evaluate a policy with input
 * Rate limit: 100 evaluations per minute
 */
router.post(
    '/:id/evaluate',
    authenticateJWT,
    evaluateRateLimiter,
    evaluatePolicyById
);

/**
 * GET /api/policies/:id
 * Get policy metadata
 */
router.get(
    '/:id',
    authenticateJWT,
    getPolicyMetadata
);

/**
 * DELETE /api/policies/:id
 * Delete a policy
 */
router.delete(
    '/:id',
    authenticateJWT,
    deletePolicy
);

/**
 * POST /api/policies-lab/load-samples
 * Load sample policies into user's account
 */
router.post(
    '/load-samples',
    authenticateJWT,
    loadSamplePolicies
);

export default router;

