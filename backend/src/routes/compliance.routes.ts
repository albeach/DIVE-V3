/**
 * Compliance Routes
 * 
 * API endpoints for ACP-240 compliance dashboard
 */

import { Router } from 'express';
import {
    getComplianceStatus,
    getMultiKasInfo,
    getCoiKeysInfo,
    getClassificationEquivalency,
    getCertificateStatus,
    getNistAssurance,
} from '../controllers/compliance.controller';

const router = Router();

/**
 * GET /api/compliance/status
 * Overall ACP-240 compliance status dashboard
 */
router.get('/status', getComplianceStatus);

/**
 * GET /api/compliance/multi-kas
 * Multi-KAS architecture and visualization data
 */
router.get('/multi-kas', getMultiKasInfo);

/**
 * GET /api/compliance/coi-keys
 * COI-based community keys registry
 */
router.get('/coi-keys', getCoiKeysInfo);

/**
 * GET /api/compliance/classifications
 * Classification equivalency mapping (12 nations)
 */
router.get('/classifications', getClassificationEquivalency);

/**
 * GET /api/compliance/certificates
 * X.509 PKI certificate status
 */
router.get('/certificates', getCertificateStatus);

/**
 * GET /api/compliance/nist-assurance
 * NIST AAL/FAL assurance level mapping
 */
router.get('/nist-assurance', getNistAssurance);

export default router;

