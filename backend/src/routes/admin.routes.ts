/**
 * Admin Routes
 *
 * All routes require super_admin role (enforced by adminAuthMiddleware)
 *
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Administrative operations and system management
 */

import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import {
    listIdPsHandler,
    getIdPHandler,
    createIdPHandler,
    updateIdPHandler,
    deleteIdPHandler,
    testIdPHandler,
    getPendingApprovalsHandler,
    approveIdPHandler,
    rejectIdPHandler,
    getMFAConfigHandler,
    updateMFAConfigHandler,
    testMFAFlowHandler,
    getSessionsHandler,
    revokeSessionHandler,
    revokeUserSessionsHandler,
    getSessionStatsHandler,
    getThemeHandler,
    updateThemeHandler,
    uploadThemeAssetHandler,
    deleteThemeHandler,
    previewThemeHandler,
    uploadMiddleware
} from '../controllers/admin.controller';
import {
    validateOIDCDiscoveryHandler,
    validateSAMLMetadataHandler,
    parseOIDCMetadataHandler,
    parseSAMLMetadataFileHandler
} from '../controllers/idp-validation.controller';
import {
    getLogsHandler,
    getViolationsHandler,
    getStatsHandler,
    exportLogsHandler
} from '../controllers/admin-log.controller';
import {
    generateNISTReportHandler,
    generateNATOReportHandler,
    exportComplianceReportHandler
} from '../controllers/compliance-report.controller';
import {
    listCertificates,
    getCertificateHealth,
    rotateCertificate,
    completeRotation,
    rollbackRotation,
    getRevocationList,
    revokeCertificate,
    checkRevocationStatus,
    updateCRL
} from '../controllers/admin-certificates.controller';
import { metricsService } from '../services/metrics.service';
import {
    getPolicyHandler,
    getOPAStatusHandler,
    toggleRuleHandler
} from '../controllers/admin-opa.controller';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// Identity Provider Management Routes
// ============================================

/**
 * @swagger
 * /api/admin/idps:
 *   get:
 *     summary: List all Identity Providers
 *     description: Returns all configured IdPs in Keycloak
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of IdPs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   alias:
 *                     type: string
 *                   displayName:
 *                     type: string
 *                   enabled:
 *                     type: boolean
 *                   providerId:
 *                     type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Requires super_admin role
 */
router.get('/idps', listIdPsHandler);

/**
 * @swagger
 * /api/admin/idps/{alias}:
 *   get:
 *     summary: Get specific Identity Provider
 *     description: Returns configuration for a specific IdP
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: IdP alias identifier
 *     responses:
 *       200:
 *         description: IdP configuration
 *       404:
 *         description: IdP not found
 */
router.get('/idps/:alias', getIdPHandler);

/**
 * @swagger
 * /api/admin/idps:
 *   post:
 *     summary: Create new Identity Provider
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               alias:
 *                 type: string
 *               displayName:
 *                 type: string
 *               providerId:
 *                 type: string
 *                 enum: [oidc, saml]
 *     responses:
 *       201:
 *         description: IdP created
 *       400:
 *         description: Invalid configuration
 */
router.post('/idps', createIdPHandler);

/**
 * @swagger
 * /api/admin/idps/{alias}:
 *   put:
 *     summary: Update Identity Provider
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: IdP updated
 *       404:
 *         description: IdP not found
 *   delete:
 *     summary: Delete Identity Provider
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: IdP deleted
 *       404:
 *         description: IdP not found
 */
router.put('/idps/:alias', updateIdPHandler);
router.delete('/idps/:alias', deleteIdPHandler);

/**
 * @swagger
 * /api/admin/idps/{alias}/test:
 *   post:
 *     summary: Test Identity Provider connectivity
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Connectivity test result
 */
router.post('/idps/:alias/test', testIdPHandler);

/**
 * POST /api/admin/idps/validate/oidc-discovery
 * Validate OIDC discovery endpoint (real-time validation for wizard)
 */
router.post('/idps/validate/oidc-discovery', validateOIDCDiscoveryHandler);

/**
 * POST /api/admin/idps/validate/saml-metadata
 * Validate SAML metadata XML (real-time validation for wizard)
 */
router.post('/idps/validate/saml-metadata', validateSAMLMetadataHandler);

/**
 * POST /api/admin/idps/parse/oidc-metadata
 * Upload OIDC discovery JSON and auto-populate form
 */
router.post('/idps/parse/oidc-metadata', parseOIDCMetadataHandler);

/**
 * POST /api/admin/idps/parse/saml-metadata
 * Upload SAML metadata XML and auto-populate form
 */
router.post('/idps/parse/saml-metadata', parseSAMLMetadataFileHandler);

// ============================================
// Audit Log Management Routes
// ============================================

/**
 * @swagger
 * /api/admin/logs:
 *   get:
 *     summary: Query audit logs
 *     description: Search and filter audit logs with pagination
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *       - in: query
 *         name: level
 *         schema:
 *           type: string
 *           enum: [info, warn, error]
 *     responses:
 *       200:
 *         description: Paginated audit logs
 */
router.get('/logs', getLogsHandler);

/**
 * @swagger
 * /api/admin/logs/violations:
 *   get:
 *     summary: Get security violations
 *     description: Returns list of security policy violations
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Security violations list
 */
router.get('/logs/violations', getViolationsHandler);

/**
 * @swagger
 * /api/admin/logs/stats:
 *   get:
 *     summary: Get log statistics
 *     description: Returns aggregated log statistics
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Log statistics
 */
router.get('/logs/stats', getStatsHandler);

/**
 * @swagger
 * /api/admin/logs/export:
 *   get:
 *     summary: Export logs to JSON
 *     description: Export audit logs for compliance reporting
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Exported logs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 */
router.get('/logs/export', exportLogsHandler);

// ============================================
// Compliance Reporting Routes (Phase 12)
// ============================================

/**
 * GET /api/admin/compliance/reports/nist
 * Generate NIST SP 800-63-3 compliance report
 */
router.get('/compliance/reports/nist', generateNISTReportHandler);

/**
 * GET /api/admin/compliance/reports/nato
 * Generate NATO ACP-240 compliance report
 */
router.get('/compliance/reports/nato', generateNATOReportHandler);

/**
 * GET /api/admin/compliance/reports/export
 * Export compliance report (JSON or CSV)
 */
router.get('/compliance/reports/export', exportComplianceReportHandler);

// ============================================
// IdP Approval Workflow Routes
// ============================================

/**
 * GET /api/admin/approvals/pending
 * Get pending IdP submissions
 */
router.get('/approvals/pending', getPendingApprovalsHandler);

/**
 * POST /api/admin/approvals/:alias/approve
 * Approve pending IdP
 */
router.post('/approvals/:alias/approve', approveIdPHandler);

/**
 * POST /api/admin/approvals/:alias/reject
 * Reject pending IdP
 */
router.post('/approvals/:alias/reject', rejectIdPHandler);

// ============================================
// MFA Configuration Routes (Phase 1.5)
// ============================================

/**
 * GET /api/admin/idps/:alias/mfa-config
 * Get MFA configuration for realm
 */
router.get('/idps/:alias/mfa-config', getMFAConfigHandler);

/**
 * PUT /api/admin/idps/:alias/mfa-config
 * Update MFA configuration for realm
 */
router.put('/idps/:alias/mfa-config', updateMFAConfigHandler);

/**
 * POST /api/admin/idps/:alias/mfa-config/test
 * Test MFA flow
 */
router.post('/idps/:alias/mfa-config/test', testMFAFlowHandler);

// ============================================
// Session Management Routes (Phase 1.6)
// ============================================

/**
 * GET /api/admin/idps/:alias/sessions
 * Get active sessions for realm
 */
router.get('/idps/:alias/sessions', getSessionsHandler);

/**
 * DELETE /api/admin/idps/:alias/sessions/:sessionId
 * Revoke specific session
 */
router.delete('/idps/:alias/sessions/:sessionId', revokeSessionHandler);

/**
 * DELETE /api/admin/idps/:alias/users/:username/sessions
 * Revoke all sessions for a user
 */
router.delete('/idps/:alias/users/:username/sessions', revokeUserSessionsHandler);

/**
 * GET /api/admin/idps/:alias/sessions/stats
 * Get session statistics
 */
router.get('/idps/:alias/sessions/stats', getSessionStatsHandler);

// ============================================
// Theme Management Routes (Phase 1.7)
// ============================================

/**
 * GET /api/admin/idps/:alias/theme
 * Get theme for IdP
 */
router.get('/idps/:alias/theme', getThemeHandler);

/**
 * PUT /api/admin/idps/:alias/theme
 * Update theme for IdP
 */
router.put('/idps/:alias/theme', updateThemeHandler);

/**
 * POST /api/admin/idps/:alias/theme/upload
 * Upload theme asset (background or logo)
 */
router.post('/idps/:alias/theme/upload', uploadMiddleware, uploadThemeAssetHandler);

/**
 * DELETE /api/admin/idps/:alias/theme
 * Delete theme (revert to default)
 */
router.delete('/idps/:alias/theme', deleteThemeHandler);

/**
 * GET /api/admin/idps/:alias/theme/preview
 * Get theme preview HTML
 */
router.get('/idps/:alias/theme/preview', previewThemeHandler);

// ============================================
// Certificate Management Routes
// ============================================

/**
 * GET /api/admin/certificates
 * List all certificates with status
 */
router.get('/certificates', listCertificates);

/**
 * GET /api/admin/certificates/health
 * Get certificate health dashboard
 */
router.get('/certificates/health', getCertificateHealth);

/**
 * POST /api/admin/certificates/rotate
 * Trigger certificate rotation
 */
router.post('/certificates/rotate', rotateCertificate);

/**
 * POST /api/admin/certificates/rotation/complete
 * Complete certificate rotation
 */
router.post('/certificates/rotation/complete', completeRotation);

/**
 * POST /api/admin/certificates/rotation/rollback
 * Rollback certificate rotation
 */
router.post('/certificates/rotation/rollback', rollbackRotation);

/**
 * GET /api/admin/certificates/revocation-list
 * View Certificate Revocation List
 */
router.get('/certificates/revocation-list', getRevocationList);

/**
 * POST /api/admin/certificates/revoke
 * Revoke a certificate
 */
router.post('/certificates/revoke', revokeCertificate);

/**
 * GET /api/admin/certificates/revocation-status/:serialNumber
 * Check certificate revocation status
 */
router.get('/certificates/revocation-status/:serialNumber', checkRevocationStatus);

/**
 * POST /api/admin/certificates/revocation-list/update
 * Update CRL
 */
router.post('/certificates/revocation-list/update', updateCRL);

// ============================================
// Analytics Routes (Phase 3)
// ============================================

import { analyticsService } from '../services/analytics.service';

/**
 * GET /api/admin/analytics/risk-distribution
 * Get risk distribution by tier
 */
router.get('/analytics/risk-distribution', async (_req: Request, res: Response) => {
    try {
        const distribution = await analyticsService.getRiskDistribution();
        res.json(distribution);
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch risk distribution',
        });
    }
});

/**
 * GET /api/admin/analytics/compliance-trends
 * Get compliance trends over time
 */
router.get('/analytics/compliance-trends', async (req: Request, res: Response) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const trends = await analyticsService.getComplianceTrends({ startDate, endDate });
        res.json(trends);
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch compliance trends',
        });
    }
});

/**
 * GET /api/admin/analytics/sla-metrics
 * Get SLA performance metrics
 */
router.get('/analytics/sla-metrics', async (_req: Request, res: Response) => {
    try {
        const metrics = await analyticsService.getSLAMetrics();
        res.json(metrics);
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch SLA metrics',
        });
    }
});

/**
 * GET /api/admin/analytics/authz-metrics
 * Get authorization decision metrics
 */
router.get('/analytics/authz-metrics', async (req: Request, res: Response) => {
    try {
        const startDate = req.query.startDate ? new Date(req.query.startDate as string) : undefined;
        const endDate = req.query.endDate ? new Date(req.query.endDate as string) : undefined;

        const metrics = await analyticsService.getAuthzMetrics({ startDate, endDate });
        res.json(metrics);
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch authorization metrics',
        });
    }
});

/**
 * GET /api/admin/analytics/security-posture
 * Get security posture overview
 */
router.get('/analytics/security-posture', async (_req: Request, res: Response) => {
    try {
        const posture = await analyticsService.getSecurityPosture();
        res.json(posture);
    } catch (error) {
        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to fetch security posture',
        });
    }
});

// ============================================
// Observability Routes (Phase 0)
// ============================================

/**
 * GET /api/admin/metrics
 * Prometheus-compatible metrics endpoint
 */
router.get('/metrics', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsService.exportPrometheus());
});

/**
 * GET /api/admin/metrics/summary
 * Human-readable metrics summary (JSON)
 */
router.get('/metrics/summary', (_req: Request, res: Response) => {
    const summary = metricsService.getSummary();
    res.json({
        success: true,
        data: summary
    });
});

// ============================================
// OPA Policy Management Routes
// ============================================

/**
 * GET /api/admin/opa/status
 * Get OPA server status and policy files
 */
router.get('/opa/status', getOPAStatusHandler);

/**
 * GET /api/admin/opa/policy
 * Get OPA policy content by file name
 */
router.get('/opa/policy', getPolicyHandler);

/**
 * POST /api/admin/opa/policy/toggle-rule
 * Toggle a policy rule on/off
 */
router.post('/opa/policy/toggle-rule', toggleRuleHandler);

export default router;
