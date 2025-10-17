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
    createAuth0ApplicationHandler,
    listAuth0ApplicationsHandler
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
import { metricsService } from '../services/metrics.service';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

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
// Auth0 MCP Integration Routes (Week 3.4.6)
// ============================================

/**
 * POST /api/admin/auth0/create-application
 * Create Auth0 application via MCP Server
 */
router.post('/auth0/create-application', createAuth0ApplicationHandler);

/**
 * GET /api/admin/auth0/applications
 * List Auth0 applications
 */
router.get('/auth0/applications', listAuth0ApplicationsHandler);

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

export default router;

