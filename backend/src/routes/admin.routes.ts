/**
 * Admin Routes
 * 
 * All routes require super_admin role (enforced by adminAuthMiddleware)
 * 
 * Routes:
 * - GET /api/admin/idps - List all IdPs
 * - GET /api/admin/idps/:alias - Get specific IdP
 * - POST /api/admin/idps - Create new IdP
 * - PUT /api/admin/idps/:alias - Update IdP
 * - DELETE /api/admin/idps/:alias - Delete IdP
 * - POST /api/admin/idps/:alias/test - Test IdP connectivity
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
    listUsersHandler,
    getUserHandler,
    createUserHandler,
    updateUserHandler,
    deleteUserHandler,
    resetPasswordHandler
} from '../controllers/admin-users.controller';
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

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// User Management Routes
// ============================================

/**
 * GET /api/admin/users
 * List users
 */
router.get('/users', listUsersHandler);

/**
 * GET /api/admin/users/:id
 * Get user details
 */
router.get('/users/:id', getUserHandler);

/**
 * POST /api/admin/users
 * Create user
 */
router.post('/users', createUserHandler);

/**
 * PUT /api/admin/users/:id
 * Update user
 */
router.put('/users/:id', updateUserHandler);

/**
 * DELETE /api/admin/users/:id
 * Delete user
 */
router.delete('/users/:id', deleteUserHandler);

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password
 */
router.post('/users/:id/reset-password', resetPasswordHandler);

// ============================================
// Identity Provider Management Routes
// ============================================

/**
 * GET /api/admin/idps
 * List all Identity Providers
 */
router.get('/idps', listIdPsHandler);

/**
 * GET /api/admin/idps/:alias
 * Get specific Identity Provider
 */
router.get('/idps/:alias', getIdPHandler);

/**
 * POST /api/admin/idps
 * Create new Identity Provider
 */
router.post('/idps', createIdPHandler);

/**
 * PUT /api/admin/idps/:alias
 * Update Identity Provider
 */
router.put('/idps/:alias', updateIdPHandler);

/**
 * DELETE /api/admin/idps/:alias
 * Delete Identity Provider
 */
router.delete('/idps/:alias', deleteIdPHandler);

/**
 * POST /api/admin/idps/:alias/test
 * Test Identity Provider connectivity
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
 * GET /api/admin/logs
 * Query audit logs
 */
router.get('/logs', getLogsHandler);

/**
 * GET /api/admin/logs/violations
 * Get security violations
 */
router.get('/logs/violations', getViolationsHandler);

/**
 * GET /api/admin/logs/stats
 * Get log statistics
 */
router.get('/logs/stats', getStatsHandler);

/**
 * GET /api/admin/logs/export
 * Export logs to JSON
 */
router.get('/logs/export', exportLogsHandler);

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

import {
    getPolicyHandler,
    updatePolicyHandler,
    toggleRuleHandler,
    getOPAStatusHandler
} from '../controllers/admin-opa.controller';

/**
 * GET /api/admin/opa/status
 * Get OPA server status
 */
router.get('/opa/status', getOPAStatusHandler);

/**
 * GET /api/admin/opa/policy
 * Get current policy content
 */
router.get('/opa/policy', getPolicyHandler);

/**
 * POST /api/admin/opa/policy/update
 * Update OPA policy dynamically
 */
router.post('/opa/policy/update', updatePolicyHandler);

/**
 * POST /api/admin/opa/policy/toggle-rule
 * Toggle a specific policy rule on/off
 */
router.post('/opa/policy/toggle-rule', toggleRuleHandler);

export default router;

