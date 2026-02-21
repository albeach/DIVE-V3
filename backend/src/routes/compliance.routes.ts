/**
 * Compliance Routes
 *
 * API endpoints for ACP-240 compliance dashboard
 *
 * @swagger
 * tags:
 *   - name: Compliance
 *     description: Audit logs and compliance monitoring
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
 * @swagger
 * /api/compliance/status:
 *   get:
 *     summary: Get overall ACP-240 compliance status
 *     description: Returns comprehensive compliance status dashboard
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Compliance status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overallStatus:
 *                   type: string
 *                   enum: [compliant, partial, non-compliant]
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                       details:
 *                         type: string
 */
router.get('/status', getComplianceStatus);

/**
 * @swagger
 * /api/compliance/multi-kas:
 *   get:
 *     summary: Get Multi-KAS architecture info
 *     description: Returns Multi-KAS visualization data
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Multi-KAS architecture data
 */
router.get('/multi-kas', getMultiKasInfo);

/**
 * @swagger
 * /api/compliance/coi-keys:
 *   get:
 *     summary: Get COI-based community keys
 *     description: Returns COI keys registry information
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: COI keys registry
 */
router.get('/coi-keys', getCoiKeysInfo);

/**
 * @swagger
 * /api/compliance/classifications:
 *   get:
 *     summary: Get classification equivalency mapping
 *     description: Returns classification level mappings across 12 nations
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Classification equivalency map
 */
router.get('/classifications', getClassificationEquivalency);

/**
 * @swagger
 * /api/compliance/certificates:
 *   get:
 *     summary: Get X.509 PKI certificate status
 *     description: Returns current certificate health and expiry info
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Certificate status
 */
router.get('/certificates', getCertificateStatus);

/**
 * @swagger
 * /api/compliance/nist-assurance:
 *   get:
 *     summary: Get NIST AAL/FAL assurance levels
 *     description: Returns NIST SP 800-63 assurance level mapping
 *     tags: [Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: NIST assurance levels
 */
router.get('/nist-assurance', getNistAssurance);

export default router;
