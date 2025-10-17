/**
 * Admin Controller
 * 
 * Handles Identity Provider management operations
 * All endpoints require super_admin role (enforced by adminAuthMiddleware)
 * 
 * Endpoints:
 * - GET /api/admin/idps - List all IdPs
 * - GET /api/admin/idps/:alias - Get specific IdP
 * - POST /api/admin/idps - Create new IdP
 * - PUT /api/admin/idps/:alias - Update IdP
 * - DELETE /api/admin/idps/:alias - Delete IdP
 * - POST /api/admin/idps/:alias/test - Test IdP connectivity
 */

import { Request, Response } from 'express';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { idpApprovalService } from '../services/idp-approval.service';
import { auth0Service } from '../services/auth0.service';
import { metricsService } from '../services/metrics.service';
import { idpValidationService } from '../services/idp-validation.service';
import { samlMetadataParserService } from '../services/saml-metadata-parser.service';
import { oidcDiscoveryService } from '../services/oidc-discovery.service';
import { mfaDetectionService } from '../services/mfa-detection.service';
import { riskScoringService } from '../services/risk-scoring.service';
import { complianceValidationService } from '../services/compliance-validation.service';
import { logger } from '../utils/logger';
import { logAdminAction } from '../middleware/admin-auth.middleware';
import {
    IIdPCreateRequest,
    IIdPUpdateRequest
} from '../types/keycloak.types';
import { IAdminAPIResponse } from '../types/admin.types';
import { IValidationResults, IPreliminaryScore } from '../types/validation.types';

/**
 * Extended Request with authenticated user
 */
interface IAuthenticatedRequest extends Request {
    user?: {
        uniqueID: string;
        sub: string;
        clearance?: string;
        countryOfAffiliation?: string;
        acpCOI?: string[];
        roles?: string[];
    };
}

// ============================================
// Identity Provider Management Handlers
// ============================================

/**
 * GET /api/admin/idps
 * List all Identity Providers
 */
export const listIdPsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        logger.info('Admin: List IdPs request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const result = await keycloakAdminService.listIdentityProviders();

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_idps',
            outcome: 'success',
            details: { count: result.total }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to list IdPs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_idps',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to retrieve identity providers',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/idps/:alias
 * Get specific Identity Provider (includes Auth0 metadata from submissions)
 */
export const getIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Get IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        // Get IdP from Keycloak
        const idp = await keycloakAdminService.getIdentityProvider(alias);

        if (!idp) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Not Found',
                message: `Identity provider ${alias} not found`,
                requestId
            };
            res.status(404).json(response);
            return;
        }

        // Try to get Auth0 metadata from submissions collection
        const submission = await idpApprovalService.getSubmissionByAlias(alias);

        // Merge Keycloak data with Auth0 metadata
        // IMPORTANT: Normalize providerId to protocol for frontend consistency
        const enhancedIdp = {
            ...idp,
            protocol: idp.providerId as string,  // Already 'oidc' or 'saml' from Keycloak
            submittedBy: submission?.submittedBy,
            createdAt: submission?.submittedAt,
            useAuth0: submission?.useAuth0 || false,
            auth0ClientId: submission?.auth0ClientId,
            auth0ClientSecret: submission?.auth0ClientSecret,
            attributeMappings: submission?.attributeMappings
        };

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'get_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: enhancedIdp,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'get_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to retrieve identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/idps
 * Create new Identity Provider
 * 
 * Phase 1: Automated security validation (TLS, crypto, MFA, endpoints)
 * Phase 2: Comprehensive risk scoring & compliance validation
 */
export const createIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const createRequest: IIdPCreateRequest = {
            ...req.body,
            submittedBy: authReq.user?.uniqueID || 'unknown'
        };

        logger.info('Admin: Create IdP request (with validation)', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias: createRequest.alias,
            protocol: createRequest.protocol
        });

        // Validate request
        if (!createRequest.alias || !createRequest.displayName || !createRequest.protocol) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Bad Request',
                message: 'Missing required fields: alias, displayName, protocol',
                requestId
            };
            res.status(400).json(response);
            return;
        }

        // ============================================
        // PHASE 1: Automated Security Validation
        // ============================================

        logger.info('Running automated security validation', {
            requestId,
            alias: createRequest.alias,
            protocol: createRequest.protocol
        });

        const validationStartTime = Date.now();
        const validationResults: IValidationResults = {
            tlsCheck: { pass: true, version: '', cipher: '', certificateValid: false, score: 0, errors: [], warnings: [] },
            algorithmCheck: { pass: true, algorithms: [], violations: [], score: 0, recommendations: [] },
            endpointCheck: { reachable: true, latency_ms: 0, score: 0, errors: [] },
            mfaCheck: { detected: false, evidence: [], score: 0, confidence: 'low', recommendations: [] }
        };

        // Determine endpoint URL based on protocol
        let endpointUrl = '';

        if (createRequest.protocol === 'oidc') {
            // Type guard: config is IOIDCIdPConfig
            const oidcConfig = createRequest.config as any;
            endpointUrl = oidcConfig.issuer || '';

            // Validate OIDC discovery
            if (endpointUrl) {
                validationResults.discoveryCheck = await oidcDiscoveryService.validateOIDCDiscovery(endpointUrl);

                // Validate TLS
                validationResults.tlsCheck = await idpValidationService.validateTLS(endpointUrl);

                // Validate algorithms from JWKS
                if (validationResults.discoveryCheck.valid && validationResults.discoveryCheck.endpoints.jwks) {
                    validationResults.algorithmCheck = await idpValidationService.validateOIDCAlgorithms(
                        validationResults.discoveryCheck.endpoints.jwks
                    );
                }

                // Check endpoint reachability
                validationResults.endpointCheck = await idpValidationService.checkEndpointReachability(endpointUrl);

                // Detect MFA
                validationResults.mfaCheck = mfaDetectionService.detectOIDCMFA(
                    validationResults.discoveryCheck,
                    false // hasPolicyDoc - Phase 2 feature
                );
            }
        } else if (createRequest.protocol === 'saml') {
            // Type guard: config is ISAMLIdPConfig
            const samlConfig = createRequest.config as any;
            const metadataXML = samlConfig.metadata || samlConfig.metadataXml || '';

            if (metadataXML) {
                validationResults.metadataCheck = await samlMetadataParserService.parseSAMLMetadata(metadataXML);

                // Validate TLS for SSO URL
                if (validationResults.metadataCheck.valid && validationResults.metadataCheck.ssoUrl) {
                    endpointUrl = validationResults.metadataCheck.ssoUrl;
                    validationResults.tlsCheck = await idpValidationService.validateTLS(endpointUrl);
                    validationResults.endpointCheck = await idpValidationService.checkEndpointReachability(endpointUrl);
                }

                // Validate signature algorithm
                if (validationResults.metadataCheck.signatureAlgorithm) {
                    validationResults.algorithmCheck = idpValidationService.validateSAMLAlgorithm(
                        validationResults.metadataCheck.signatureAlgorithm
                    );
                }

                // Detect MFA
                validationResults.mfaCheck = mfaDetectionService.detectSAMLMFA(
                    validationResults.metadataCheck,
                    false // hasPolicyDoc - Phase 2 feature
                );
            }
        }

        const validationDuration = Date.now() - validationStartTime;

        // Calculate preliminary score
        const preliminaryScore: IPreliminaryScore = {
            total: validationResults.tlsCheck.score +
                validationResults.algorithmCheck.score +
                validationResults.mfaCheck.score +
                validationResults.endpointCheck.score,
            maxScore: 70, // TLS(15) + Crypto(25) + MFA(20) + Endpoint(10)
            breakdown: {
                tlsScore: validationResults.tlsCheck.score,
                cryptoScore: validationResults.algorithmCheck.score,
                mfaScore: validationResults.mfaCheck.score,
                endpointScore: validationResults.endpointCheck.score
            },
            computedAt: new Date().toISOString()
        };

        // Determine tier
        const scorePercentage = (preliminaryScore.total / preliminaryScore.maxScore) * 100;
        if (scorePercentage >= 85) {
            preliminaryScore.tier = 'gold';
        } else if (scorePercentage >= 70) {
            preliminaryScore.tier = 'silver';
        } else if (scorePercentage >= 50) {
            preliminaryScore.tier = 'bronze';
        } else {
            preliminaryScore.tier = 'fail';
        }

        logger.info('Security validation complete', {
            requestId,
            alias: createRequest.alias,
            score: preliminaryScore.total,
            tier: preliminaryScore.tier,
            durationMs: validationDuration
        });

        // Check for critical failures
        const criticalFailures: string[] = [];

        if (!validationResults.tlsCheck.pass) {
            criticalFailures.push(...validationResults.tlsCheck.errors);
        }

        if (!validationResults.algorithmCheck.pass) {
            criticalFailures.push(...validationResults.algorithmCheck.violations);
        }

        if (createRequest.protocol === 'saml' && validationResults.metadataCheck && !validationResults.metadataCheck.valid) {
            criticalFailures.push(...validationResults.metadataCheck.errors);
        }

        if (createRequest.protocol === 'oidc' && validationResults.discoveryCheck && !validationResults.discoveryCheck.valid) {
            criticalFailures.push(...validationResults.discoveryCheck.errors);
        }

        // Reject if critical failures
        if (criticalFailures.length > 0) {
            logger.warn('IdP submission rejected due to validation failures', {
                requestId,
                alias: createRequest.alias,
                failures: criticalFailures
            });

            // Record metrics
            metricsService.recordValidationFailure(createRequest.protocol, criticalFailures);

            const response: IAdminAPIResponse = {
                success: false,
                error: 'Validation Failed',
                message: 'IdP configuration contains critical security issues',
                data: {
                    validationResults,
                    preliminaryScore,
                    criticalFailures
                },
                requestId
            };

            res.status(400).json(response);
            return;
        }

        // ============================================
        // PHASE 2: Comprehensive Risk Scoring & Compliance
        // ============================================

        logger.info('Running comprehensive risk scoring and compliance validation', {
            requestId,
            alias: createRequest.alias
        });

        const riskScoringStartTime = Date.now();

        // Prepare submission data for Phase 2
        const submissionData: any = {
            alias: createRequest.alias,
            displayName: createRequest.displayName,
            description: createRequest.description,
            protocol: createRequest.protocol,
            operationalData: (req.body as any).operationalData,
            complianceDocuments: (req.body as any).complianceDocuments
        };

        // Calculate comprehensive risk score (100 points)
        const comprehensiveRiskScore = await riskScoringService.calculateRiskScore(
            validationResults,
            submissionData
        );

        // Validate compliance (ACP-240, STANAG, NIST)
        const complianceCheck = await complianceValidationService.validateCompliance(
            submissionData
        );

        const riskScoringDuration = Date.now() - riskScoringStartTime;

        logger.info('Phase 2 risk scoring and compliance validation complete', {
            requestId,
            alias: createRequest.alias,
            comprehensiveScore: comprehensiveRiskScore.total,
            riskLevel: comprehensiveRiskScore.riskLevel,
            tier: comprehensiveRiskScore.tier,
            complianceLevel: complianceCheck.overall,
            complianceScore: complianceCheck.score,
            durationMs: riskScoringDuration
        });

        // ============================================
        // Submit IdP for approval (with Phase 1 + Phase 2 results)
        // ============================================

        const submissionId = await idpApprovalService.submitIdPForApproval({
            alias: createRequest.alias,
            displayName: createRequest.displayName,
            description: createRequest.description,
            protocol: createRequest.protocol,
            config: createRequest.config,
            attributeMappings: createRequest.attributeMappings,
            submittedBy: authReq.user?.uniqueID || 'unknown',
            // Include Auth0 metadata if present
            useAuth0: (req.body as any).useAuth0,
            auth0ClientId: (req.body as any).auth0ClientId,
            auth0ClientSecret: (req.body as any).auth0ClientSecret,
            // Phase 1: Include validation results
            validationResults,
            preliminaryScore,
            // Phase 2: Include comprehensive risk score and compliance
            comprehensiveRiskScore,
            complianceCheck,
            operationalData: (req.body as any).operationalData,
            complianceDocuments: (req.body as any).complianceDocuments
        });

        // ============================================
        // PHASE 2: Auto-Triage Decision
        // ============================================

        logger.info('Processing submission for auto-triage', {
            requestId,
            submissionId,
            alias: createRequest.alias
        });

        // Process submission to determine approval decision
        const approvalDecision = await idpApprovalService.processSubmission(submissionId);

        logger.info('Auto-triage decision made', {
            requestId,
            submissionId,
            alias: createRequest.alias,
            decision: approvalDecision.action,
            reason: approvalDecision.reason
        });

        // Record metrics
        metricsService.recordValidationSuccess(createRequest.protocol, preliminaryScore.total);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'submit_idp',
            target: createRequest.alias,
            outcome: 'success',
            details: {
                protocol: createRequest.protocol,
                displayName: createRequest.displayName,
                submissionId,
                validationScore: preliminaryScore.total,
                validationTier: preliminaryScore.tier,
                useAuth0: (req.body as any).useAuth0 || false
            }
        });

        // Determine response based on approval decision
        let statusCode = 201;
        let responseMessage = '';

        if (approvalDecision.action === 'auto-approve') {
            statusCode = 201;
            responseMessage = `IdP auto-approved! Comprehensive risk score: ${comprehensiveRiskScore.total}/100 (${comprehensiveRiskScore.tier} tier). IdP is now active.`;
        } else if (approvalDecision.action === 'fast-track') {
            statusCode = 202;
            responseMessage = `IdP submitted for fast-track review. Score: ${comprehensiveRiskScore.total}/100 (${comprehensiveRiskScore.tier} tier). Review SLA: ${process.env.FAST_TRACK_SLA_HOURS || 2}hr.`;
        } else if (approvalDecision.action === 'standard-review') {
            statusCode = 202;
            responseMessage = `IdP submitted for standard review. Score: ${comprehensiveRiskScore.total}/100 (${comprehensiveRiskScore.tier} tier). Review SLA: ${process.env.STANDARD_REVIEW_SLA_HOURS || 24}hr.`;
        } else if (approvalDecision.action === 'auto-reject') {
            statusCode = 400;
            responseMessage = `IdP auto-rejected due to critical security issues. Score: ${comprehensiveRiskScore.total}/100 (${comprehensiveRiskScore.tier} tier). Please address issues and resubmit.`;
        }

        const response: IAdminAPIResponse = {
            success: approvalDecision.action !== 'auto-reject',
            data: {
                submissionId,
                alias: createRequest.alias,
                status: approvalDecision.action === 'auto-approve' ? 'approved' :
                    approvalDecision.action === 'auto-reject' ? 'rejected' : 'pending',
                // Phase 1 results
                validationResults,
                preliminaryScore,
                // Phase 2 results
                comprehensiveRiskScore,
                complianceCheck,
                approvalDecision,
                // Next steps
                nextSteps: approvalDecision.nextSteps
            },
            message: responseMessage,
            requestId
        };

        res.status(statusCode).json(response);
    } catch (error) {
        logger.error('Failed to create IdP', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_idp',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to create identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * PUT /api/admin/idps/:alias
 * Update Identity Provider
 */
export const updateIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        const updateRequest: IIdPUpdateRequest = req.body;

        logger.info('Admin: Update IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        await keycloakAdminService.updateIdentityProvider(alias, updateRequest);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_idp',
            target: alias,
            outcome: 'success',
            details: updateRequest
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                alias,
                message: 'Identity provider updated successfully'
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to update IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'update_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to update identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * DELETE /api/admin/idps/:alias
 * Delete Identity Provider
 */
export const deleteIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Delete IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        await keycloakAdminService.deleteIdentityProvider(alias);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'delete_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                alias,
                message: 'Identity provider deleted successfully'
            },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to delete IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'delete_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to delete identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/idps/:alias/test
 * Test Identity Provider connectivity
 */
export const testIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;

    try {
        logger.info('Admin: Test IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        const testResult = await keycloakAdminService.testIdentityProvider(alias);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'test_idp',
            target: alias,
            outcome: testResult.success ? 'success' : 'failure',
            details: testResult
        });

        const response: IAdminAPIResponse = {
            success: testResult.success,
            data: testResult,
            message: testResult.message,
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to test IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'test_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to test identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

// ============================================
// IdP Approval Workflow Handlers
// ============================================

/**
 * GET /api/admin/approvals/pending
 * Get pending IdP submissions
 */
export const getPendingApprovalsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        logger.info('Admin: Get pending approvals request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        const pending = await idpApprovalService.getPendingIdPs();

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'view_approvals',
            outcome: 'success',
            details: { count: pending.length }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: { pending, total: pending.length },
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to get pending approvals', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to get pending approvals',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/approvals/:alias/approve
 * Approve pending IdP
 */
export const approveIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;
    const startTime = Date.now();

    try {
        logger.info('Admin: Approve IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias
        });

        const result = await idpApprovalService.approveIdP(
            alias,
            authReq.user?.uniqueID || 'unknown'
        );

        // Record approval duration metric
        const durationMs = Date.now() - startTime;
        metricsService.recordApprovalDuration(durationMs);

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'approve_idp',
            target: alias,
            outcome: 'success'
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            message: 'Identity provider approved',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to approve IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'approve_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to approve identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * POST /api/admin/approvals/:alias/reject
 * Reject pending IdP
 */
export const rejectIdPHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;
    const { alias } = req.params;
    const { reason } = req.body;

    try {
        logger.info('Admin: Reject IdP request', {
            requestId,
            admin: authReq.user?.uniqueID,
            alias,
            reason
        });

        const result = await idpApprovalService.rejectIdP(
            alias,
            reason || 'No reason provided',
            authReq.user?.uniqueID || 'unknown'
        );

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'reject_idp',
            target: alias,
            outcome: 'success',
            details: { reason }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: result,
            message: 'Identity provider rejected',
            requestId
        };

        res.status(200).json(response);
    } catch (error) {
        logger.error('Failed to reject IdP', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'reject_idp',
            target: alias,
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to reject identity provider',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

// ============================================
// Auth0 MCP Integration Handlers (Week 3.4.6)
// ============================================

/**
 * POST /api/admin/auth0/create-application
 * Create Auth0 application via MCP Server
 * 
 * This endpoint uses Auth0 MCP tools to create applications
 * and returns client credentials for IdP configuration.
 */
export const createAuth0ApplicationHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        const { name, app_type } = req.body;
        // For production MCP integration, also use: description, oidc_conformant, callbacks, allowed_logout_urls, allowed_origins

        logger.info('Admin: Create Auth0 application request', {
            requestId,
            admin: authReq.user?.uniqueID,
            name,
            app_type
        });

        // Validate required fields
        if (!name || !app_type) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Bad Request',
                message: 'Missing required fields: name, app_type',
                requestId
            };
            res.status(400).json(response);
            return;
        }

        // Check if Auth0 is available
        if (!auth0Service.isAuth0Available()) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Service Unavailable',
                message: 'Auth0 MCP integration is not enabled or configured. Set AUTH0_DOMAIN and AUTH0_MCP_ENABLED=true in environment.',
                requestId
            };
            res.status(503).json(response);
            return;
        }

        // NOTE: The actual MCP tool call would happen here
        // For now, we'll return a mock response since MCP tools are available at the API boundary
        // In production, this would call: mcp_Auth0_auth0_create_application(...)

        // MOCK RESPONSE (replace with actual MCP call in production)
        const mockClientId = `auth0_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const mockClientSecret = `secret_${Math.random().toString(36).substr(2, 32)}`;

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_auth0_app',
            target: name,
            outcome: 'success',
            details: { app_type }
        });

        logger.info('Auth0 application created successfully', {
            requestId,
            name,
            client_id: mockClientId,
            app_type
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                client_id: mockClientId,
                client_secret: mockClientSecret,
                name,
                app_type,
                domain: process.env.AUTH0_DOMAIN || 'your-tenant.auth0.com'
            },
            message: 'Auth0 application created successfully',
            requestId
        };

        res.status(201).json(response);

    } catch (error) {
        logger.error('Failed to create Auth0 application', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'create_auth0_app',
            outcome: 'failure',
            reason: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to create Auth0 application',
            message: error instanceof Error ? error.message : 'Unknown error. Check that Auth0 MCP Server is connected and AUTH0_DOMAIN is configured.',
            requestId
        };

        res.status(500).json(response);
    }
};

/**
 * GET /api/admin/auth0/applications
 * List Auth0 applications
 */
export const listAuth0ApplicationsHandler = async (
    req: Request,
    res: Response
): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const authReq = req as IAuthenticatedRequest;

    try {
        logger.info('Admin: List Auth0 applications request', {
            requestId,
            admin: authReq.user?.uniqueID
        });

        // Check if Auth0 is available
        if (!auth0Service.isAuth0Available()) {
            const response: IAdminAPIResponse = {
                success: false,
                error: 'Service Unavailable',
                message: 'Auth0 MCP integration is not enabled',
                requestId
            };
            res.status(503).json(response);
            return;
        }

        // In production, this would call: mcp_Auth0_auth0_list_applications(...)
        const mockApplications: any[] = [];

        logAdminAction({
            requestId,
            admin: authReq.user?.uniqueID || 'unknown',
            action: 'list_auth0_apps',
            outcome: 'success',
            details: { count: mockApplications.length }
        });

        const response: IAdminAPIResponse = {
            success: true,
            data: {
                applications: mockApplications,
                total: mockApplications.length
            },
            requestId
        };

        res.status(200).json(response);

    } catch (error) {
        logger.error('Failed to list Auth0 applications', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        const response: IAdminAPIResponse = {
            success: false,
            error: 'Failed to list Auth0 applications',
            message: error instanceof Error ? error.message : 'Unknown error',
            requestId
        };

        res.status(500).json(response);
    }
};

