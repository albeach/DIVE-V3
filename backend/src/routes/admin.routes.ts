/**
 * Admin Routes
 *
 * Role-based access control:
 * - 'admin' role: User/session management, read-only access to IdPs/federation/audit
 * - 'super_admin' role: Full access including IdP mutations, federation approval, certificates
 *
 * Base authentication via adminAuthMiddleware (requires any admin role)
 * Critical operations protected by requireSuperAdmin middleware
 *
 * @swagger
 * tags:
 *   - name: Admin
 *     description: Administrative operations and system management
 */

import { Router, Request, Response } from 'express';
import { adminAuthMiddleware } from '../middleware/admin-auth.middleware';
import { requireSuperAdmin } from '../middleware/admin.middleware';
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
    revokeSessionHandler as revokeIdPSessionHandler,
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
import { validateSystem, quickHealth } from '../controllers/validation.controller';
import { metricsService } from '../services/metrics.service';
import {
    getPolicyHandler,
    getOPAStatusHandler,
    toggleRuleHandler
} from '../controllers/admin-opa.controller';
import {
    listUsersHandler,
    getUserHandler,
    createUserHandler,
    updateUserHandler,
    deleteUserHandler,
    resetPasswordHandler
} from '../controllers/admin-users.controller';
import {
    getResourceHealthHandler,
    getResourceMetricsHandler
} from '../controllers/admin-resources.controller';
import {
    getSessionAnalyticsHandler,
    getSessionsListHandler,
    revokeSessionHandler,
    revokeAllUserSessionsHandler
} from '../controllers/admin-sessions.controller';
import {
    getLogsRetentionHandler,
    updateLogsRetentionHandler,
    exportLogsAdvancedHandler
} from '../controllers/admin-logs-retention.controller';
import {
    getFederationStatisticsHandler,
    getFederationTrafficHandler
} from '../controllers/federation-statistics.controller';

const router = Router();

// ============================================
// Apply admin authentication to all routes
// ============================================
router.use(adminAuthMiddleware);

// ============================================
// User Management Routes
// ============================================

/**
 * @swagger
 * /api/admin/users:
 *   get:
 *     summary: List users
 *     description: Returns paginated list of users with search capability
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of users
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                     total:
 *                       type: integer
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */
router.get('/users', listUsersHandler);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   get:
 *     summary: Get user details
 *     description: Returns detailed information for a specific user
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User details
 *       404:
 *         description: User not found
 */
router.get('/users/:id', getUserHandler);

/**
 * @swagger
 * /api/admin/users:
 *   post:
 *     summary: Create new user
 *     description: Creates a new user in Keycloak (requires super_admin role)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - username
 *               - email
 *             properties:
 *               username:
 *                 type: string
 *               email:
 *                 type: string
 *               firstName:
 *                 type: string
 *               lastName:
 *                 type: string
 *               enabled:
 *                 type: boolean
 *               password:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *       403:
 *         description: Requires super_admin role
 */
router.post('/users', requireSuperAdmin, createUserHandler);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   put:
 *     summary: Update user
 *     description: Updates user information (requires super_admin role)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: User updated successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Requires super_admin role
 */
router.put('/users/:id', requireSuperAdmin, updateUserHandler);

/**
 * @swagger
 * /api/admin/users/{id}:
 *   delete:
 *     summary: Delete user
 *     description: Deletes a user from Keycloak (requires super_admin role)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: User deleted successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Requires super_admin role
 */
router.delete('/users/:id', requireSuperAdmin, deleteUserHandler);

/**
 * @swagger
 * /api/admin/users/{id}/reset-password:
 *   post:
 *     summary: Reset user password
 *     description: Resets a user's password (requires super_admin role)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - password
 *             properties:
 *               password:
 *                 type: string
 *               temporary:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Password reset successfully
 *       404:
 *         description: User not found
 *       403:
 *         description: Requires super_admin role
 */
router.post('/users/:id/reset-password', requireSuperAdmin, resetPasswordHandler);

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
 *       403:
 *         description: Requires super_admin role
 */
router.post('/idps', requireSuperAdmin, createIdPHandler);

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
 *       403:
 *         description: Requires super_admin role
 */
router.put('/idps/:alias', requireSuperAdmin, updateIdPHandler);
router.delete('/idps/:alias', requireSuperAdmin, deleteIdPHandler);

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
 * @openapi
 * /api/admin/idps/validate/oidc-discovery:
 *   post:
 *     summary: Validate OIDC discovery endpoint
 *     description: Real-time validation of OIDC discovery URL for IdP creation wizard
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
 *               discoveryUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://idp.example.com/.well-known/openid-configuration
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 issuer:
 *                   type: string
 *                 authorizationEndpoint:
 *                   type: string
 *                 tokenEndpoint:
 *                   type: string
 *       400:
 *         description: Invalid discovery URL or unreachable endpoint
 */
router.post('/idps/validate/oidc-discovery', validateOIDCDiscoveryHandler);

/**
 * @openapi
 * /api/admin/idps/validate/saml-metadata:
 *   post:
 *     summary: Validate SAML metadata XML
 *     description: Real-time validation of SAML metadata for IdP creation wizard
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/xml:
 *           schema:
 *             type: string
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 entityId:
 *                   type: string
 *                 ssoServiceUrl:
 *                   type: string
 *       400:
 *         description: Invalid SAML metadata
 */
router.post('/idps/validate/saml-metadata', validateSAMLMetadataHandler);

/**
 * @openapi
 * /api/admin/idps/parse/oidc-metadata:
 *   post:
 *     summary: Parse OIDC metadata
 *     description: Upload OIDC discovery JSON and extract configuration for auto-population
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Parsed OIDC configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                 authorizationEndpoint:
 *                   type: string
 *                 tokenEndpoint:
 *                   type: string
 *                 userInfoEndpoint:
 *                   type: string
 *                 jwksUri:
 *                   type: string
 */
router.post('/idps/parse/oidc-metadata', parseOIDCMetadataHandler);

/**
 * @openapi
 * /api/admin/idps/parse/saml-metadata:
 *   post:
 *     summary: Parse SAML metadata file
 *     description: Upload SAML metadata XML and extract configuration for auto-population
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       200:
 *         description: Parsed SAML configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entityId:
 *                   type: string
 *                 singleSignOnServiceUrl:
 *                   type: string
 *                 x509Certificate:
 *                   type: string
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
 * @openapi
 * /api/admin/compliance/reports/nist:
 *   get:
 *     summary: Generate NIST compliance report
 *     description: |
 *       Generate NIST SP 800-63-3 Digital Identity Guidelines compliance report.
 *       Evaluates authentication assurance levels (AAL) and identity proofing.
 *     tags: [Admin, Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: NIST compliance report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 standard:
 *                   type: string
 *                   example: NIST SP 800-63-3
 *                 overallCompliance:
 *                   type: string
 *                   enum: [compliant, partial, non-compliant]
 *                 aal:
 *                   type: string
 *                   example: AAL2
 *                 sections:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/compliance/reports/nist', generateNISTReportHandler);

/**
 * @openapi
 * /api/admin/compliance/reports/nato:
 *   get:
 *     summary: Generate NATO compliance report
 *     description: |
 *       Generate NATO ACP-240 (Coalition-Friendly ICAM) compliance report.
 *       Evaluates cross-domain identity federation and ABAC policies.
 *     tags: [Admin, Compliance]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: NATO ACP-240 compliance report
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 standard:
 *                   type: string
 *                   example: NATO ACP-240
 *                 overallCompliance:
 *                   type: string
 *                   enum: [compliant, partial, non-compliant]
 *                 categories:
 *                   type: array
 *                   items:
 *                     type: object
 */
router.get('/compliance/reports/nato', generateNATOReportHandler);

/**
 * @openapi
 * /api/admin/compliance/reports/export:
 *   get:
 *     summary: Export compliance report
 *     description: Export compliance data in JSON or CSV format for auditing
 *     tags: [Admin, Compliance]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [json, csv]
 *           default: json
 *       - in: query
 *         name: standard
 *         schema:
 *           type: string
 *           enum: [nist, nato, all]
 *           default: all
 *     responses:
 *       200:
 *         description: Exported compliance data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *           text/csv:
 *             schema:
 *               type: string
 */
router.get('/compliance/reports/export', exportComplianceReportHandler);

// ============================================
// IdP Approval Workflow Routes
// ============================================

/**
 * @openapi
 * /api/admin/approvals/pending:
 *   get:
 *     summary: Get pending IdP submissions
 *     description: Returns list of Identity Providers awaiting approval
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of pending IdPs
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
 *                   submittedBy:
 *                     type: string
 *                   submittedAt:
 *                     type: string
 *                     format: date-time
 *                   providerId:
 *                     type: string
 *                     enum: [oidc, saml]
 */
router.get('/approvals/pending', getPendingApprovalsHandler);

/**
 * @openapi
 * /api/admin/approvals/{alias}/approve:
 *   post:
 *     summary: Approve pending IdP
 *     description: Approve and activate a pending Identity Provider registration (super_admin only)
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
 *         description: IdP approved successfully
 *       403:
 *         description: Requires super_admin role
 *       404:
 *         description: Pending IdP not found
 */
router.post('/approvals/:alias/approve', requireSuperAdmin, approveIdPHandler);

/**
 * @openapi
 * /api/admin/approvals/{alias}/reject:
 *   post:
 *     summary: Reject pending IdP
 *     description: Reject a pending Identity Provider registration (super_admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Rejection reason
 *     responses:
 *       200:
 *         description: IdP rejected successfully
 *       403:
 *         description: Requires super_admin role
 *       404:
 *         description: Pending IdP not found
 */
router.post('/approvals/:alias/reject', requireSuperAdmin, rejectIdPHandler);

// ============================================
// MFA Configuration Routes (Phase 1.5)
// ============================================

/**
 * @openapi
 * /api/admin/idps/{alias}/mfa-config:
 *   get:
 *     summary: Get MFA configuration
 *     description: Returns Multi-Factor Authentication configuration for an IdP realm
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
 *         description: MFA configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 enabled:
 *                   type: boolean
 *                 requiredActions:
 *                   type: array
 *                   items:
 *                     type: string
 *                 otpPolicyType:
 *                   type: string
 *                   enum: [totp, hotp]
 */
router.get('/idps/:alias/mfa-config', getMFAConfigHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/mfa-config:
 *   put:
 *     summary: Update MFA configuration
 *     description: Update Multi-Factor Authentication settings for an IdP realm (super_admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               enabled:
 *                 type: boolean
 *               otpPolicyType:
 *                 type: string
 *                 enum: [totp, hotp]
 *     responses:
 *       200:
 *         description: MFA configuration updated
 *       403:
 *         description: Requires super_admin role
 */
router.put('/idps/:alias/mfa-config', requireSuperAdmin, updateMFAConfigHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/mfa-config/test:
 *   post:
 *     summary: Test MFA flow
 *     description: Validate MFA configuration by simulating authentication flow
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
 *         description: MFA test result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 */
router.post('/idps/:alias/mfa-config/test', testMFAFlowHandler);

// ============================================
// Session Management Routes (Phase 1.6)
// ============================================

/**
 * @openapi
 * /api/admin/idps/{alias}/sessions:
 *   get:
 *     summary: Get active sessions
 *     description: Returns list of active user sessions for an IdP realm
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
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of active sessions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sessions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       sessionId:
 *                         type: string
 *                       username:
 *                         type: string
 *                       ipAddress:
 *                         type: string
 *                       start:
 *                         type: string
 *                         format: date-time
 *                       lastAccess:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 */
router.get('/idps/:alias/sessions', getSessionsHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/sessions/{sessionId}:
 *   delete:
 *     summary: Revoke session
 *     description: Immediately revoke a specific user session
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: sessionId
 *         required: true
 *         schema:
 *           type: string
 *         description: Session identifier to revoke
 *     responses:
 *       200:
 *         description: Session revoked successfully
 *       404:
 *         description: Session not found
 */
router.delete('/idps/:alias/sessions/:sessionId', revokeIdPSessionHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/users/{username}/sessions:
 *   delete:
 *     summary: Revoke all user sessions
 *     description: Revoke all active sessions for a specific user (force logout)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: username
 *         required: true
 *         schema:
 *           type: string
 *         description: Username whose sessions will be revoked
 *     responses:
 *       200:
 *         description: All user sessions revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revokedCount:
 *                   type: integer
 *                   example: 3
 *       404:
 *         description: User not found
 */
router.delete('/idps/:alias/users/:username/sessions', revokeUserSessionsHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/sessions/stats:
 *   get:
 *     summary: Get session statistics
 *     description: Returns aggregated session metrics for an IdP realm
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
 *         description: Session statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalActiveSessions:
 *                   type: integer
 *                   example: 142
 *                 uniqueUsers:
 *                   type: integer
 *                   example: 89
 *                 averageSessionDuration:
 *                   type: number
 *                   description: Duration in minutes
 *                   example: 45.2
 */
router.get('/idps/:alias/sessions/stats', getSessionStatsHandler);

// ============================================
// Theme Management Routes (Phase 1.7)
// ============================================

/**
 * @openapi
 * /api/admin/idps/{alias}/theme:
 *   get:
 *     summary: Get IdP theme
 *     description: Returns custom theme configuration for login pages
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
 *         description: Theme configuration
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 primaryColor:
 *                   type: string
 *                   example: '#4396ac'
 *                 secondaryColor:
 *                   type: string
 *                   example: '#90d56a'
 *                 logoUrl:
 *                   type: string
 *                 customCss:
 *                   type: string
 *       404:
 *         description: No custom theme configured
 */
router.get('/idps/:alias/theme', getThemeHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/theme:
 *   put:
 *     summary: Update IdP theme
 *     description: Update custom theme for IdP login pages (super_admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               primaryColor:
 *                 type: string
 *                 pattern: '^#[0-9A-Fa-f]{6}$'
 *               secondaryColor:
 *                 type: string
 *                 pattern: '^#[0-9A-Fa-f]{6}$'
 *               logoUrl:
 *                 type: string
 *                 format: uri
 *               customCss:
 *                 type: string
 *     responses:
 *       200:
 *         description: Theme updated successfully
 *       403:
 *         description: Requires super_admin role
 */
router.put('/idps/:alias/theme', requireSuperAdmin, updateThemeHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/theme/upload:
 *   post:
 *     summary: Upload theme asset
 *     description: Upload logo or custom asset for IdP theme (super_admin only)
 *     tags: [Admin]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Image file (PNG, JPG, SVG)
 *     responses:
 *       200:
 *         description: Asset uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 url:
 *                   type: string
 *                   format: uri
 *       400:
 *         description: Invalid file type or size
 *       403:
 *         description: Requires super_admin role
 */
router.post('/idps/:alias/theme/upload', requireSuperAdmin, uploadMiddleware, uploadThemeAssetHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/theme:
 *   delete:
 *     summary: Delete custom theme
 *     description: Remove custom theme and revert to default (super_admin only)
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
 *         description: Theme deleted, reverted to default
 *       403:
 *         description: Requires super_admin role
 */
router.delete('/idps/:alias/theme', requireSuperAdmin, deleteThemeHandler);

/**
 * @openapi
 * /api/admin/idps/{alias}/theme/preview:
 *   get:
 *     summary: Preview theme
 *     description: Returns rendered login page with theme applied for preview
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
 *         description: HTML preview
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/idps/:alias/theme/preview', previewThemeHandler);

// ============================================
// Certificate Management Routes
// ============================================

/**
 * @openapi
 * /api/admin/certificates:
 *   get:
 *     summary: List certificates
 *     description: Returns all X.509 certificates with expiration status
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of certificates
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   serialNumber:
 *                     type: string
 *                   subject:
 *                     type: string
 *                   issuer:
 *                     type: string
 *                   validFrom:
 *                     type: string
 *                     format: date-time
 *                   validTo:
 *                     type: string
 *                     format: date-time
 *                   daysUntilExpiry:
 *                     type: integer
 *                   status:
 *                     type: string
 *                     enum: [valid, expiring_soon, expired, revoked]
 */
router.get('/certificates', listCertificates);

/**
 * @openapi
 * /api/admin/certificates/health:
 *   get:
 *     summary: Certificate health dashboard
 *     description: Returns certificate health metrics and expiration warnings
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Certificate health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overallHealth:
 *                   type: string
 *                   enum: [healthy, warning, critical]
 *                 totalCertificates:
 *                   type: integer
 *                 expiringWithin30Days:
 *                   type: integer
 *                 expiringWithin90Days:
 *                   type: integer
 *                 expired:
 *                   type: integer
 *                 revoked:
 *                   type: integer
 */
router.get('/certificates/health', getCertificateHealth);

/**
 * @openapi
 * /api/admin/certificates/rotate:
 *   post:
 *     summary: Rotate certificate
 *     description: |
 *       Initiate certificate rotation process (super_admin only).
 *       Creates new certificate and begins gradual transition.
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               certificateType:
 *                 type: string
 *                 enum: [tls, signing, encryption]
 *               validityDays:
 *                 type: integer
 *                 default: 365
 *                 minimum: 90
 *                 maximum: 825
 *     responses:
 *       200:
 *         description: Rotation initiated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 rotationId:
 *                   type: string
 *                 status:
 *                   type: string
 *                   example: in_progress
 *       403:
 *         description: Requires super_admin role
 */
router.post('/certificates/rotate', requireSuperAdmin, rotateCertificate);

/**
 * @openapi
 * /api/admin/certificates/rotation/complete:
 *   post:
 *     summary: Complete certificate rotation
 *     description: Finalize rotation and activate new certificate (super_admin only)
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rotationId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rotation completed successfully
 *       400:
 *         description: Rotation not in valid state
 *       403:
 *         description: Requires super_admin role
 */
router.post('/certificates/rotation/complete', requireSuperAdmin, completeRotation);

/**
 * @openapi
 * /api/admin/certificates/rotation/rollback:
 *   post:
 *     summary: Rollback certificate rotation
 *     description: Cancel rotation and revert to previous certificate (super_admin only)
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rotationId:
 *                 type: string
 *               reason:
 *                 type: string
 *     responses:
 *       200:
 *         description: Rotation rolled back successfully
 *       400:
 *         description: Cannot rollback completed rotation
 *       403:
 *         description: Requires super_admin role
 */
router.post('/certificates/rotation/rollback', requireSuperAdmin, rollbackRotation);

/**
 * @openapi
 * /api/admin/certificates/revocation-list:
 *   get:
 *     summary: Get Certificate Revocation List
 *     description: Returns current CRL with all revoked certificates
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Certificate Revocation List
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: integer
 *                 issuer:
 *                   type: string
 *                 thisUpdate:
 *                   type: string
 *                   format: date-time
 *                 nextUpdate:
 *                   type: string
 *                   format: date-time
 *                 revokedCertificates:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       serialNumber:
 *                         type: string
 *                       revocationDate:
 *                         type: string
 *                         format: date-time
 *                       reason:
 *                         type: string
 */
router.get('/certificates/revocation-list', getRevocationList);

/**
 * @openapi
 * /api/admin/certificates/revoke:
 *   post:
 *     summary: Revoke certificate
 *     description: Add certificate to revocation list (super_admin only)
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serialNumber:
 *                 type: string
 *               reason:
 *                 type: string
 *                 enum: [unspecified, keyCompromise, caCompromise, affiliationChanged, superseded, cessationOfOperation]
 *             required: [serialNumber, reason]
 *     responses:
 *       200:
 *         description: Certificate revoked successfully
 *       404:
 *         description: Certificate not found
 *       403:
 *         description: Requires super_admin role
 */
router.post('/certificates/revoke', requireSuperAdmin, revokeCertificate);

/**
 * @openapi
 * /api/admin/certificates/revocation-status/{serialNumber}:
 *   get:
 *     summary: Check revocation status
 *     description: Verify if a certificate has been revoked
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: serialNumber
 *         required: true
 *         schema:
 *           type: string
 *         description: Certificate serial number (hex format)
 *     responses:
 *       200:
 *         description: Revocation status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 revoked:
 *                   type: boolean
 *                 revocationDate:
 *                   type: string
 *                   format: date-time
 *                 reason:
 *                   type: string
 */
router.get('/certificates/revocation-status/:serialNumber', checkRevocationStatus);

/**
 * @openapi
 * /api/admin/certificates/revocation-list/update:
 *   post:
 *     summary: Update CRL
 *     description: Force regeneration of Certificate Revocation List (super_admin only)
 *     tags: [Admin, Certificates]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: CRL updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: integer
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *       403:
 *         description: Requires super_admin role
 */
router.post('/certificates/revocation-list/update', requireSuperAdmin, updateCRL);

// ============================================
// Analytics Routes (Phase 3)
// ============================================

import { analyticsService } from '../services/analytics.service';

/**
 * @openapi
 * /api/admin/analytics/risk-distribution:
 *   get:
 *     summary: Get risk distribution
 *     description: Returns distribution of resources across risk tiers
 *     tags: [Admin, Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Risk distribution metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 tiers:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       tier:
 *                         type: string
 *                         enum: [low, medium, high, critical]
 *                       count:
 *                         type: integer
 *                       percentage:
 *                         type: number
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
 * @openapi
 * /api/admin/analytics/compliance-trends:
 *   get:
 *     summary: Get compliance trends
 *     description: Returns compliance metrics over time for trend analysis
 *     tags: [Admin, Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Compliance trend data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 trends:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       date:
 *                         type: string
 *                         format: date
 *                       complianceScore:
 *                         type: number
 *                       violationCount:
 *                         type: integer
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
 * @openapi
 * /api/admin/analytics/sla-metrics:
 *   get:
 *     summary: Get SLA metrics
 *     description: Returns Service Level Agreement performance metrics
 *     tags: [Admin, Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: SLA performance data
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 uptime:
 *                   type: number
 *                   description: Uptime percentage
 *                   example: 99.97
 *                 averageResponseTime:
 *                   type: number
 *                   description: Average response time in milliseconds
 *                 p95ResponseTime:
 *                   type: number
 *                 p99ResponseTime:
 *                   type: number
 *                 errorRate:
 *                   type: number
 *                   description: Error rate percentage
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
 * @openapi
 * /api/admin/analytics/authz-metrics:
 *   get:
 *     summary: Get authorization metrics
 *     description: Returns ABAC authorization decision metrics and patterns
 *     tags: [Admin, Analytics]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *     responses:
 *       200:
 *         description: Authorization metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalDecisions:
 *                   type: integer
 *                 allowCount:
 *                   type: integer
 *                 denyCount:
 *                   type: integer
 *                 averageLatency:
 *                   type: number
 *                 topDenyReasons:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       reason:
 *                         type: string
 *                       count:
 *                         type: integer
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
 * @openapi
 * /api/admin/analytics/security-posture:
 *   get:
 *     summary: Get security posture
 *     description: Returns comprehensive security posture overview and recommendations
 *     tags: [Admin, Analytics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Security posture assessment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 overallScore:
 *                   type: number
 *                   description: Overall security score (0-100)
 *                   example: 87.5
 *                 categories:
 *                   type: object
 *                   properties:
 *                     authentication:
 *                       type: number
 *                     authorization:
 *                       type: number
 *                     encryption:
 *                       type: number
 *                     compliance:
 *                       type: number
 *                 recommendations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       severity:
 *                         type: string
 *                         enum: [low, medium, high, critical]
 *                       recommendation:
 *                         type: string
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
 * @openapi
 * /api/admin/metrics:
 *   get:
 *     summary: Prometheus metrics
 *     description: Returns metrics in Prometheus format for monitoring and alerting
 *     tags: [Admin, Metrics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Prometheus-formatted metrics
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: |
 *                 # HELP dive_http_requests_total Total HTTP requests
 *                 # TYPE dive_http_requests_total counter
 *                 dive_http_requests_total 12345
 */
router.get('/metrics', (_req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/plain; version=0.0.4');
    res.send(metricsService.exportPrometheus());
});

/**
 * @openapi
 * /api/admin/metrics/summary:
 *   get:
 *     summary: Metrics summary
 *     description: Returns human-readable metrics summary in JSON format
 *     tags: [Admin, Metrics]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Metrics summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     httpRequests:
 *                       type: object
 *                     authorizationDecisions:
 *                       type: object
 *                     cacheHits:
 *                       type: object
 *                     errors:
 *                       type: object
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
 * @openapi
 * /api/admin/opa/status:
 *   get:
 *     summary: Get OPA status
 *     description: Returns OPA server connection status and loaded policy metadata
 *     tags: [Admin, Policies]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OPA server status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 connected:
 *                   type: boolean
 *                 version:
 *                   type: string
 *                   example: 0.58.0
 *                 policyFiles:
 *                   type: array
 *                   items:
 *                     type: string
 *                 lastSync:
 *                   type: string
 *                   format: date-time
 */
router.get('/opa/status', getOPAStatusHandler);

/**
 * @openapi
 * /api/admin/opa/policy:
 *   get:
 *     summary: Get OPA policy content
 *     description: Returns Rego policy file content by name
 *     tags: [Admin, Policies]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *         description: Policy file name (e.g., 'authz.rego')
 *     responses:
 *       200:
 *         description: Policy file content
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *       404:
 *         description: Policy file not found
 */
router.get('/opa/policy', getPolicyHandler);

/**
 * @openapi
 * /api/admin/opa/policy/toggle-rule:
 *   post:
 *     summary: Toggle policy rule
 *     description: Enable or disable a specific policy rule without full redeployment (super_admin only)
 *     tags: [Admin, Policies]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               ruleName:
 *                 type: string
 *                 example: require_mfa_for_secret
 *               enabled:
 *                 type: boolean
 *             required: [ruleName, enabled]
 *     responses:
 *       200:
 *         description: Rule toggled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 ruleName:
 *                   type: string
 *                 enabled:
 *                   type: boolean
 *       403:
 *         description: Requires super_admin role
 *       404:
 *         description: Rule not found
 */
router.post('/opa/policy/toggle-rule', requireSuperAdmin, toggleRuleHandler);

// ============================================
// System Validation Routes
// ============================================

/**
 * @openapi
 * /api/admin/validate:
 *   get:
 *     summary: Comprehensive system validation
 *     description: |
 *       Validates all critical system components:
 *       - Secret synchronization status
 *       - KAS registry connectivity
 *       - Environment configuration
 *       - Database connections
 *       - External service availability
 *     tags: [Admin, Health]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System validation results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 valid:
 *                   type: boolean
 *                 checks:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       component:
 *                         type: string
 *                       status:
 *                         type: string
 *                         enum: [pass, fail, warning]
 *                       message:
 *                         type: string
 */
router.get('/validate', validateSystem);

// ============================================
// Resource Health & Monitoring Routes
// ============================================

/**
 * @openapi
 * /api/admin/resources/health:
 *   get:
 *     summary: Get resource health overview
 *     description: Returns health status of all system resources (databases, cache, APIs)
 *     tags: [Admin, Resources]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Resource health data
 */
router.get('/resources/health', getResourceHealthHandler);

/**
 * @openapi
 * /api/admin/resources/{id}/metrics:
 *   get:
 *     summary: Get detailed metrics for a specific resource
 *     description: Returns historical and current metrics for a resource
 *     tags: [Admin, Resources]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Resource metrics
 */
router.get('/resources/:id/metrics', getResourceMetricsHandler);

// ============================================
// Session Analytics Routes
// ============================================

/**
 * @openapi
 * /api/admin/sessions/analytics:
 *   get:
 *     summary: Get session analytics dashboard data
 *     description: Returns comprehensive session analytics including trends and distributions
 *     tags: [Admin, Sessions]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Session analytics data
 */
router.get('/sessions/analytics', getSessionAnalyticsHandler);

/**
 * @openapi
 * /api/admin/sessions:
 *   get:
 *     summary: Get list of active sessions
 *     description: Returns paginated list of active sessions with filters
 *     tags: [Admin, Sessions]
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
 *         name: userId
 *         schema:
 *           type: string
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of sessions
 */
router.get('/sessions', getSessionsListHandler);

/**
 * @openapi
 * /api/admin/sessions/{id}/revoke:
 *   post:
 *     summary: Revoke a specific session
 *     description: Immediately revokes a user session (requires super_admin)
 *     tags: [Admin, Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Session revoked successfully
 */
router.post('/sessions/:id/revoke', requireSuperAdmin, revokeSessionHandler);

/**
 * @openapi
 * /api/admin/sessions/revoke-all/{userId}:
 *   post:
 *     summary: Revoke all sessions for a user
 *     description: Force logout by revoking all active sessions (requires super_admin)
 *     tags: [Admin, Sessions]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: All user sessions revoked
 */
router.post('/sessions/revoke-all/:userId', requireSuperAdmin, revokeAllUserSessionsHandler);

// ============================================
// Logs Retention Routes
// ============================================

/**
 * @openapi
 * /api/admin/logs/retention:
 *   get:
 *     summary: Get logs retention configuration
 *     description: Returns current log retention policies and storage usage
 *     tags: [Admin, Logs]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Logs retention configuration
 */
router.get('/logs/retention', getLogsRetentionHandler);

/**
 * @openapi
 * /api/admin/logs/retention:
 *   put:
 *     summary: Update logs retention configuration
 *     description: Updates log retention policies (requires super_admin)
 *     tags: [Admin, Logs]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Configuration updated successfully
 */
router.put('/logs/retention', requireSuperAdmin, updateLogsRetentionHandler);

/**
 * @openapi
 * /api/admin/logs/export-advanced:
 *   post:
 *     summary: Export logs with advanced options
 *     description: Exports logs in specified format with filters (requires super_admin)
 *     tags: [Admin, Logs]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               format:
 *                 type: string
 *                 enum: [json, csv, pdf]
 *               dateRange:
 *                 type: object
 *               filters:
 *                 type: object
 *     responses:
 *       200:
 *         description: Export initiated
 */
router.post('/logs/export-advanced', requireSuperAdmin, exportLogsAdvancedHandler);

// ============================================
// Federation Statistics Routes
// ============================================

/**
 * @openapi
 * /api/federation/statistics:
 *   get:
 *     summary: Get federation statistics
 *     description: Returns federation-wide statistics and metrics
 *     tags: [Admin, Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Federation statistics
 */
router.get('/federation/statistics', getFederationStatisticsHandler);

/**
 * @openapi
 * /api/federation/traffic:
 *   get:
 *     summary: Get federation traffic data
 *     description: Returns detailed traffic patterns across federation spokes
 *     tags: [Admin, Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Federation traffic data
 */
router.get('/federation/traffic', getFederationTrafficHandler);

// ============================================
// Health Check Routes
// ============================================

/**
 * @openapi
 * /api/admin/health-check:
 *   get:
 *     summary: Quick health check
 *     description: Fast health check endpoint for load balancers and monitoring
 *     tags: [Admin, Health]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: System is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 */
router.get('/health-check', quickHealth);

export default router;
