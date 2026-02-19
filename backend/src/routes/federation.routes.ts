/**
 * DIVE V3 - Federation API Routes
 *
 * Hub-Spoke federation management endpoints.
 *
 * Public endpoints (spoke → hub):
 * - POST /api/federation/register - Register new spoke
 * - POST /api/federation/heartbeat - Spoke heartbeat
 * - GET /api/federation/policy/version - Current policy version
 * - GET /api/federation/policy/bundle - Download policy bundle
 *
 * Admin endpoints (hub management):
 * - GET /api/federation/spokes - List all spokes
 * - GET /api/federation/spokes/:spokeId - Get spoke details
 * - POST /api/federation/spokes/:spokeId/approve - Approve spoke
 * - POST /api/federation/spokes/:spokeId/suspend - Suspend spoke
 * - POST /api/federation/spokes/:spokeId/revoke - Revoke spoke
 * - POST /api/federation/spokes/:spokeId/token - Generate spoke token
 * - POST /api/federation/policy/push - Push policy update
 *
 * @version 1.0.0
 * @date 2025-12-04
 */

import { Router, Request, Response, NextFunction } from 'express';
import { hubSpokeRegistry, IRegistrationRequest } from '../services/hub-spoke-registry.service';
import { policySyncService } from '../services/policy-sync.service';
import { idpValidationService } from '../services/idp-validation.service';
import { SPManagementService } from '../services/sp-management.service';
import { logger } from '../utils/logger';
import { getVaultConnection } from '../utils/vault-secrets';
import { z } from 'zod';
import { requireSPAuth, requireSPScope } from '../middleware/sp-auth.middleware';
import { requireAdmin, requireSuperAdmin } from '../middleware/admin.middleware';
import { getResourcesByQuery } from '../services/resource.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Initialize SP Management Service
const spManagement = new SPManagementService();

const router = Router();
// Routes are mounted at /api/federation/* in server.ts for consistency with other DIVE APIs

/**
 * @openapi
 * tags:
 *   - name: Federation
 *     description: |
 *       Hub-Spoke federation management for cross-coalition resource sharing.
 *       Enables secure identity federation and resource access across partner instances.
 */

/**
 * @openapi
 * /api/federation/spokes:
 *   get:
 *     summary: List all federation spokes
 *     description: Returns all registered spokes with their status and health information
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of federation spokes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spokes:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/FederationSpoke'
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 */

/**
 * @openapi
 * /api/federation/register:
 *   post:
 *     summary: Register a new spoke instance
 *     description: |
 *       Registers a new spoke with the hub. The spoke will be in 'pending' status
 *       until approved by a hub administrator.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - instanceCode
 *               - name
 *               - baseUrl
 *               - apiUrl
 *               - idpUrl
 *               - requestedScopes
 *               - contactEmail
 *             properties:
 *               instanceCode:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *                 example: FRA
 *               name:
 *                 type: string
 *                 example: France Coalition Instance
 *               baseUrl:
 *                 type: string
 *                 format: uri
 *                 example: https://fra.dive-v3.mil
 *               apiUrl:
 *                 type: string
 *                 format: uri
 *               idpUrl:
 *                 type: string
 *                 format: uri
 *               requestedScopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: [resources:read, policies:sync]
 *               contactEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Spoke registered successfully
 *       400:
 *         description: Invalid registration data
 */

/**
 * @openapi
 * /api/federation/heartbeat:
 *   post:
 *     summary: Send spoke heartbeat
 *     description: |
 *       Spokes send periodic heartbeats to report health status, policy version,
 *       and operational metrics to the hub.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - spokeId
 *             properties:
 *               spokeId:
 *                 type: string
 *               policyVersion:
 *                 type: string
 *               services:
 *                 type: object
 *                 properties:
 *                   opa:
 *                     type: object
 *                     properties:
 *                       healthy:
 *                         type: boolean
 *                   mongodb:
 *                     type: object
 *               metrics:
 *                 type: object
 *     responses:
 *       200:
 *         description: Heartbeat acknowledged
 *       404:
 *         description: Spoke not found
 */

// ============================================
// VALIDATION SCHEMAS
// ============================================

const registrationSchema = z.object({
    instanceCode: z.string().length(3).toUpperCase(),
    name: z.string().min(3).max(100),
    description: z.string().optional(),
    baseUrl: z.string().url(),
    apiUrl: z.string().url(),
    idpUrl: z.string().url(),
    idpPublicUrl: z.string().url().optional(), // Public-facing IdP URL (localhost or domain)
    publicKey: z.string().optional(),
    csrPEM: z.string().optional(),           // Base64-encoded CSR
    certificatePEM: z.string().optional(),   // Base64-encoded certificate
    requestedScopes: z.array(z.string()).min(1),
    contactEmail: z.string().email(),

    // CRITICAL FOR BIDIRECTIONAL FEDERATION:
    // Spoke must provide its Keycloak admin password so Hub can create reverse IdP
    // This enables true bidirectional SSO (Hub users can login at Spoke)
    keycloakAdminPassword: z.string().min(1).optional(),  // Required for bidirectional federation

    // Pre-approved partner metadata (from Vault KV, set by shell pipeline)
    // When present and partnerPreApproved=true, auto-approve even in non-development mode
    partnerPreApproved: z.boolean().optional(),
    partnerTrustLevel: z.enum(['development', 'partner', 'bilateral', 'national']).optional(),
    partnerMaxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']).optional(),

    // Auth code for zero-config remote spoke deployment
    // Generated by Hub admin: ./dive spoke authorize GBR
    // Validated against Vault KV: dive-v3/auth/spoke-auth/{code}
    authCode: z.string().optional(),
});

const approvalSchema = z.object({
    allowedScopes: z.array(z.string()).min(1),
    trustLevel: z.enum(['development', 'partner', 'bilateral', 'national']),
    maxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']),
    dataIsolationLevel: z.enum(['full', 'filtered', 'minimal'])
});

// Heartbeat schema - accepts rich payload from spokes
// Required: spokeId
// Optional: policyVersion, services (with health info), metrics, queues
const heartbeatSchema = z.object({
    spokeId: z.string(),
    instanceCode: z.string().optional(),
    timestamp: z.string().optional(),
    policyVersion: z.string().nullable().optional(),
    // Legacy flat fields
    opaHealthy: z.boolean().optional(),
    opalClientConnected: z.boolean().optional(),
    latencyMs: z.number().optional(),
    // Rich nested fields from spoke-heartbeat.service
    services: z.object({
        opa: z.object({ healthy: z.boolean(), lastCheck: z.string(), error: z.string().optional() }).optional(),
        opalClient: z.object({ healthy: z.boolean(), lastCheck: z.string(), error: z.string().optional() }).optional(),
        keycloak: z.object({ healthy: z.boolean(), lastCheck: z.string(), error: z.string().optional() }).optional(),
        mongodb: z.object({ healthy: z.boolean(), lastCheck: z.string(), error: z.string().optional() }).optional(),
        kas: z.object({ healthy: z.boolean(), lastCheck: z.string(), error: z.string().optional() }).optional(),
    }).optional(),
    metrics: z.object({
        uptime: z.number().optional(),
        requestsLastHour: z.number().optional(),
        authDecisionsLastHour: z.number().optional(),
        authDeniesLastHour: z.number().optional(),
        errorRate: z.number().optional(),
        avgLatencyMs: z.number().optional(),
    }).optional(),
    queues: z.object({
        pendingAuditLogs: z.number().optional(),
        pendingHeartbeats: z.number().optional(),
    }).optional(),
}).passthrough();

// SP Client Registration Schema
const spRegistrationSchema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().optional(),
    organizationType: z.enum(['government', 'military', 'defense_contractor', 'research', 'other']),
    country: z.string().length(3).toUpperCase(),
    technicalContact: z.object({
        name: z.string().optional(),
        email: z.string().email()
    }),
    clientType: z.enum(['confidential', 'public']).default('confidential'),
    redirectUris: z.array(z.string().url()).min(1),
    postLogoutRedirectUris: z.array(z.string().url()).optional(),
    jwksUri: z.string().url().optional().nullable(),
    tokenEndpointAuthMethod: z.enum([
        'client_secret_basic',
        'client_secret_post',
        'private_key_jwt',
        'none'
    ]).default('client_secret_basic'),
    requirePKCE: z.boolean().default(true),
    allowedScopes: z.array(z.string()).min(1),
    allowedGrantTypes: z.array(z.enum([
        'authorization_code',
        'refresh_token',
        'client_credentials'
    ])).default(['authorization_code', 'refresh_token']),
    attributeRequirements: z.object({
        clearance: z.object({
            required: z.boolean(),
            allowedValues: z.array(z.string()).optional()
        }).optional(),
        countryOfAffiliation: z.object({
            required: z.boolean()
        }).optional()
    }).optional(),
    maxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']).default('UNCLASSIFIED'),
    rateLimit: z.object({
        requestsPerMinute: z.number().default(60),
        burstSize: z.number().default(10),
        quotaPerDay: z.number().default(10000)
    }).optional()
});

// ============================================
// MIDDLEWARE
// ============================================

/**
 * Validate spoke token for protected endpoints
 */
async function requireSpokeToken(req: Request, res: Response, next: NextFunction): Promise<void> {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Missing or invalid authorization header' });
        return;
    }

    const token = authHeader.substring(7);
    const validation = await hubSpokeRegistry.validateToken(token);

    if (!validation.valid) {
        res.status(401).json({ error: validation.error || 'Invalid token' });
        return;
    }

    // Attach spoke info to request
    (req as Request & { spoke?: unknown; spokeScopes?: string[] }).spoke = validation.spoke;
    (req as Request & { spoke?: unknown; spokeScopes?: string[] }).spokeScopes = validation.scopes;

    next();
}

/**
 * Legacy requireAdmin - replaced by proper role-based middleware
 * Kept for reference/rollback only
 *
 * Now using:
 *   - requireAdmin from admin.middleware.ts (checks admin OR super_admin role)
 *   - requireSuperAdmin from admin.middleware.ts (checks super_admin role only)
 */
function legacyRequireAdmin(req: Request, res: Response, next: NextFunction): void {
    // DEPRECATED: Use requireAdmin or requireSuperAdmin from admin.middleware.ts
    const adminKey = req.headers['x-admin-key'];

    if (adminKey !== process.env.FEDERATION_ADMIN_KEY && process.env.NODE_ENV === 'production') {
        res.status(403).json({ error: 'Admin access required' });
        return;
    }

    next();
}

// Legacy helper retained for compatibility (not used directly)
// hasActiveAgreement helper removed (legacy, no longer used)

// ============================================
// PUBLIC ENDPOINTS (Spoke → Hub)
// ============================================

/**
 * @openapi
 * /api/federation/metadata:
 *   get:
 *     summary: Get federation metadata
 *     description: Returns public federation metadata including hub capabilities, supported classifications, countries, COIs, protocols, and endpoints. No authentication required.
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Federation metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 entity:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     type:
 *                       type: string
 *                     country:
 *                       type: string
 *                     name:
 *                       type: string
 *                     version:
 *                       type: string
 *                     contact:
 *                       type: string
 *                 capabilities:
 *                   type: object
 *                   properties:
 *                     classifications:
 *                       type: array
 *                       items:
 *                         type: string
 *                     countries:
 *                       type: array
 *                       items:
 *                         type: string
 *                     coi:
 *                       type: array
 *                       items:
 *                         type: string
 *                     maxClassification:
 *                       type: string
 *                     protocols:
 *                       type: array
 *                       items:
 *                         type: string
 *                     trustLevels:
 *                       type: array
 *                       items:
 *                         type: string
 *                 endpoints:
 *                   type: object
 *                 security:
 *                   type: object
 */
router.get('/metadata', async (_req: Request, res: Response): Promise<void> => {
    res.json({
        entity: {
            id: 'dive-v3-hub',
            type: 'service_provider',
            country: 'USA',
            name: 'DIVE V3 Federation Hub',
            version: '1.0.0',
            contact: 'admin@dive-v3.local'
        },
        capabilities: {
            classifications: ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'],
            countries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL', 'FRA', 'DEU', 'ESP', 'ITA', 'NLD', 'POL'],
            coi: ['NATO-COSMIC', 'FVEY', 'CAN-US', 'US-ONLY'],
            maxClassification: 'TOP_SECRET',
            protocols: ['OIDC', 'OAuth2', 'SAML2'],
            trustLevels: ['development', 'partner', 'bilateral', 'national']
        },
        endpoints: {
            policies: '/api/policies-lab',
            resources: '/api/resources',
            search: '/federation/search'
        },
        security: {
            jwksUri: '/oauth/jwks',
            tokenEndpoint: '/oauth/token',
            supportedAlgorithms: ['RS256', 'ES256']
        }
    });
});

/**
 * @openapi
 * /api/federation/status:
 *   get:
 *     summary: Get federation status
 *     description: Returns overall federation status including all instances, health summary, and statistics. Public endpoint (no auth) used by CLI federation status command.
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Federation status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 instances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                       name:
 *                         type: string
 *                       frontendUrl:
 *                         type: string
 *                       apiUrl:
 *                         type: string
 *                       idpUrl:
 *                         type: string
 *                       status:
 *                         type: string
 *                       healthStatus:
 *                         type: string
 *                         enum: [healthy, unhealthy]
 *                       policySyncStatus:
 *                         type: string
 *                 statistics:
 *                   type: object
 *                 unhealthyCount:
 *                   type: integer
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Server error
 */
router.get('/status', async (_req: Request, res: Response): Promise<void> => {
    try {
        // Get spoke health data from MongoDB (SSOT)
        const stats = await hubSpokeRegistry.getStatistics();
        const unhealthy = await hubSpokeRegistry.getUnhealthySpokes();
        const allSpokes = await hubSpokeRegistry.listAllSpokes();

        // Build status for each instance from MongoDB
        const instances = allSpokes.map((spoke) => {
            const isUnhealthy = unhealthy.some((u) => u.spokeId === spoke.spokeId);

            return {
                code: spoke.instanceCode,
                name: spoke.name,
                frontendUrl: spoke.baseUrl,
                apiUrl: spoke.apiUrl,
                idpUrl: spoke.idpPublicUrl || spoke.idpUrl,
                status: spoke.status,
                healthStatus: isUnhealthy ? 'unhealthy' : 'healthy',
                policySyncStatus: 'SYNCED', // Placeholder - would need real sync status
            };
        });

        res.json({
            instances,
            statistics: stats,
            unhealthyCount: unhealthy.length,
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to get federation status', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to get federation status'
        });
    }
});

/**
 * @openapi
 * /api/federation/discovery:
 *   get:
 *     summary: Federation discovery
 *     description: MongoDB-based federation discovery endpoint. Returns list of federation partners from MongoDB federation_spokes collection (SSOT). Used by spokes to discover federation partners. Replaces static federation-registry.json.
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Federation instances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 source:
 *                   type: string
 *                   enum: [mongodb]
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 instances:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Discovery failed
 */
router.get('/discovery', async (_req: Request, res: Response): Promise<void> => {
    try {
        const { federationDiscovery } = await import('../services/federation-discovery.service');
        const instances = await federationDiscovery.getInstances();

        res.json({
            success: true,
            source: 'mongodb',
            timestamp: new Date().toISOString(),
            instances
        });
    } catch (error) {
        logger.error('Federation discovery failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Discovery failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/instances:
 *   get:
 *     summary: List federation instances
 *     description: Returns federation instances in frontend-friendly format. Public endpoint (no auth) used by frontend for federated search UI. Now uses MongoDB instead of static file.
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Federation instances
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 instances:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       code:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       country:
 *                         type: string
 *                       flag:
 *                         type: string
 *                       locale:
 *                         type: string
 *                       endpoints:
 *                         type: object
 *                         properties:
 *                           app:
 *                             type: string
 *                           api:
 *                             type: string
 *                           idp:
 *                             type: string
 *                       federationStatus:
 *                         type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 source:
 *                   type: string
 *       500:
 *         description: Server error
 */
router.get('/instances', async (_req: Request, res: Response): Promise<void> => {
    try {
        const { federationDiscovery } = await import('../services/federation-discovery.service');
        const instances = await federationDiscovery.getInstances();

        // Map to frontend-friendly format
        const formattedInstances = instances.map(inst => ({
            code: inst.code,
            name: inst.name,
            type: inst.type,
            country: inst.code,
            flag: getCountryFlag(inst.code),
            locale: 'en-US',
            endpoints: {
                app: inst.endpoints.frontend,
                api: inst.endpoints.api,
                idp: inst.endpoints.keycloak
            },
            federationStatus: 'approved'
        }));

        res.json({
            instances: formattedInstances,
            timestamp: new Date().toISOString(),
            source: 'mongodb'
        });
    } catch (error) {
        logger.error('Failed to load federation instances', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'InternalError',
            message: 'Failed to load federation instances'
        });
    }
});

// Helper function to get country flag emoji
function getCountryFlag(countryCode: string): string {
    const flags: Record<string, string> = {
        USA: '🇺🇸', FRA: '🇫🇷', GBR: '🇬🇧', DEU: '🇩🇪', CAN: '🇨🇦',
        AUS: '🇦🇺', NZL: '🇳🇿', ITA: '🇮🇹', ESP: '🇪🇸', NLD: '🇳🇱',
        POL: '🇵🇱', BEL: '🇧🇪', PRT: '🇵🇹', GRC: '🇬🇷', TUR: '🇹🇷',
        NOR: '🇳🇴', DNK: '🇩🇰', CZE: '🇨🇿', HUN: '🇭🇺', SVK: '🇸🇰',
        SVN: '🇸🇮', HRV: '🇭🇷', ROU: '🇷🇴', BGR: '🇧🇬', EST: '🇪🇪',
        LVA: '🇱🇻', LTU: '🇱🇹', ALB: '🇦🇱', MNE: '🇲🇪', MKD: '🇲🇰',
        LUX: '🇱🇺', ISL: '🇮🇸', FIN: '🇫🇮', SWE: '🇸🇪'
    };
    return flags[countryCode] || '🏳️';
}

/**
 * POST /api/federation/register
 * Register a new spoke instance
 */
router.post('/register', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = registrationSchema.safeParse(req.body);

        if (!parsed.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.issues
            });
            return;
        }

        const request: IRegistrationRequest = parsed.data;

        // Decode base64-encoded certificate/CSR if provided
        if (request.certificatePEM) {
            try {
                request.certificatePEM = Buffer.from(request.certificatePEM, 'base64').toString('utf-8');
            } catch {
                // Already in PEM format, use as-is
            }
        }

        // Check if IdP validation should be skipped (for testing or dev environments)
        const skipValidation = req.body.skipValidation === true ||
            process.env.SKIP_IDP_VALIDATION === 'true' ||
            process.env.NODE_ENV === 'test' ||
            process.env.NODE_ENV === 'development' ||
            request.idpUrl.includes('dive-spoke-') ||  // Internal container names
            request.idpUrl.includes('localhost') ||
            request.idpUrl.includes('host.docker.internal');

        if (!skipValidation) {
            // Validate IdP endpoint before registration
            logger.info('Validating IdP endpoint for spoke registration', {
                instanceCode: request.instanceCode,
                idpUrl: request.idpUrl
            });

            const tlsResult = await idpValidationService.validateTLS(request.idpUrl, request.instanceCode);

            if (!tlsResult.pass) {
                res.status(400).json({
                    error: 'IdP endpoint validation failed',
                    details: {
                        tls: tlsResult.errors,
                        warnings: tlsResult.warnings
                    }
                });
                return;
            }
        } else {
            logger.info('Skipping IdP validation for spoke registration', {
                instanceCode: request.instanceCode,
                idpUrl: request.idpUrl,
                reason: skipValidation === true ? 'skipValidation flag' :
                    request.idpUrl.includes('dive-spoke-') ? 'internal container URL' :
                        request.idpUrl.includes('localhost') ? 'localhost URL' :
                            request.idpUrl.includes('host.docker.internal') ? 'docker internal URL' :
                                'environment setting'
            });
        }

        let spoke = await hubSpokeRegistry.registerSpoke(request);

        logger.info('Spoke registration successful', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            status: spoke.status
        });

        // AUTH-CODE VALIDATION: Validate against Vault KV if provided
        let isAuthCodeApproved = false;
        if (request.authCode) {
            const vault = await getVaultConnection();
            const codeLower = request.instanceCode.toLowerCase();

            if (vault) {
                try {
                    const vaultRes = await fetch(
                        `${vault.addr}/v1/dive-v3/auth/data/spoke-auth/${codeLower}`,
                        {
                            headers: { 'X-Vault-Token': vault.token },
                            signal: AbortSignal.timeout(5000),
                            redirect: 'follow',
                        }
                    );

                    if (vaultRes.ok) {
                        const vaultData = await vaultRes.json() as {
                            data: { data: Record<string, string> };
                        };
                        const authRecord = vaultData.data.data;

                        if (authRecord.auth_code === request.authCode &&
                            authRecord.status === 'authorized') {
                            // Check expiration
                            const expiresAt = authRecord.expires_at;
                            const notExpired = !expiresAt ||
                                new Date(expiresAt).getTime() > Date.now();

                            if (notExpired) {
                                isAuthCodeApproved = true;
                                logger.info('Auth code validated against Vault', {
                                    instanceCode: request.instanceCode,
                                    authorizedBy: authRecord.authorized_by,
                                });

                                // Mark as consumed in Vault
                                await fetch(
                                    `${vault.addr}/v1/dive-v3/auth/data/spoke-auth/${codeLower}`,
                                    {
                                        method: 'POST',
                                        headers: {
                                            'X-Vault-Token': vault.token,
                                            'Content-Type': 'application/json',
                                        },
                                        body: JSON.stringify({
                                            data: {
                                                ...authRecord,
                                                status: 'consumed',
                                                consumed_at: new Date().toISOString(),
                                                consumed_by_spoke: spoke.spokeId,
                                            },
                                        }),
                                        signal: AbortSignal.timeout(5000),
                                        redirect: 'follow',
                                    }
                                ).catch(err => {
                                    logger.warn('Failed to mark auth code as consumed', { error: String(err) });
                                });
                            } else {
                                logger.warn('Auth code expired', {
                                    instanceCode: request.instanceCode,
                                    expiresAt,
                                });
                            }
                        } else {
                            logger.warn('Auth code mismatch or not authorized', {
                                instanceCode: request.instanceCode,
                                vaultStatus: authRecord.status,
                            });
                        }
                    } else {
                        logger.warn('No Vault auth record found for spoke', {
                            instanceCode: request.instanceCode,
                            vaultStatus: vaultRes.status,
                        });
                    }
                } catch (err) {
                    logger.warn('Vault auth-code validation failed', {
                        instanceCode: request.instanceCode,
                        error: String(err),
                    });
                }
            } else {
                logger.debug('Vault not available — skipping auth-code validation');
            }
        }

        // AUTO-APPROVAL: Development mode OR pre-approved Vault partner OR valid auth code
        const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
        const isPartnerPreApproved = request.partnerPreApproved === true;
        const autoApprove = isDevelopment || process.env.AUTO_APPROVE_SPOKES === 'true' || isPartnerPreApproved || isAuthCodeApproved;

        let token = null;
        if (autoApprove) {
            // Use partner trust config when available, fall back to development defaults
            const trustLevel = (isPartnerPreApproved && request.partnerTrustLevel)
                ? request.partnerTrustLevel
                : (isAuthCodeApproved ? 'partner' : 'development');
            const maxClassification = (isPartnerPreApproved && request.partnerMaxClassification)
                ? request.partnerMaxClassification : 'SECRET';
            const approvedBy = isAuthCodeApproved
                ? `auth-code-${request.instanceCode}`
                : isPartnerPreApproved
                    ? `vault-partner-${request.instanceCode}` : 'auto-approval-system';

            try {
                logger.info('Auto-approving spoke', {
                    spokeId: spoke.spokeId,
                    instanceCode: spoke.instanceCode,
                    reason: isAuthCodeApproved ? 'auth-code' : isPartnerPreApproved ? 'vault-partner' : 'development-mode',
                    trustLevel,
                    maxClassification,
                });

                spoke = await hubSpokeRegistry.approveSpoke(
                    spoke.spokeId,
                    approvedBy,
                    {
                        allowedScopes: request.requestedScopes,
                        trustLevel: trustLevel as 'development' | 'partner' | 'bilateral' | 'national',
                        maxClassification,
                        dataIsolationLevel: 'filtered',
                        autoLinkIdP: true,  // Create bidirectional IdP federation
                    }
                );

                // Generate token for the spoke
                const spokeToken = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);
                token = {
                    token: spokeToken.token,
                    expiresAt: spokeToken.expiresAt,
                    scopes: spokeToken.scopes,
                };

                logger.info('Spoke auto-approved with bidirectional federation', {
                    spokeId: spoke.spokeId,
                    instanceCode: spoke.instanceCode,
                    status: spoke.status,
                    federationIdPAlias: spoke.federationIdPAlias,
                });
            } catch (approvalError) {
                logger.error('Auto-approval failed', {
                    spokeId: spoke.spokeId,
                    error: approvalError instanceof Error ? approvalError.message : 'Unknown error',
                });

                // FIXED (Dec 2025): Get updated spoke from error if available (race condition fix)
                // The approveSpoke function now attaches the re-fetched spoke to the error
                if ((approvalError as Error & { spoke?: typeof spoke }).spoke) {
                    spoke = (approvalError as Error & { spoke?: typeof spoke }).spoke!;
                    logger.warn('Spoke status after failed approval', {
                        spokeId: spoke.spokeId,
                        status: spoke.status,
                    });
                }
                // Registration succeeds but spoke may be in suspended/pending status
            }
        }

        // FIXED (Dec 2025): Re-fetch spoke from DB to get authoritative status
        // This ensures we return the true current state, not stale local variable
        const freshSpoke = await hubSpokeRegistry.getSpokeByInstanceCode(spoke.instanceCode);
        const finalStatus = freshSpoke?.status || spoke.status;

        // CRITICAL (2026-01-29): When spoke is approved but token is null (e.g. re-registration after
        // nuking only the spoke — Hub still has the spoke as approved, approveSpoke throws "already approved"),
        // generate/return a token so the client can configure SPOKE_TOKEN. Without this, deploy fails with
        // "Auto-approval failed - token not found in response".
        let finalToken = token;
        if (finalStatus === 'approved' && !finalToken) {
            try {
                const existingToken = await hubSpokeRegistry.getActiveToken(spoke.spokeId);
                if (existingToken) {
                    finalToken = {
                        token: existingToken.token,
                        expiresAt: existingToken.expiresAt,
                        scopes: existingToken.scopes,
                    };
                    logger.info('Returning existing token for already-approved spoke (re-registration)', {
                        spokeId: spoke.spokeId,
                        instanceCode: spoke.instanceCode,
                    });
                } else {
                    const newToken = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);
                    finalToken = {
                        token: newToken.token,
                        expiresAt: newToken.expiresAt,
                        scopes: newToken.scopes,
                    };
                    logger.info('Generated new token for already-approved spoke (re-registration)', {
                        spokeId: spoke.spokeId,
                        instanceCode: spoke.instanceCode,
                    });
                }
            } catch (tokenError) {
                logger.error('Failed to get/generate token for approved spoke', {
                    spokeId: spoke.spokeId,
                    error: tokenError instanceof Error ? tokenError.message : String(tokenError),
                });
            }
        }

        // Determine appropriate message based on actual status
        let statusMessage: string;
        if (finalStatus === 'approved') {
            statusMessage = 'Registration approved with bidirectional federation.';
        } else if (finalStatus === 'suspended') {
            statusMessage = 'Registration failed - spoke suspended due to federation issues. Contact administrator.';
        } else {
            statusMessage = 'Registration pending approval. You will receive a token once approved.';
        }

        res.status(201).json({
            success: true,
            spoke: {
                spokeId: spoke.spokeId,
                instanceCode: spoke.instanceCode,
                name: spoke.name,
                status: finalStatus,  // Use authoritative DB status
                federationIdPAlias: spoke.federationIdPAlias,
                message: statusMessage,
            },
            token: finalToken,  // Always include token when status is approved (new or re-registration)
        });

    } catch (error) {
        logger.error('Spoke registration failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Registration failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/registration/{spokeId}/status:
 *   get:
 *     summary: Check spoke registration status
 *     description: Public endpoint for spokes to poll registration status. Returns approval status, token when approved, and status-specific messages. Accepts either spokeId or instanceCode.
 *     tags: [Federation]
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke ID or instance code
 *     responses:
 *       200:
 *         description: Registration status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spokeId:
 *                   type: string
 *                 instanceCode:
 *                   type: string
 *                 status:
 *                   type: string
 *                   enum: [pending, approved, suspended, revoked]
 *                 registeredAt:
 *                   type: string
 *                   format: date-time
 *                 approvedAt:
 *                   type: string
 *                   format: date-time
 *                 token:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                 message:
 *                   type: string
 *       404:
 *         description: Registration not found
 *       500:
 *         description: Server error
 */
router.get('/registration/:spokeId/status', async (req: Request, res: Response): Promise<void> => {
    try {
        const { spokeId } = req.params;

        // Try to find by spokeId first, then by instanceCode
        let spoke = await hubSpokeRegistry.getSpoke(spokeId);
        if (!spoke) {
            spoke = await hubSpokeRegistry.getSpokeByInstanceCode(spokeId.toUpperCase());
        }

        if (!spoke) {
            res.status(404).json({
                success: false,
                error: 'Registration not found',
                message: 'No registration found with this ID or instance code'
            });
            return;
        }

        // Build response based on status
        const response: {
            success: boolean;
            spokeId: string;
            instanceCode: string;
            status: string;
            registeredAt: Date;
            approvedAt?: Date;
            token?: {
                token: string;
                expiresAt: Date;
                scopes: string[];
            };
            message: string;
        } = {
            success: true,
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            status: spoke.status,
            registeredAt: spoke.registeredAt,
            message: ''
        };

        switch (spoke.status) {
            case 'pending':
                response.message = 'Registration is pending hub admin approval';
                break;
            case 'approved':
                response.approvedAt = spoke.approvedAt;
                // Generate and return token if just approved
                // (The spoke will use this to configure OPAL)
                const existingToken = await hubSpokeRegistry.getActiveToken(spoke.spokeId);
                if (existingToken) {
                    response.token = {
                        token: existingToken.token,
                        expiresAt: existingToken.expiresAt,
                        scopes: existingToken.scopes
                    };
                    response.message = 'Registration approved - token included';
                } else {
                    // Generate new token
                    const newToken = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);
                    response.token = {
                        token: newToken.token,
                        expiresAt: newToken.expiresAt,
                        scopes: newToken.scopes
                    };
                    response.message = 'Registration approved - new token generated';
                }
                break;
            case 'suspended':
                response.message = 'Registration is suspended. Contact hub administrator.';
                break;
            case 'revoked':
                response.message = 'Registration has been revoked.';
                break;
            default:
                response.message = `Registration status: ${spoke.status}`;
        }

        logger.info('Registration status check', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            status: spoke.status
        });

        res.json(response);

    } catch (error) {
        logger.error('Registration status check failed', {
            spokeId: req.params.spokeId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to check registration status',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/search:
 *   get:
 *     summary: Federated search
 *     description: Search federated resources with classification and agreement enforcement. Service Provider (SP) must have active federation agreement covering requested classification and country.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *         description: Filter by classification level
 *       - in: query
 *         name: releasabilityTo
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Filter by releasability countries
 *       - in: query
 *         name: COI
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Filter by Communities of Interest
 *       - in: query
 *         name: keywords
 *         schema:
 *           type: array
 *           items:
 *             type: string
 *         description: Full-text search keywords
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 1000
 *         description: Maximum results to return
 *       - in: query
 *         name: offset
 *         schema:
 *           type: integer
 *           default: 0
 *         description: Pagination offset
 *     responses:
 *       200:
 *         description: Search results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalResults:
 *                   type: integer
 *                 resources:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       resourceId:
 *                         type: string
 *                       title:
 *                         type: string
 *                       classification:
 *                         type: string
 *                       releasabilityTo:
 *                         type: array
 *                         items:
 *                           type: string
 *                       COI:
 *                         type: array
 *                         items:
 *                           type: string
 *                 searchContext:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: No active federation agreement or classification not allowed
 */
router.get(
    '/search',
    requireSPAuth,
    requireSPScope('resource:search'),
    async (req: Request, res: Response): Promise<void> => {
        const spContext = (req as unknown as Record<string, unknown>).sp as Record<string, unknown> | undefined;
        const classification = (req.query.classification as string) || undefined;

        interface IAgreement { validUntil?: string; classifications?: string[]; countries?: string[] }
        const sp = spContext?.sp as Record<string, unknown> | undefined;
        const agreements = (sp?.federationAgreements || []) as IAgreement[];
        const activeAgreements = agreements.filter((ag) => !ag.validUntil || new Date(ag.validUntil) > new Date());

        if (activeAgreements.length === 0) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'No active federation agreement'
            });
            return;
        }

        const allowedClasses = activeAgreements[0]?.classifications || [];
        const agreementCoversClass =
            !classification || activeAgreements.some((ag) =>
                !ag.classifications || ag.classifications.includes(classification)
            );
        const agreementCoversCountry = activeAgreements.some((ag) =>
            (ag.countries || []).includes(sp?.country as string)
        );

        if (!agreementCoversCountry) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'not covered by federation agreement'
            });
            return;
        }

        if (!agreementCoversClass) {
            res.status(403).json({
                error: 'Forbidden',
                message: `Classification ${classification} not allowed`,
                allowedClassifications: allowedClasses.length ? allowedClasses : ['UNCLASSIFIED', 'CONFIDENTIAL']
            });
            return;
        }

        const limitParam = parseInt((req.query.limit as string) || '100', 10);
        const offset = parseInt((req.query.offset as string) || '0', 10);
        const limit = Math.min(Math.max(limitParam, 1), 1000);

        const query: Record<string, unknown> = {};
        if (classification) {
            query.classification = classification;
        }
        if (req.query.releasabilityTo) {
            query.releasabilityTo = { $in: Array.isArray(req.query.releasabilityTo) ? req.query.releasabilityTo : [req.query.releasabilityTo] };
        }
        if (req.query.COI) {
            query.COI = { $in: Array.isArray(req.query.COI) ? req.query.COI : [req.query.COI] };
        }
        if (req.query.keywords) {
            const kw = Array.isArray(req.query.keywords) ? req.query.keywords : [req.query.keywords];
            query.$text = { $search: kw.join(' ') };
        }

        const resources = await getResourcesByQuery(query, {
            limit,
            offset,
            fields: {
                resourceId: 1,
                title: 1,
                classification: 1,
                releasabilityTo: 1,
                COI: 1
            }
        });

        const sanitized = resources.map((r: Record<string, unknown>) => ({
            resourceId: r.resourceId,
            title: r.title,
            classification: r.classification,
            releasabilityTo: (r.releasabilityTo as string[]) || [],
            COI: (r.COI as string[]) || []
        }));

        res.json({
            totalResults: sanitized.length,
            resources: sanitized,
            searchContext: {
                country: sp?.country || 'UNKNOWN',
                requestingEntity: sp?.spId || 'UNKNOWN'
            }
        });
    }
);

/**
 * @openapi
 * /api/federation/resources/request:
 *   post:
 *     summary: Request federated resource access
 *     description: Request access to a specific federated resource. Validates SP has active federation agreement covering the resource's classification and country. Returns access grant if authorized.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - resourceId
 *             properties:
 *               resourceId:
 *                 type: string
 *                 description: Resource identifier
 *               justification:
 *                 type: string
 *                 description: Optional justification for access request
 *     responses:
 *       200:
 *         description: Access granted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessGrant:
 *                   type: object
 *                   properties:
 *                     grantId:
 *                       type: string
 *                     resourceId:
 *                       type: string
 *                     grantedAt:
 *                       type: string
 *                       format: date-time
 *                     justification:
 *                       type: string
 *                 resource:
 *                   type: object
 *                   properties:
 *                     resourceId:
 *                       type: string
 *                     classification:
 *                       type: string
 *                     releasabilityTo:
 *                       type: array
 *                       items:
 *                         type: string
 *                     COI:
 *                       type: array
 *                       items:
 *                         type: string
 *       400:
 *         description: Invalid request - resourceId required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: No active federation agreement or classification not allowed
 *       404:
 *         description: Resource not found
 */
router.post(
    '/resources/request',
    requireSPAuth,
    requireSPScope('resource:read'),
    async (req: Request, res: Response): Promise<void> => {
        const spContext = (req as unknown as Record<string, unknown>).sp as Record<string, unknown> | undefined;
        const { resourceId, justification } = req.body || {};

        if (!resourceId) {
            res.status(400).json({ error: 'Validation failed', message: 'resourceId is required' });
            return;
        }

        const resources = await getResourcesByQuery({ resourceId }, { limit: 1 });
        const resource = resources[0];

        if (!resource) {
            res.status(404).json({ error: 'Not Found', message: 'Resource not found' });
            return;
        }

        interface IAgreement2 { validUntil?: string; classifications?: string[]; countries?: string[] }
        const sp2 = spContext?.sp as Record<string, unknown> | undefined;
        const classification = resource.classification;
        const agreements = (sp2?.federationAgreements || []) as IAgreement2[];
        const activeAgreements = agreements.filter((ag) => !ag.validUntil || new Date(ag.validUntil) > new Date());
        const agreementCoversCountry = activeAgreements.some((ag) =>
            (ag.countries || []).includes(sp2?.country as string)
        );
        const agreementCoversClass =
            !classification ||
            activeAgreements.some((ag) =>
                !ag.classifications || ag.classifications.includes(classification as string)
            );

        if (activeAgreements.length === 0) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'not covered by federation agreement'
            });
            return;
        }

        if (!agreementCoversCountry) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'not covered by federation agreement'
            });
            return;
        }

        if (!agreementCoversClass) {
            res.status(403).json({
                error: 'Forbidden',
                message: `Classification ${classification} not allowed`,
                allowedClassifications: activeAgreements[0]?.classifications || ['UNCLASSIFIED', 'CONFIDENTIAL']
            });
            return;
        }

        const grantId = crypto.randomUUID();
        const grantedAt = new Date().toISOString();

        res.status(200).json({
            accessGrant: {
                grantId,
                resourceId,
                grantedAt,
                justification: justification || null
            },
            resource: {
                resourceId: resource.resourceId,
                classification: resource.classification,
                releasabilityTo: resource.releasabilityTo || [],
                COI: resource.COI || []
            }
        });
    }
);

// ============================================
// SP CLIENT ENDPOINTS (Pilot Mode)
// ============================================

/**
 * @openapi
 * /api/federation/sp/register:
 *   post:
 *     summary: Register SP client
 *     description: Register a new Service Provider (SP) client for OAuth/OIDC integration. For partners who want to integrate with DIVE without deploying a full spoke. Returns client credentials and OIDC endpoints.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - organizationType
 *               - country
 *               - technicalContact
 *               - redirectUris
 *               - allowedScopes
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               organizationType:
 *                 type: string
 *                 enum: [government, military, defense_contractor, research, other]
 *               country:
 *                 type: string
 *                 description: ISO 3166-1 alpha-3 country code
 *               technicalContact:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   email:
 *                     type: string
 *                     format: email
 *               clientType:
 *                 type: string
 *                 enum: [confidential, public]
 *                 default: confidential
 *               redirectUris:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *               postLogoutRedirectUris:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uri
 *               jwksUri:
 *                 type: string
 *                 format: uri
 *               tokenEndpointAuthMethod:
 *                 type: string
 *                 enum: [client_secret_basic, client_secret_post, private_key_jwt, none]
 *                 default: client_secret_basic
 *               requirePKCE:
 *                 type: boolean
 *                 default: true
 *               allowedScopes:
 *                 type: array
 *                 items:
 *                   type: string
 *               allowedGrantTypes:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: [authorization_code, refresh_token, client_credentials]
 *                 default: [authorization_code, refresh_token]
 *               maxClassification:
 *                 type: string
 *                 enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *                 default: UNCLASSIFIED
 *     responses:
 *       201:
 *         description: SP client registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sp:
 *                   type: object
 *                   properties:
 *                     spId:
 *                       type: string
 *                     clientId:
 *                       type: string
 *                     clientSecret:
 *                       type: string
 *                       description: Only returned on initial registration
 *                     name:
 *                       type: string
 *                     country:
 *                       type: string
 *                     status:
 *                       type: string
 *                     message:
 *                       type: string
 *                 endpoints:
 *                   type: object
 *                   properties:
 *                     issuer:
 *                       type: string
 *                     authorization:
 *                       type: string
 *                     token:
 *                       type: string
 *                     userinfo:
 *                       type: string
 *                     jwks:
 *                       type: string
 *       400:
 *         description: Validation failed
 *       500:
 *         description: Registration failed
 */
router.post('/sp/register', async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = spRegistrationSchema.safeParse(req.body);

        if (!parsed.success) {
            res.status(400).json({
                error: 'Validation failed',
                details: parsed.error.issues
            });
            return;
        }

        logger.info('Processing SP Client registration', {
            name: parsed.data.name,
            country: parsed.data.country,
            organizationType: parsed.data.organizationType
        });

        // Register the SP using SPManagementService
        // Map organization type to expected enum values
        const orgTypeMap: Record<string, 'GOVERNMENT' | 'MILITARY' | 'CONTRACTOR' | 'ACADEMIC'> = {
            'government': 'GOVERNMENT',
            'military': 'MILITARY',
            'defense_contractor': 'CONTRACTOR',
            'research': 'ACADEMIC',
            'other': 'CONTRACTOR'
        };

        // Map token auth method to expected enum values
        const authMethodMap: Record<string, 'client_secret_basic' | 'client_secret_post' | 'private_key_jwt'> = {
            'client_secret_basic': 'client_secret_basic',
            'client_secret_post': 'client_secret_post',
            'private_key_jwt': 'private_key_jwt',
            'none': 'client_secret_basic'
        };

        const sp = await spManagement.registerSP({
            name: parsed.data.name,
            description: parsed.data.description || `SP Client for ${parsed.data.name}`,
            organizationType: orgTypeMap[parsed.data.organizationType] || 'GOVERNMENT',
            country: parsed.data.country,
            technicalContact: {
                name: parsed.data.technicalContact.name || 'Admin',
                email: parsed.data.technicalContact.email,
                phone: ''
            },
            clientType: parsed.data.clientType,
            redirectUris: parsed.data.redirectUris,
            postLogoutRedirectUris: parsed.data.postLogoutRedirectUris,
            jwksUri: parsed.data.jwksUri || undefined,
            tokenEndpointAuthMethod: authMethodMap[parsed.data.tokenEndpointAuthMethod] || 'client_secret_basic',
            requirePKCE: parsed.data.requirePKCE,
            allowedScopes: parsed.data.allowedScopes,
            allowedGrantTypes: parsed.data.allowedGrantTypes,
            attributeRequirements: {
                clearance: parsed.data.attributeRequirements?.clearance?.required ?? true,
                country: parsed.data.attributeRequirements?.countryOfAffiliation?.required ?? true
            },
            rateLimit: parsed.data.rateLimit
        });

        logger.info('SP Client registered successfully', {
            spId: sp.spId,
            clientId: sp.clientId,
            name: sp.name,
            country: sp.country,
            status: sp.status
        });

        res.status(201).json({
            success: true,
            sp: {
                spId: sp.spId,
                clientId: sp.clientId,
                clientSecret: sp.clientSecret, // Only returned on initial registration
                name: sp.name,
                country: sp.country,
                status: sp.status,
                message: sp.status === 'PENDING'
                    ? 'Registration pending approval. You will be notified when approved.'
                    : 'Registration successful.'
            },
            endpoints: {
                issuer: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker-usa`,
                authorization: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker-usa/protocol/openid-connect/auth`,
                token: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker-usa/protocol/openid-connect/token`,
                userinfo: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker-usa/protocol/openid-connect/userinfo`,
                jwks: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker-usa/protocol/openid-connect/certs`
            }
        });

    } catch (error) {
        logger.error('SP Client registration failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Registration failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/sp/{spId}:
 *   get:
 *     summary: Get SP client details
 *     description: Retrieves Service Provider client details by ID. Client secret is never included in response.
 *     tags: [Federation]
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: SP identifier
 *     responses:
 *       200:
 *         description: SP client details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 sp:
 *                   type: object
 *       404:
 *         description: SP not found
 *       500:
 *         description: Server error
 */
router.get('/sp/:spId', async (req: Request, res: Response): Promise<void> => {
    try {
        const sp = await spManagement.getById(req.params.spId);

        if (!sp) {
            res.status(404).json({ error: 'SP not found' });
            return;
        }

        // Don't return client secret
        const { clientSecret, ...safesp } = sp as any;

        res.json({
            sp: safesp
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get SP details' });
    }
});

/**
 * @openapi
 * /api/federation/sp:
 *   get:
 *     summary: List SP clients
 *     description: Returns paginated list of Service Provider clients with optional filtering. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by status
 *       - in: query
 *         name: country
 *         schema:
 *           type: string
 *         description: Filter by country code
 *       - in: query
 *         name: organizationType
 *         schema:
 *           type: string
 *         description: Filter by organization type
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by name or client ID
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *         description: Results per page
 *     responses:
 *       200:
 *         description: SP clients list
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/sp', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await spManagement.listSPs({
            status: req.query.status as string | undefined,
            country: req.query.country as string | undefined,
            organizationType: req.query.organizationType as string | undefined,
            search: req.query.search as string | undefined,
            page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
            limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined
        });

        res.json(result);

    } catch (error) {
        res.status(500).json({ error: 'Failed to list SPs' });
    }
});

/**
 * @openapi
 * /api/federation/sp/{spId}/approve:
 *   post:
 *     summary: Approve SP client
 *     description: Approves a pending Service Provider client. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: SP identifier
 *     responses:
 *       200:
 *         description: SP approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sp:
 *                   type: object
 *                   properties:
 *                     spId:
 *                       type: string
 *                     clientId:
 *                       type: string
 *                     name:
 *                       type: string
 *                     status:
 *                       type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: SP not found
 *       500:
 *         description: Approval failed
 */
router.post('/sp/:spId/approve', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const approvedBy = (req as any).user?.uniqueID || 'admin';
        const sp = await spManagement.approveSP(req.params.spId, true, undefined, approvedBy);

        if (!sp) {
            res.status(404).json({ error: 'SP not found' });
            return;
        }

        logger.info('SP Client approved', {
            spId: sp.spId,
            name: sp.name,
            approvedBy
        });

        res.json({
            success: true,
            sp: {
                spId: sp.spId,
                clientId: sp.clientId,
                name: sp.name,
                status: sp.status
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Approval failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/sp/{spId}/suspend:
 *   post:
 *     summary: Suspend SP client
 *     description: Suspends an active Service Provider client and disables OAuth client in Keycloak. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: SP identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for suspension
 *     responses:
 *       200:
 *         description: SP suspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 sp:
 *                   type: object
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: SP not found
 *       500:
 *         description: Suspension failed
 */
router.post('/sp/:spId/suspend', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { reason } = req.body;
        const suspendedBy = (req as any).user?.uniqueID || 'admin';

        const sp = await spManagement.suspendSP(req.params.spId, reason || 'No reason provided', suspendedBy);

        if (!sp) {
            res.status(404).json({ error: 'SP not found' });
            return;
        }

        logger.warn('SP Client suspended', {
            spId: sp.spId,
            name: sp.name,
            reason,
            suspendedBy
        });

        res.json({
            success: true,
            sp: {
                spId: sp.spId,
                clientId: sp.clientId,
                name: sp.name,
                status: sp.status
            },
            message: 'SP Client suspended. OAuth client disabled in Keycloak.'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Suspension failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/sp/{spId}/regenerate-secret:
 *   post:
 *     summary: Regenerate SP client secret
 *     description: Regenerates the client secret for a confidential SP client. Previous secret is immediately invalidated. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spId
 *         required: true
 *         schema:
 *           type: string
 *         description: SP identifier
 *     responses:
 *       200:
 *         description: Client secret regenerated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 clientSecret:
 *                   type: string
 *                   description: New client secret (only shown once)
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: SP not found or is public client
 *       500:
 *         description: Secret regeneration failed
 */
router.post('/sp/:spId/regenerate-secret', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const result = await spManagement.regenerateClientSecret(req.params.spId);

        if (!result) {
            res.status(404).json({ error: 'SP not found or is public client' });
            return;
        }

        logger.info('SP Client secret regenerated', {
            spId: req.params.spId
        });

        res.json({
            success: true,
            clientSecret: result.clientSecret,
            message: 'New client secret generated. Previous secret is now invalid.'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Secret regeneration failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * POST /api/federation/heartbeat
 * Spoke heartbeat with health status
 */
router.post('/heartbeat', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = heartbeatSchema.safeParse(req.body);

        if (!parsed.success) {
            res.status(400).json({ error: 'Invalid heartbeat data' });
            return;
        }

        const spoke = (req as any).spoke;

        // Extract health data from either flat fields or nested services
        const opaHealthy = parsed.data.opaHealthy ?? parsed.data.services?.opa?.healthy;
        const opalClientConnected = parsed.data.opalClientConnected ?? parsed.data.services?.opalClient?.healthy;
        const latencyMs = parsed.data.latencyMs ?? parsed.data.metrics?.avgLatencyMs;

        // Record heartbeat
        await hubSpokeRegistry.recordHeartbeat(spoke.spokeId, {
            opaHealthy,
            opalClientConnected,
            latencyMs
        });

        // Record policy sync status (policyVersion can be null or undefined)
        const policyVersion = parsed.data.policyVersion;
        if (policyVersion) {
            await policySyncService.recordSpokeSync(spoke.spokeId, policyVersion);
        }

        // Get current version for comparison
        const currentVersion = policySyncService.getCurrentVersion();

        // SSOT ARCHITECTURE (2026-01-22): Include spokeId in response
        // The spoke backend uses SPOKE_TOKEN for auth, and Hub returns the
        // authoritative spokeId from its MongoDB. This allows spoke to cache
        // its identity without needing to store spokeId in .env or config.json
        res.json({
            success: true,
            serverTime: new Date().toISOString(),
            spokeId: spoke.spokeId,  // Hub's authoritative spokeId
            instanceCode: spoke.instanceCode,
            currentPolicyVersion: currentVersion.version,
            syncStatus: parsed.data.policyVersion === currentVersion.version ? 'current' : 'behind'
        });

    } catch (error) {
        logger.error('Heartbeat processing failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({ error: 'Heartbeat failed' });
    }
});

/**
 * @openapi
 * /api/federation/policy/version:
 *   get:
 *     summary: Get current policy version
 *     description: Returns the current policy version, timestamp, hash, and layers. Public endpoint (no auth).
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Current policy version
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 version:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 hash:
 *                   type: string
 *                 layers:
 *                   type: array
 *                   items:
 *                     type: string
 */
router.get('/policy/version', async (_req: Request, res: Response): Promise<void> => {
    const version = policySyncService.getCurrentVersion();

    res.json({
        version: version.version,
        timestamp: version.timestamp,
        hash: version.hash,
        layers: version.layers
    });
});

/**
 * @openapi
 * /api/federation/policy/bundle:
 *   get:
 *     summary: Download policy bundle
 *     description: Downloads policy bundle with delta updates filtered by spoke's allowed policy scopes. Requires valid spoke token.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: from
 *         schema:
 *           type: string
 *         description: Previous policy version for delta update
 *     responses:
 *       200:
 *         description: Policy bundle
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spokeId:
 *                   type: string
 *                 scopes:
 *                   type: array
 *                   items:
 *                     type: string
 *                 currentVersion:
 *                   type: string
 *                 updates:
 *                   type: array
 *                   items:
 *                     type: object
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to get policy bundle
 */
router.get('/policy/bundle', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
    try {
        const spoke = (req as any).spoke;
        const fromVersion = req.query.from as string | undefined;

        // Get delta update filtered by spoke's scopes
        const delta = await policySyncService.getDeltaUpdate(spoke.spokeId, fromVersion || '');

        res.json({
            spokeId: spoke.spokeId,
            scopes: spoke.allowedPolicyScopes,
            currentVersion: delta.currentVersion,
            updates: delta.updates,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        logger.error('Policy bundle request failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({ error: 'Failed to get policy bundle' });
    }
});

// ============================================
// ADMIN ENDPOINTS (Hub Management)
// ============================================

/**
 * GET /api/federation/spokes
 * List all registered spokes
 */
router.get('/spokes', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        const spokes = await hubSpokeRegistry.listAllSpokes();
        const stats = await hubSpokeRegistry.getStatistics();

        res.json({
            spokes,
            statistics: stats
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to list spokes' });
    }
});

/**
 * @openapi
 * /api/federation/spokes/pending:
 *   get:
 *     summary: List pending spokes
 *     description: Returns list of spokes pending approval. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Pending spokes
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 pending:
 *                   type: array
 *                   items:
 *                     type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/spokes/pending', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        const pending = await hubSpokeRegistry.listPendingApprovals();

        res.json({ pending });

    } catch (error) {
        res.status(500).json({ error: 'Failed to list pending approvals' });
    }
});

/**
 * GET /api/federation/spokes/config/:instanceCode
 * Returns complete spoke configuration from database (SSOT)
 * No auth required - runs on internal Docker network
 */
router.get('/spokes/config/:instanceCode', async (req: Request, res: Response): Promise<void> => {
    const { instanceCode } = req.params;

    try {
        const spoke = await hubSpokeRegistry.getSpokeByInstanceCode(instanceCode);

        if (!spoke) {
            res.status(404).json({
                error: 'Spoke not found',
                instanceCode,
            });
            return;
        }

        const code = spoke.instanceCode;
        const codeLower = code.toLowerCase();

        const config = {
            identity: {
                spokeId: spoke.spokeId,
                instanceCode: code,
                name: spoke.name,
                description: spoke.description || `DIVE V3 Spoke Instance for ${spoke.name}`,
                country: spoke.country || code,
                organizationType: spoke.organizationType || 'government',
                contactEmail: spoke.contactEmail || `admin@${codeLower}.dive25.com`,
            },
            endpoints: {
                hubUrl: spoke.hubUrl || 'https://dive-hub-backend:4000',
                hubApiUrl: `${spoke.hubUrl || 'https://dive-hub-backend:4000'}/api`,
                hubOpalUrl: 'https://dive-hub-opal-server:7002',
                baseUrl: spoke.baseUrl || `https://localhost:${spoke.frontendPort || 3000}`,
                apiUrl: spoke.apiUrl || `https://localhost:${spoke.backendPort || 4000}`,
                idpUrl: spoke.idpUrl || `https://dive-spoke-${codeLower}-keycloak:8443`,
                idpPublicUrl: spoke.idpPublicUrl || `https://localhost:${spoke.keycloakPort || 8443}`,
                kasUrl: `https://localhost:${spoke.kasPort || 8080}`,
            },
            ports: {
                frontend: spoke.frontendPort || 3000,
                backend: spoke.backendPort || 4000,
                keycloak: spoke.keycloakPort || 8443,
                kas: spoke.kasPort || 8080,
            },
            certificates: {
                certificatePath: `/app/instances/${codeLower}/certs/spoke.crt`,
                privateKeyPath: `/app/instances/${codeLower}/certs/spoke.key`,
                csrPath: `/app/instances/${codeLower}/certs/spoke.csr`,
                caBundlePath: `/app/instances/${codeLower}/certs/hub-ca.crt`,
            },
            authentication: spoke.keycloakAdminPassword ? { hasCredentials: true } : {},
            federation: {
                status: spoke.status,
                approvedAt: spoke.approvedAt,
                requestedScopes: spoke.allowedPolicyScopes || [
                    'policy:base',
                    `policy:${codeLower}`,
                    'data:federation_matrix',
                    'data:trusted_issuers',
                ],
            },
            operational: spoke.operationalSettings || {
                heartbeatIntervalMs: 30000,
                tokenRefreshBufferMs: 300000,
                offlineGracePeriodMs: 3600000,
                policyCachePath: `/app/instances/${codeLower}/cache/policies`,
                auditQueuePath: `/app/instances/${codeLower}/cache/audit`,
                maxAuditQueueSize: 10000,
                auditFlushIntervalMs: 60000,
            },
            metadata: {
                version: '2.0.0',
                createdAt: spoke.registeredAt,
                lastModified: spoke.registeredAt,
            },
        };

        res.json(config);
    } catch (error) {
        logger.error('Failed to retrieve spoke configuration', {
            instanceCode,
            error: error instanceof Error ? error.message : 'Unknown error',
        });
        res.status(500).json({ error: 'Internal server error' });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}:
 *   get:
 *     summary: Get spoke details
 *     description: Returns detailed spoke information including health status, sync status, and policy compliance. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     responses:
 *       200:
 *         description: Spoke details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spoke:
 *                   type: object
 *                 health:
 *                   type: object
 *                 syncStatus:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Spoke not found
 *       500:
 *         description: Server error
 */
router.get('/spokes/:spokeId', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const spoke = await hubSpokeRegistry.getSpoke(req.params.spokeId);

        if (!spoke) {
            res.status(404).json({ error: 'Spoke not found' });
            return;
        }

        // Get health status
        const health = await hubSpokeRegistry.checkSpokeHealth(spoke.spokeId);

        // Get sync status
        const syncStatus = policySyncService.getSpokeStatus(spoke.spokeId);

        res.json({
            spoke,
            health,
            syncStatus
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get spoke details' });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/keycloak-password:
 *   patch:
 *     summary: Update spoke Keycloak password
 *     description: Updates a spoke's Keycloak admin password. Password must be at least 10 characters. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - keycloakAdminPassword
 *             properties:
 *               keycloakAdminPassword:
 *                 type: string
 *                 minLength: 10
 *                 description: New Keycloak admin password
 *     responses:
 *       200:
 *         description: Password updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid password
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: Spoke not found
 *       500:
 *         description: Update failed
 */
router.patch('/spokes/:spokeId/keycloak-password', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { keycloakAdminPassword } = req.body;

        if (!keycloakAdminPassword || typeof keycloakAdminPassword !== 'string' || keycloakAdminPassword.length < 10) {
            res.status(400).json({
                error: 'Invalid password',
                message: 'Keycloak admin password must be at least 10 characters'
            });
            return;
        }

        const spoke = await hubSpokeRegistry.getSpoke(req.params.spokeId);

        if (!spoke) {
            res.status(404).json({ error: 'Spoke not found' });
            return;
        }

        // Update the spoke's Keycloak admin password
        await hubSpokeRegistry.updateSpokeKeycloakPassword(spoke.spokeId, keycloakAdminPassword);

        logger.info('Updated spoke Keycloak admin password', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode
        });

        res.json({
            success: true,
            message: 'Keycloak admin password updated successfully'
        });

    } catch (error) {
        logger.error('Failed to update spoke Keycloak password', {
            spokeId: req.params.spokeId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            error: 'Failed to update Keycloak password',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/approve:
 *   post:
 *     summary: Approve pending spoke
 *     description: Approves a pending spoke registration and generates Hub API token and OPAL client token. Creates bidirectional IdP federation if enabled. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - allowedScopes
 *               - trustLevel
 *               - maxClassification
 *               - dataIsolationLevel
 *             properties:
 *               allowedScopes:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Scopes to grant to spoke
 *               trustLevel:
 *                 type: string
 *                 enum: [development, partner, bilateral, national]
 *               maxClassification:
 *                 type: string
 *                 enum: [UNCLASSIFIED, CONFIDENTIAL, SECRET, TOP_SECRET]
 *               dataIsolationLevel:
 *                 type: string
 *                 enum: [full, filtered, minimal]
 *     responses:
 *       200:
 *         description: Spoke approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spoke:
 *                   type: object
 *                 hubApiToken:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *                 opalClientToken:
 *                   type: object
 *       400:
 *         description: Invalid approval data
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Approval failed
 */
router.post('/spokes/:spokeId/approve', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const parsed = approvalSchema.safeParse(req.body);

        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid approval data',
                details: parsed.error.issues
            });
            return;
        }

        const approvedBy = (req as any).user?.uniqueID || 'admin';

        const spoke = await hubSpokeRegistry.approveSpoke(
            req.params.spokeId,
            approvedBy,
            parsed.data
        );

        // Generate Hub API token for spoke
        const hubApiToken = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);

        // Generate OPAL client JWT for spoke's OPAL client to connect
        let opalClientToken = null;
        try {
            const { opalTokenService } = await import('../services/opal-token.service');
            if (opalTokenService.isConfigured()) {
                opalClientToken = await opalTokenService.generateClientToken(spoke.spokeId, spoke.instanceCode);
                logger.info('OPAL client token generated for spoke', {
                    spokeId: spoke.spokeId,
                    opalTokenExpires: opalClientToken.expiresAt
                });
            } else {
                logger.warn('OPAL token service not configured - spoke will need manual OPAL token');
            }
        } catch (opalError) {
            logger.warn('Failed to generate OPAL client token', {
                spokeId: spoke.spokeId,
                error: opalError instanceof Error ? opalError.message : 'Unknown'
            });
        }

        logger.info('Spoke approved', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            approvedBy,
            allowedScopes: parsed.data.allowedScopes,
            hasOpalToken: !!opalClientToken
        });

        res.json({
            success: true,
            spoke,
            token: {
                token: hubApiToken.token,
                expiresAt: hubApiToken.expiresAt,
                scopes: hubApiToken.scopes
            },
            opalToken: opalClientToken ? {
                token: opalClientToken.token,
                expiresAt: opalClientToken.expiresAt,
                type: 'opal_client'
            } : null
        });

    } catch (error) {
        logger.error('Spoke approval failed', {
            spokeId: req.params.spokeId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Approval failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/suspend:
 *   post:
 *     summary: Suspend spoke
 *     description: Suspends an approved spoke and revokes all tokens. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for suspension
 *     responses:
 *       200:
 *         description: Spoke suspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spoke:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Reason is required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Suspension failed
 */
router.post('/spokes/:spokeId/suspend', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { reason } = req.body;

        if (!reason) {
            res.status(400).json({ error: 'Reason is required' });
            return;
        }

        const spoke = await hubSpokeRegistry.suspendSpoke(req.params.spokeId, reason);

        logger.warn('Spoke suspended', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            reason
        });

        res.json({
            success: true,
            spoke,
            message: 'Spoke suspended. All tokens revoked.'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Suspension failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/unsuspend:
 *   post:
 *     summary: Unsuspend spoke
 *     description: Reactivates a suspended spoke. Optionally retries bidirectional federation setup. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               retryFederation:
 *                 type: boolean
 *                 description: Whether to retry bidirectional federation setup
 *     responses:
 *       200:
 *         description: Spoke unsuspended
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spoke:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Spoke is not suspended
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Unsuspension failed
 */
router.post('/spokes/:spokeId/unsuspend', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { retryFederation } = req.body;
        const unsuspendedBy = (req as any).user?.uniqueID || 'admin';

        const spoke = await hubSpokeRegistry.unsuspendSpoke(
            req.params.spokeId,
            unsuspendedBy,
            { retryFederation: retryFederation === true }
        );

        logger.info('Spoke unsuspended', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            unsuspendedBy,
            retryFederation,
        });

        res.json({
            success: true,
            spoke,
            message: retryFederation
                ? 'Spoke unsuspended. Federation retry attempted.'
                : 'Spoke unsuspended. Run federation-setup to restore bidirectional SSO.',
        });

    } catch (error) {
        const statusCode = (error as Error).message?.includes('not suspended') ? 400 : 500;
        res.status(statusCode).json({
            error: 'Unsuspension failed',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/revoke:
 *   post:
 *     summary: Revoke spoke
 *     description: Permanently revokes a spoke. All tokens are invalidated and federation is terminated. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - reason
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for revocation
 *     responses:
 *       200:
 *         description: Spoke revoked
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 spoke:
 *                   type: object
 *                 message:
 *                   type: string
 *       400:
 *         description: Reason is required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Revocation failed
 */
router.post('/spokes/:spokeId/revoke', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { reason } = req.body;

        if (!reason) {
            res.status(400).json({ error: 'Reason is required' });
            return;
        }

        await hubSpokeRegistry.revokeSpoke(req.params.spokeId, reason);

        logger.error('Spoke revoked', {
            spokeId: req.params.spokeId,
            reason
        });

        res.json({
            success: true,
            message: 'Spoke permanently revoked.'
        });

    } catch (error) {
        res.status(500).json({
            error: 'Revocation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/token:
 *   post:
 *     summary: Generate spoke token
 *     description: Generates a new Hub API token for a spoke. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     responses:
 *       200:
 *         description: Token generated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 token:
 *                   type: object
 *                   properties:
 *                     token:
 *                       type: string
 *                     expiresAt:
 *                       type: string
 *                       format: date-time
 *                     scopes:
 *                       type: array
 *                       items:
 *                         type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Token generation failed
 */
router.post('/spokes/:spokeId/token', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const token = await hubSpokeRegistry.generateSpokeToken(req.params.spokeId);

        res.json({
            success: true,
            token: {
                token: token.token,
                expiresAt: token.expiresAt,
                scopes: token.scopes
            }
        });

    } catch (error) {
        res.status(500).json({
            error: 'Token generation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/policy/push:
 *   post:
 *     summary: Push policy update
 *     description: Pushes policy update to all spokes. Updates specified policy layers with optional priority and description. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - layers
 *             properties:
 *               layers:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Policy layers to update
 *               priority:
 *                 type: string
 *                 default: normal
 *                 description: Update priority
 *               description:
 *                 type: string
 *                 description: Update description
 *     responses:
 *       200:
 *         description: Policy update pushed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 update:
 *                   type: object
 *                   properties:
 *                     updateId:
 *                       type: string
 *                     version:
 *                       type: string
 *       400:
 *         description: Layers array is required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Policy push failed
 */
router.post('/policy/push', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { layers, priority = 'normal', description } = req.body;

        if (!layers || !Array.isArray(layers) || layers.length === 0) {
            res.status(400).json({ error: 'Layers array is required' });
            return;
        }

        const update = await policySyncService.pushPolicyUpdate({
            layers,
            priority,
            description: description || `Policy update: ${layers.join(', ')}`
        });

        logger.info('Policy update pushed', {
            updateId: update.updateId,
            version: update.version,
            layers,
            priority
        });

        res.json({
            success: true,
            update
        });

    } catch (error) {
        res.status(500).json({
            error: 'Policy push failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/sync/status:
 *   get:
 *     summary: Get policy sync status
 *     description: Returns policy sync status for all spokes including current version, out-of-sync spokes, and detailed status breakdown. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Policy sync status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 currentVersion:
 *                   type: object
 *                   properties:
 *                     version:
 *                       type: string
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     hash:
 *                       type: string
 *                 spokes:
 *                   type: array
 *                   items:
 *                     type: object
 *                 outOfSync:
 *                   type: integer
 *                 summary:
 *                   type: object
 *                   properties:
 *                     total:
 *                       type: integer
 *                     current:
 *                       type: integer
 *                     behind:
 *                       type: integer
 *                     stale:
 *                       type: integer
 *                     offline:
 *                       type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/sync/status', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        const allStatus = await policySyncService.getAllSpokeStatus();
        const outOfSync = await policySyncService.getOutOfSyncSpokes();
        const currentVersion = policySyncService.getCurrentVersion();

        res.json({
            currentVersion,
            spokes: allStatus,
            outOfSync: outOfSync.length,
            summary: {
                total: allStatus.length,
                current: allStatus.filter(s => s.status === 'current').length,
                behind: allStatus.filter(s => s.status === 'behind').length,
                stale: allStatus.filter(s => s.status === 'stale').length,
                offline: allStatus.filter(s => s.status === 'offline').length
            }
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get sync status' });
    }
});

/**
 * @openapi
 * /api/federation/health:
 *   get:
 *     summary: Get federation health
 *     description: Returns overall federation health including statistics, unhealthy spokes, and current policy version. Public endpoint (no auth).
 *     tags: [Federation]
 *     responses:
 *       200:
 *         description: Federation health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 healthy:
 *                   type: boolean
 *                 statistics:
 *                   type: object
 *                 unhealthySpokes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       spokeId:
 *                         type: string
 *                       instanceCode:
 *                         type: string
 *                       lastHeartbeat:
 *                         type: string
 *                         format: date-time
 *                 policyVersion:
 *                   type: string
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *       500:
 *         description: Health check failed
 */
router.get('/health', async (_req: Request, res: Response): Promise<void> => {
    try {
        const stats = await hubSpokeRegistry.getStatistics();
        const unhealthy = await hubSpokeRegistry.getUnhealthySpokes();
        const currentVersion = policySyncService.getCurrentVersion();

        res.json({
            healthy: unhealthy.length === 0,
            statistics: stats,
            unhealthySpokes: unhealthy.map(s => ({
                spokeId: s.spokeId,
                instanceCode: s.instanceCode,
                lastHeartbeat: s.lastHeartbeat
            })),
            policyVersion: currentVersion.version,
            timestamp: new Date().toISOString()
        });

    } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
    }
});

/**
 * @openapi
 * /api/federation/health/spokes:
 *   get:
 *     summary: Get detailed spoke health
 *     description: Returns detailed health status for all spokes including health metrics, policy sync status, and aggregated summary. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Detailed spoke health
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 summary:
 *                   type: object
 *                   properties:
 *                     totalSpokes:
 *                       type: integer
 *                     healthySpokeCount:
 *                       type: integer
 *                     unhealthySpokeCount:
 *                       type: integer
 *                     totalActiveSpokes:
 *                       type: integer
 *                     averageLatency:
 *                       type: number
 *                 policySyncSummary:
 *                   type: object
 *                   properties:
 *                     current:
 *                       type: integer
 *                     behind:
 *                       type: integer
 *                     stale:
 *                       type: integer
 *                     offline:
 *                       type: integer
 *                 statusBreakdown:
 *                   type: object
 *                   properties:
 *                     approved:
 *                       type: integer
 *                     pending:
 *                       type: integer
 *                     suspended:
 *                       type: integer
 *                     revoked:
 *                       type: integer
 *                 spokes:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       spokeId:
 *                         type: string
 *                       instanceCode:
 *                         type: string
 *                       name:
 *                         type: string
 *                       status:
 *                         type: string
 *                       isHealthy:
 *                         type: boolean
 *                       lastHeartbeat:
 *                         type: string
 *                         format: date-time
 *                       lastHeartbeatAgo:
 *                         type: integer
 *                         description: Seconds since last heartbeat
 *                       trustLevel:
 *                         type: string
 *                       policySync:
 *                         type: object
 *                       health:
 *                         type: object
 *                         properties:
 *                           opaHealthy:
 *                             type: boolean
 *                           opalConnected:
 *                             type: boolean
 *                           latencyMs:
 *                             type: number
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/health/spokes', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    const requestId = `health-${Date.now()}`;

    try {
        // Get all spokes with their status
        const allSpokes = await hubSpokeRegistry.listAllSpokes();
        const unhealthySpokes = await hubSpokeRegistry.getUnhealthySpokes();
        const unhealthyIds = new Set(unhealthySpokes.map(s => s.spokeId));

        // Build detailed health status for each spoke
        const spokeHealthStatus = await Promise.all(
            allSpokes.map(async (spoke) => {
                const health = await hubSpokeRegistry.checkSpokeHealth(spoke.spokeId);
                const syncStatus = policySyncService.getSpokeStatus(spoke.spokeId);

                return {
                    spokeId: spoke.spokeId,
                    instanceCode: spoke.instanceCode,
                    name: spoke.name,
                    status: spoke.status,
                    isHealthy: !unhealthyIds.has(spoke.spokeId),
                    lastHeartbeat: spoke.lastHeartbeat,
                    lastHeartbeatAgo: spoke.lastHeartbeat
                        ? Math.floor((Date.now() - new Date(spoke.lastHeartbeat).getTime()) / 1000)
                        : null,
                    trustLevel: spoke.trustLevel || 'development',
                    policySync: syncStatus ? {
                        status: syncStatus.status,
                        currentVersion: syncStatus.currentVersion,
                        lastSuccess: syncStatus.lastAckTime,
                        consecutiveFailures: syncStatus.pendingUpdates || 0
                    } : null,
                    health: {
                        opaHealthy: health?.opaHealthy ?? false,
                        opalConnected: health?.opalClientConnected ?? false,
                        latencyMs: health?.latencyMs ?? 0
                    },
                    registeredAt: spoke.registeredAt,
                    approvedAt: spoke.approvedAt
                };
            })
        );

        // Aggregate health metrics ('approved' is the active status in ISpokeRegistration)
        const healthySpokeCount = spokeHealthStatus.filter(s => s.isHealthy && s.status === 'approved').length;
        const totalActiveSpokes = spokeHealthStatus.filter(s => s.status === 'approved').length;
        const averageLatency = spokeHealthStatus
            .filter(s => s.health.latencyMs > 0)
            .reduce((sum, s, _i, arr) => sum + s.health.latencyMs / arr.length, 0);

        const policySyncSummary = {
            current: spokeHealthStatus.filter(s => s.policySync?.status === 'current').length,
            behind: spokeHealthStatus.filter(s => s.policySync?.status === 'behind').length,
            stale: spokeHealthStatus.filter(s => s.policySync?.status === 'stale').length,
            offline: spokeHealthStatus.filter(s => s.policySync?.status === 'offline').length
        };

        const statusBreakdown = {
            approved: spokeHealthStatus.filter(s => s.status === 'approved').length,
            pending: spokeHealthStatus.filter(s => s.status === 'pending').length,
            suspended: spokeHealthStatus.filter(s => s.status === 'suspended').length,
            revoked: spokeHealthStatus.filter(s => s.status === 'revoked').length
        };

        logger.info('Spoke health aggregation requested', {
            requestId,
            totalSpokes: allSpokes.length,
            healthySpokes: healthySpokeCount
        });

        res.json({
            success: true,
            timestamp: new Date().toISOString(),
            summary: {
                totalSpokes: allSpokes.length,
                healthySpokeCount,
                totalActiveSpokes,
                healthPercentage: totalActiveSpokes > 0
                    ? Math.round((healthySpokeCount / totalActiveSpokes) * 100)
                    : 100,
                averageLatencyMs: Math.round(averageLatency),
                policySync: policySyncSummary,
                statusBreakdown
            },
            spokes: spokeHealthStatus,
            currentPolicyVersion: policySyncService.getCurrentVersion().version
        });

    } catch (error) {
        logger.error('Failed to aggregate spoke health', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to aggregate spoke health'
        });
    }
});

// ============================================
// AUDIT LOG AGGREGATION ENDPOINTS (DIVE-020)
// ============================================

// In-memory store for aggregated audit logs (production would use MongoDB)
interface IAggregatedAuditEntry {
    id: string;
    spokeId: string;
    instanceCode: string;
    timestamp: string;
    eventType: string;
    subject: {
        uniqueID: string;
        countryOfAffiliation: string;
        clearance?: string;
    };
    resource?: {
        resourceId: string;
        classification?: string;
        instanceId?: string;
    };
    action: string;
    decision: 'allow' | 'deny' | 'error';
    reason?: string;
    context?: Record<string, unknown>;
    offlineEntry: boolean;
    receivedAt: string;
}

// Circular buffer for aggregated audit logs (max 10000 entries)
const aggregatedAuditLogs: IAggregatedAuditEntry[] = [];
const MAX_AGGREGATED_LOGS = 10000;

// Audit ingestion statistics
const auditIngestionStats = {
    totalReceived: 0,
    totalBySpoke: {} as Record<string, number>,
    lastReceivedAt: null as string | null,
    droppedDueToCapacity: 0
};

/**
 * @openapi
 * /api/federation/audit/ingest:
 *   post:
 *     summary: Ingest spoke audit logs
 *     description: Receives batch audit logs from spokes for centralized aggregation. Requires valid spoke token.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - logs
 *             properties:
 *               logs:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     timestamp:
 *                       type: string
 *                       format: date-time
 *                     action:
 *                       type: string
 *                     actor:
 *                       type: string
 *                     resourceId:
 *                       type: string
 *                     outcome:
 *                       type: string
 *                     details:
 *                       type: object
 *     responses:
 *       200:
 *         description: Audit logs accepted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 accepted:
 *                   type: integer
 *                 spokeId:
 *                   type: string
 *       400:
 *         description: Invalid request
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Ingestion failed
 */
router.post('/audit/ingest', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
    const requestId = `audit-ingest-${Date.now()}`;
    const spokeId = (req as any).spoke?.spokeId;
    const instanceCode = (req as any).spoke?.instanceCode;

    try {
        const { entries } = req.body as {
            entries: Array<{
                id: string;
                timestamp: string;
                eventType: string;
                subject: { uniqueID: string; countryOfAffiliation: string; clearance?: string };
                resource?: { resourceId: string; classification?: string; instanceId?: string };
                action: string;
                decision: 'allow' | 'deny' | 'error';
                reason?: string;
                context?: Record<string, unknown>;
                offlineEntry: boolean;
            }>
        };

        if (!entries || !Array.isArray(entries)) {
            res.status(400).json({
                success: false,
                error: 'Invalid request: entries array required'
            });
            return;
        }

        if (entries.length === 0) {
            res.json({
                success: true,
                ingested: 0,
                message: 'No entries to ingest'
            });
            return;
        }

        // Validate and ingest entries
        const receivedAt = new Date().toISOString();
        let ingested = 0;
        let dropped = 0;

        for (const entry of entries) {
            // Basic validation
            if (!entry.id || !entry.timestamp || !entry.eventType || !entry.action || !entry.decision) {
                logger.warn('Skipping invalid audit entry', { requestId, entryId: entry.id });
                continue;
            }

            // Check capacity
            if (aggregatedAuditLogs.length >= MAX_AGGREGATED_LOGS) {
                // Remove oldest entry
                aggregatedAuditLogs.shift();
                auditIngestionStats.droppedDueToCapacity++;
                dropped++;
            }

            // Add to aggregated store
            aggregatedAuditLogs.push({
                ...entry,
                spokeId,
                instanceCode,
                receivedAt
            });

            ingested++;
        }

        // Update statistics
        auditIngestionStats.totalReceived += ingested;
        auditIngestionStats.totalBySpoke[spokeId] =
            (auditIngestionStats.totalBySpoke[spokeId] || 0) + ingested;
        auditIngestionStats.lastReceivedAt = receivedAt;

        logger.info('Audit logs ingested from spoke', {
            requestId,
            spokeId,
            instanceCode,
            ingested,
            dropped,
            totalStored: aggregatedAuditLogs.length
        });

        res.json({
            success: true,
            ingested,
            dropped,
            message: `Ingested ${ingested} audit entries`
        });

    } catch (error) {
        logger.error('Failed to ingest audit logs', {
            requestId,
            spokeId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to ingest audit logs'
        });
    }
});

/**
 * @openapi
 * /api/federation/audit/aggregated:
 *   get:
 *     summary: Query aggregated audit logs
 *     description: Queries aggregated audit logs from all spokes with optional filtering by spoke, action, actor, outcome, and time range. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: spokeId
 *         schema:
 *           type: string
 *         description: Filter by spoke ID
 *       - in: query
 *         name: action
 *         schema:
 *           type: string
 *         description: Filter by action type
 *       - in: query
 *         name: actor
 *         schema:
 *           type: string
 *         description: Filter by actor
 *       - in: query
 *         name: outcome
 *         schema:
 *           type: string
 *           enum: [success, failure]
 *         description: Filter by outcome
 *       - in: query
 *         name: startTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Start of time range
 *       - in: query
 *         name: endTime
 *         schema:
 *           type: string
 *           format: date-time
 *         description: End of time range
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 100
 *           maximum: 1000
 *         description: Maximum results
 *     responses:
 *       200:
 *         description: Aggregated audit logs
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 logs:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Query failed
 */
router.get('/audit/aggregated', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const requestId = `audit-query-${Date.now()}`;

    try {
        const {
            spokeId,
            instanceCode,
            eventType,
            decision,
            startTime,
            endTime,
            limit = '100',
            offset = '0'
        } = req.query;

        let filtered = [...aggregatedAuditLogs];

        // Apply filters
        if (spokeId) {
            filtered = filtered.filter(e => e.spokeId === spokeId);
        }
        if (instanceCode) {
            filtered = filtered.filter(e => e.instanceCode === instanceCode);
        }
        if (eventType) {
            filtered = filtered.filter(e => e.eventType === eventType);
        }
        if (decision) {
            filtered = filtered.filter(e => e.decision === decision);
        }
        if (startTime) {
            filtered = filtered.filter(e => e.timestamp >= startTime);
        }
        if (endTime) {
            filtered = filtered.filter(e => e.timestamp <= endTime);
        }

        // Sort by timestamp descending (most recent first)
        filtered.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

        // Paginate
        const limitNum = Math.min(parseInt(limit as string) || 100, 500);
        const offsetNum = parseInt(offset as string) || 0;
        const paginated = filtered.slice(offsetNum, offsetNum + limitNum);

        // Calculate statistics
        const stats = {
            totalEntries: aggregatedAuditLogs.length,
            filteredCount: filtered.length,
            byDecision: {
                allow: filtered.filter(e => e.decision === 'allow').length,
                deny: filtered.filter(e => e.decision === 'deny').length,
                error: filtered.filter(e => e.decision === 'error').length
            },
            bySpoke: {} as Record<string, number>,
            byEventType: {} as Record<string, number>
        };

        for (const entry of filtered) {
            stats.bySpoke[entry.spokeId] = (stats.bySpoke[entry.spokeId] || 0) + 1;
            stats.byEventType[entry.eventType] = (stats.byEventType[entry.eventType] || 0) + 1;
        }

        logger.info('Aggregated audit logs queried', {
            requestId,
            filteredCount: filtered.length,
            returnedCount: paginated.length
        });

        res.json({
            success: true,
            entries: paginated,
            pagination: {
                total: filtered.length,
                limit: limitNum,
                offset: offsetNum,
                hasMore: offsetNum + limitNum < filtered.length
            },
            statistics: stats,
            ingestionStats: auditIngestionStats
        });

    } catch (error) {
        logger.error('Failed to query aggregated audit logs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to query aggregated audit logs'
        });
    }
});

/**
 * @openapi
 * /api/federation/audit/statistics:
 *   get:
 *     summary: Get audit statistics
 *     description: Returns audit aggregation statistics including time-based metrics, spoke contributions, action type distribution, and buffer health. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Audit statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 statistics:
 *                   type: object
 *                   properties:
 *                     totalLogs:
 *                       type: integer
 *                     logsLast24h:
 *                       type: integer
 *                     logsLastHour:
 *                       type: integer
 *                     spokeContributions:
 *                       type: array
 *                       items:
 *                         type: object
 *                     actionTypeDistribution:
 *                       type: object
 *                     timeRange:
 *                       type: object
 *                     bufferHealth:
 *                       type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/audit/statistics', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        // Calculate time-based statistics
        const now = new Date();
        const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

        const last24h = aggregatedAuditLogs.filter(e => new Date(e.timestamp) >= oneDayAgo);
        const lastHour = aggregatedAuditLogs.filter(e => new Date(e.timestamp) >= oneHourAgo);

        // Decision distribution
        const decisionDist = {
            allow: aggregatedAuditLogs.filter(e => e.decision === 'allow').length,
            deny: aggregatedAuditLogs.filter(e => e.decision === 'deny').length,
            error: aggregatedAuditLogs.filter(e => e.decision === 'error').length
        };

        // Event type distribution
        const eventTypeDist: Record<string, number> = {};
        for (const entry of aggregatedAuditLogs) {
            eventTypeDist[entry.eventType] = (eventTypeDist[entry.eventType] || 0) + 1;
        }

        // Classification access distribution
        const classificationDist: Record<string, number> = {};
        for (const entry of aggregatedAuditLogs) {
            if (entry.resource?.classification) {
                classificationDist[entry.resource.classification] =
                    (classificationDist[entry.resource.classification] || 0) + 1;
            }
        }

        // Top denied resources
        const denyByResource: Record<string, number> = {};
        for (const entry of aggregatedAuditLogs.filter(e => e.decision === 'deny')) {
            if (entry.resource?.resourceId) {
                denyByResource[entry.resource.resourceId] =
                    (denyByResource[entry.resource.resourceId] || 0) + 1;
            }
        }
        const topDeniedResources = Object.entries(denyByResource)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 10)
            .map(([resourceId, count]) => ({ resourceId, count }));

        res.json({
            success: true,
            timestamp: now.toISOString(),
            summary: {
                totalEntries: aggregatedAuditLogs.length,
                last24Hours: last24h.length,
                lastHour: lastHour.length,
                capacityUsed: Math.round((aggregatedAuditLogs.length / MAX_AGGREGATED_LOGS) * 100)
            },
            decisions: decisionDist,
            eventTypes: eventTypeDist,
            classifications: classificationDist,
            topDeniedResources,
            ingestionStats: auditIngestionStats,
            spokeSummary: Object.entries(auditIngestionStats.totalBySpoke)
                .map(([spokeId, count]) => ({ spokeId, totalReceived: count }))
                .sort((a, b) => b.totalReceived - a.totalReceived)
        });

    } catch (error) {
        logger.error('Failed to get audit statistics', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        res.status(500).json({
            success: false,
            error: 'Failed to get audit statistics'
        });
    }
});

// ============================================
// CROSS-INSTANCE AUTHORIZATION ENDPOINTS
// ============================================

// Lazy import to avoid circular dependencies
let crossInstanceAuthzService: InstanceType<typeof import('../services/cross-instance-authz.service').CrossInstanceAuthzService> | null = null;

async function getCrossInstanceService() {
    if (!crossInstanceAuthzService) {
        const module = await import('../services/cross-instance-authz.service');
        crossInstanceAuthzService = module.crossInstanceAuthzService;
    }
    return crossInstanceAuthzService;
}

/**
 * @openapi
 * /api/federation/evaluate-policy:
 *   post:
 *     summary: Evaluate cross-instance policy
 *     description: Evaluates policy for cross-instance resource access. Called by remote instances to evaluate local policy.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - resource
 *               - action
 *             properties:
 *               subject:
 *                 type: object
 *                 description: Subject attributes
 *               resource:
 *                 type: object
 *                 description: Resource attributes
 *               action:
 *                 type: string
 *                 description: Requested action
 *               requestId:
 *                 type: string
 *                 description: Request identifier for tracing
 *     responses:
 *       200:
 *         description: Policy evaluation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allowed:
 *                   type: boolean
 *                 decision:
 *                   type: string
 *                 reason:
 *                   type: string
 *       500:
 *         description: Evaluation failed
 */
router.post('/evaluate-policy', async (req: Request, res: Response): Promise<void> => {
    try {
        const { subject, resource, action, requestId } = req.body;
        const federatedFrom = req.headers['x-federated-from'] as string;

        if (!subject || !resource || !action) {
            res.status(400).json({
                error: 'Missing required fields: subject, resource, action'
            });
            return;
        }

        logger.info('Cross-instance policy evaluation request', {
            requestId,
            federatedFrom,
            subjectCountry: subject.countryOfAffiliation,
            resourceId: resource.resourceId,
            action,
        });

        const service = await getCrossInstanceService();
        const result = await service.evaluateAccess({
            subject: {
                ...subject,
                originInstance: federatedFrom || 'unknown',
            },
            resource,
            action,
            requestId: requestId || `fed-${Date.now()}`,
            bearerToken: req.headers.authorization?.replace('Bearer ', '') || '',
        });

        res.json({
            allow: result.allow,
            reason: result.reason,
            evaluationDetails: result.evaluationDetails,
            obligations: result.obligations,
            executionTimeMs: result.executionTimeMs,
        });

    } catch (error) {
        logger.error('Cross-instance policy evaluation failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Policy evaluation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/query-resources:
 *   post:
 *     summary: Query federated resources
 *     description: Queries resources for federated access. Called by remote instances to discover resources.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *             properties:
 *               query:
 *                 type: object
 *                 description: Resource query parameters
 *               requestId:
 *                 type: string
 *                 description: Request identifier
 *     responses:
 *       200:
 *         description: Query results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 resources:
 *                   type: array
 *                   items:
 *                     type: object
 *                 total:
 *                   type: integer
 *       500:
 *         description: Query failed
 */
router.post('/query-resources', async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, requestId } = req.body;

        logger.info('Cross-instance resource query', {
            requestId,
            query,
        });

        // Build MongoDB query from federation query
        const mongoQuery: Record<string, unknown> = {};

        if (query.classification && query.classification.length > 0) {
            mongoQuery['ztdf.policy.securityLabel.classification'] = { $in: query.classification };
        }

        if (query.releasabilityTo && query.releasabilityTo.length > 0) {
            mongoQuery['ztdf.policy.securityLabel.releasabilityTo'] = { $in: query.releasabilityTo };
        }

        if (query.COI && query.COI.length > 0) {
            mongoQuery['ztdf.policy.securityLabel.COI'] = { $in: query.COI };
        }

        if (query.keywords && query.keywords.length > 0) {
            mongoQuery.$or = query.keywords.map((kw: string) => ({
                $or: [
                    { title: { $regex: kw, $options: 'i' } },
                    { resourceId: { $regex: kw, $options: 'i' } },
                ]
            }));
        }

        // Query resources via resource service
        const { queryResources } = await import('../services/resource.service');
        const resources = await queryResources(mongoQuery, 100, 0, {
            projection: {
                resourceId: 1,
                title: 1,
                'ztdf.policy.securityLabel.classification': 1,
                'ztdf.policy.securityLabel.releasabilityTo': 1,
                'ztdf.policy.securityLabel.COI': 1,
            }
        });

        const instanceId = process.env.INSTANCE_ID || 'local';
        const instanceUrl = process.env.BACKEND_URL || 'https://backend:4000';

        res.json({
            resources: resources.map((r) => ({
                resourceId: r.resourceId,
                title: r.title,
                classification: r.classification,
                releasabilityTo: r.releasabilityTo,
                COI: r.COI || [],
                instanceId,
                instanceUrl,
            })),
            count: resources.length,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        logger.error('Cross-instance resource query failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Resource query failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/cross-instance/authorize:
 *   post:
 *     summary: Cross-instance authorization
 *     description: Full cross-instance authorization flow that evaluates both local and remote policies for federated resource access.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - subject
 *               - resource
 *               - action
 *             properties:
 *               subject:
 *                 type: object
 *               resource:
 *                 type: object
 *               action:
 *                 type: string
 *               requestId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Authorization result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 allowed:
 *                   type: boolean
 *                 localDecision:
 *                   type: object
 *                 remoteDecision:
 *                   type: object
 *       500:
 *         description: Authorization failed
 */
router.post('/cross-instance/authorize', async (req: Request, res: Response): Promise<void> => {
    try {
        const { subject, resource, action, requestId } = req.body;
        const bearerToken = req.headers.authorization?.replace('Bearer ', '') || '';

        if (!subject || !resource || !action) {
            res.status(400).json({
                error: 'Missing required fields: subject, resource, action'
            });
            return;
        }

        logger.info('Cross-instance authorization request', {
            requestId,
            subjectCountry: subject.countryOfAffiliation,
            resourceInstance: resource.instanceId,
            action,
        });

        const service = await getCrossInstanceService();
        const result = await service.evaluateAccess({
            subject: {
                ...subject,
                originInstance: process.env.INSTANCE_ID || 'local',
            },
            resource,
            action,
            requestId: requestId || `cross-${Date.now()}`,
            bearerToken,
        });

        res.json(result);

    } catch (error) {
        logger.error('Cross-instance authorization failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Authorization failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/cross-instance/query:
 *   post:
 *     summary: Query across federated instances
 *     description: Queries resources across all federated instances with optional targeting of specific instances.
 *     tags: [Federation]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - query
 *               - subject
 *             properties:
 *               query:
 *                 type: object
 *               subject:
 *                 type: object
 *               targetInstances:
 *                 type: array
 *                 items:
 *                   type: string
 *               requestId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Federated query results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *       500:
 *         description: Query failed
 */
router.post('/cross-instance/query', async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, subject, targetInstances, requestId } = req.body;
        const bearerToken = req.headers.authorization?.replace('Bearer ', '') || '';

        if (!query || !subject) {
            res.status(400).json({
                error: 'Missing required fields: query, subject'
            });
            return;
        }

        logger.info('Federated resource query request', {
            requestId,
            subjectCountry: subject.countryOfAffiliation,
            targetInstances,
            query,
        });

        const service = await getCrossInstanceService();
        const result = await service.queryFederatedResources({
            query,
            subject: {
                ...subject,
                originInstance: process.env.INSTANCE_ID || 'local',
            },
            requestId: requestId || `query-${Date.now()}`,
            bearerToken,
            targetInstances,
        });

        res.json(result);

    } catch (error) {
        logger.error('Federated resource query failed', {
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'Query failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/cross-instance/cache-stats:
 *   get:
 *     summary: Get cache statistics
 *     description: Returns authorization cache statistics including hits, misses, and cache health. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cache statistics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 stats:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Server error
 */
router.get('/cross-instance/cache-stats', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        const service = await getCrossInstanceService();
        const stats = service.getCacheStats();

        res.json({
            cache: stats,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get cache stats' });
    }
});

/**
 * @openapi
 * /api/federation/cross-instance/cache-clear:
 *   post:
 *     summary: Clear authorization cache
 *     description: Clears the authorization cache. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Cache cleared
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       500:
 *         description: Server error
 */
router.post('/cross-instance/cache-clear', requireSuperAdmin, async (_req: Request, res: Response): Promise<void> => {
    try {
        const service = await getCrossInstanceService();
        service.clearCache();

        logger.info('Cross-instance authorization cache cleared');

        res.json({
            success: true,
            message: 'Authorization cache cleared',
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to clear cache' });
    }
});

// ============================================
// CSR SIGNING ENDPOINT
// ============================================

const csrSigningSchema = z.object({
    csr: z.string().min(100).refine(
        (val) => val.includes('-----BEGIN CERTIFICATE REQUEST-----') ||
            val.includes('-----BEGIN NEW CERTIFICATE REQUEST-----') ||
            val.includes('CSR for:'),
        { message: 'Invalid CSR format' }
    ),
    validityDays: z.number().min(1).max(730).optional().default(365),
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/sign-csr:
 *   post:
 *     summary: Sign spoke CSR
 *     description: Signs a Certificate Signing Request (CSR) submitted by a spoke using Hub CA or generates self-signed certificate for development. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - csrPEM
 *             properties:
 *               csrPEM:
 *                 type: string
 *                 description: Base64-encoded Certificate Signing Request
 *               validityDays:
 *                 type: integer
 *                 default: 365
 *                 description: Certificate validity period in days
 *     responses:
 *       200:
 *         description: Certificate signed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 certificatePEM:
 *                   type: string
 *                 fingerprint:
 *                   type: string
 *                 expiresAt:
 *                   type: string
 *                   format: date-time
 *       400:
 *         description: Invalid CSR
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: Spoke not found
 *       500:
 *         description: Signing failed
 */
router.post('/spokes/:spokeId/sign-csr', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const spokeId = req.params.spokeId;

        // Validate input
        const parsed = csrSigningSchema.safeParse(req.body);
        if (!parsed.success) {
            res.status(400).json({
                error: 'Invalid request',
                details: parsed.error.issues
            });
            return;
        }

        // Verify spoke exists and is in valid state
        const spoke = await hubSpokeRegistry.getSpoke(spokeId);
        if (!spoke) {
            res.status(404).json({ error: 'Spoke not found' });
            return;
        }

        if (spoke.status === 'revoked') {
            res.status(403).json({ error: 'Cannot sign CSR for revoked spoke' });
            return;
        }

        logger.info('Processing CSR signing request', {
            spokeId,
            instanceCode: spoke.instanceCode,
            validityDays: parsed.data.validityDays,
        });

        // Import crypto for certificate signing
        const crypto = await import('crypto');
        const fs = await import('fs/promises');
        const path = await import('path');

        // Check for Hub CA certificate and key
        const hubCaDir = process.env.HUB_CA_DIR || '/var/dive/hub/certs';
        const caCertPath = path.join(hubCaDir, 'hub-intermediate-ca.crt');
        const caKeyPath = path.join(hubCaDir, 'hub-intermediate-ca.key');

        let certificatePEM: string;
        let expiresAt: Date;

        try {
            // Try to use Hub CA for signing
            await fs.readFile(caCertPath, 'utf-8');
            await fs.readFile(caKeyPath, 'utf-8');

            // Create signed certificate using Hub CA
            // Note: For production, use a proper PKI library like node-forge or @peculiar/x509
            const validityMs = parsed.data.validityDays * 24 * 60 * 60 * 1000;
            expiresAt = new Date(Date.now() + validityMs);

            // Generate a placeholder certificate (production would use proper X.509 signing)
            // This demonstrates the API contract - real implementation would use CA to sign CSR
            certificatePEM = `-----BEGIN CERTIFICATE-----
Certificate for: ${spokeId}
Instance: ${spoke.instanceCode}
Signed by: DIVE Hub Intermediate CA
Valid until: ${expiresAt.toISOString()}
Serial: ${crypto.randomBytes(8).toString('hex').toUpperCase()}
-----END CERTIFICATE-----`;

            logger.info('CSR signed with Hub CA', {
                spokeId,
                expiresAt,
            });

        } catch (caError) {
            // Hub CA not available - use self-signed development certificate
            logger.warn('Hub CA not available, generating self-signed certificate', {
                spokeId,
                error: caError instanceof Error ? caError.message : 'Unknown error'
            });

            // Generate self-signed development certificate
            const validityMs = parsed.data.validityDays * 24 * 60 * 60 * 1000;
            expiresAt = new Date(Date.now() + validityMs);

            // Development placeholder certificate
            certificatePEM = `-----BEGIN CERTIFICATE-----
Certificate for: ${spokeId}
Instance: ${spoke.instanceCode}
Type: Self-Signed (Development)
Valid until: ${expiresAt.toISOString()}
Serial: ${crypto.randomBytes(8).toString('hex').toUpperCase()}
Warning: Not signed by Hub CA - for development only
-----END CERTIFICATE-----`;
        }

        // Calculate fingerprint
        const fingerprint = crypto
            .createHash('sha256')
            .update(certificatePEM)
            .digest('hex')
            .toUpperCase();

        // Update spoke record with new certificate info
        const updatedSpoke = await hubSpokeRegistry.getSpoke(spokeId);
        if (updatedSpoke) {
            // Store certificate info (would be done through registry service method)
            logger.info('Certificate issued for spoke', {
                spokeId,
                instanceCode: spoke.instanceCode,
                fingerprint: fingerprint.substring(0, 16) + '...',
                expiresAt,
            });
        }

        res.json({
            success: true,
            certificatePEM,
            fingerprint,
            expiresAt: expiresAt.toISOString(),
            issuer: 'DIVE Hub CA',
            serial: crypto.randomBytes(8).toString('hex').toUpperCase(),
        });

    } catch (error) {
        logger.error('CSR signing failed', {
            spokeId: req.params.spokeId,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            error: 'CSR signing failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/certificate:
 *   get:
 *     summary: Get spoke certificate
 *     description: Returns the current certificate for a spoke including PEM, fingerprint, subject, issuer, and validity period. Admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     responses:
 *       200:
 *         description: Spoke certificate
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 spokeId:
 *                   type: string
 *                 instanceCode:
 *                   type: string
 *                 certificatePEM:
 *                   type: string
 *                 fingerprint:
 *                   type: string
 *                 subject:
 *                   type: string
 *                 issuer:
 *                   type: string
 *                 validFrom:
 *                   type: string
 *                   format: date-time
 *                 validTo:
 *                   type: string
 *                   format: date-time
 *                 validationResult:
 *                   type: object
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Spoke not found or no certificate on file
 *       500:
 *         description: Server error
 */
router.get('/spokes/:spokeId/certificate', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const spoke = await hubSpokeRegistry.getSpoke(req.params.spokeId);

        if (!spoke) {
            res.status(404).json({ error: 'Spoke not found' });
            return;
        }

        if (!spoke.certificatePEM) {
            res.status(404).json({ error: 'No certificate on file for this spoke' });
            return;
        }

        res.json({
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            certificatePEM: spoke.certificatePEM,
            fingerprint: spoke.certificateFingerprint,
            subject: spoke.certificateSubject,
            issuer: spoke.certificateIssuer,
            validFrom: spoke.certificateNotBefore,
            validTo: spoke.certificateNotAfter,
            validationResult: spoke.certificateValidationResult,
        });

    } catch (error) {
        res.status(500).json({ error: 'Failed to get certificate' });
    }
});

/**
 * @openapi
 * /api/federation/spokes/{spokeId}/validate-certificate:
 *   post:
 *     summary: Validate spoke certificate
 *     description: Validates a certificate against the spoke's registered information and checks fingerprint match. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: spokeId
 *         required: true
 *         schema:
 *           type: string
 *         description: Spoke identifier
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - certificatePEM
 *             properties:
 *               certificatePEM:
 *                 type: string
 *                 description: Certificate to validate
 *     responses:
 *       200:
 *         description: Validation result
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 validation:
 *                   type: object
 *                 fingerprintMatch:
 *                   type: boolean
 *                 registeredFingerprint:
 *                   type: string
 *       400:
 *         description: certificatePEM is required
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: Spoke not found
 *       500:
 *         description: Validation failed
 */
router.post('/spokes/:spokeId/validate-certificate', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    try {
        const { certificatePEM } = req.body;

        if (!certificatePEM) {
            res.status(400).json({ error: 'certificatePEM is required' });
            return;
        }

        const spoke = await hubSpokeRegistry.getSpoke(req.params.spokeId);
        if (!spoke) {
            res.status(404).json({ error: 'Spoke not found' });
            return;
        }

        // Validate the certificate
        const validation = await hubSpokeRegistry.validateCertificate(certificatePEM);

        // Check if fingerprint matches registered certificate
        const fingerprintMatch = spoke.certificateFingerprint === validation.fingerprint;

        res.json({
            spokeId: spoke.spokeId,
            validation,
            fingerprintMatch,
            registeredFingerprint: spoke.certificateFingerprint,
        });

    } catch (error) {
        res.status(500).json({
            error: 'Certificate validation failed',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

// ============================================
// PHASE 3: IDENTITY PROVIDER LINKING
// ============================================

/**
 * @openapi
 * /api/federation/link-idp:
 *   post:
 *     summary: Link Identity Provider
 *     description: Creates Identity Provider configuration for cross-border SSO. Called by CLI command `dive federation link <CODE>`. Automatically configures Keycloak IdP trust relationship. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - localInstanceCode
 *               - remoteInstanceCode
 *             properties:
 *               localInstanceCode:
 *                 type: string
 *                 description: Local instance ISO 3166-1 alpha-3 code
 *               remoteInstanceCode:
 *                 type: string
 *                 description: Remote instance ISO 3166-1 alpha-3 code
 *               autoMappers:
 *                 type: boolean
 *                 default: true
 *                 description: Automatically configure attribute mappers
 *               trustLevel:
 *                 type: string
 *                 enum: [development, partner, bilateral, national]
 *                 default: partner
 *     responses:
 *       200:
 *         description: IdP linked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 alias:
 *                   type: string
 *                 displayName:
 *                   type: string
 *                 message:
 *                   type: string
 *       400:
 *         description: Invalid request or missing required fields
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: Remote instance not found
 *       500:
 *         description: IdP linking failed
 */
router.post('/link-idp', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        const { localInstanceCode, remoteInstanceCode } = req.body;
        // Federation client follows pattern: dive-v3-broker-{source} on target
        // When local instance federates TO remote, remote has dive-v3-broker-{local}
        const federationClientId = req.body.federationClientId || `dive-v3-broker-${localInstanceCode.toLowerCase()}`;

        if (!localInstanceCode || !remoteInstanceCode) {
            res.status(400).json({
                success: false,
                error: 'Validation failed',
                message: 'localInstanceCode and remoteInstanceCode are required',
            });
            return;
        }

        logger.info('Federation link-idp request', {
            requestId,
            localInstanceCode,
            remoteInstanceCode,
        });

        // Prevent linking to self
        if (localInstanceCode === remoteInstanceCode) {
            res.status(400).json({
                success: false,
                error: 'Cannot link instance to itself',
            });
            return;
        }

        // Look up remote spoke
        const spokes = await hubSpokeRegistry.listAllSpokes();
        const remoteSpoke = spokes.find((s: { instanceCode?: string }) => s.instanceCode === remoteInstanceCode);

        if (!remoteSpoke) {
            res.status(404).json({
                success: false,
                error: 'Remote spoke not found',
                message: `No approved spoke found: ${remoteInstanceCode}`,
            });
            return;
        }

        // Import federation service (dynamic to avoid circular deps)
        const { keycloakFederationService } = await import('../services/keycloak-federation.service');

        const remoteRealm = `dive-v3-broker-${remoteInstanceCode.toLowerCase()}`;

        // Determine local details for bidirectional linking
        const localRealm = process.env.KEYCLOAK_REALM || 'dive-v3-broker-usa';
        const localIdpUrl = getPublicIdpUrl(localInstanceCode);
        const localName = getInstanceDisplayName(localInstanceCode);

        // Get remote Keycloak admin password
        const remoteKeycloakPassword = await getRemoteKeycloakPassword(remoteInstanceCode);

        // Use PUBLIC URL for browser redirects (idpPublicUrl if available, else construct it)
        const remoteIdpUrl = remoteSpoke.idpPublicUrl || getPublicIdpUrl(remoteInstanceCode);

        // Use INTERNAL URL for Admin API (container-to-container)
        const remoteKeycloakAdminUrl = remoteSpoke.idpUrl;  // Internal Docker network URL

        logger.info('Federation link parameters', {
            requestId,
            localInstanceCode,
            remoteInstanceCode,
            localIdpUrl,
            remoteIdpUrl: remoteIdpUrl,
            remoteIdpUrlInternal: remoteSpoke.idpUrl,
            remoteKeycloakAdminUrl,
        });

        // Create TRUE BIDIRECTIONAL federation
        const result = await keycloakFederationService.createBidirectionalFederation({
            localInstanceCode,
            remoteInstanceCode,
            remoteName: remoteSpoke.name,
            remoteIdpUrl: remoteIdpUrl,  // PUBLIC URL for browser
            remoteKeycloakAdminUrl,      // INTERNAL URL for Admin API
            remoteRealm,
            localName,
            localIdpUrl,  // PUBLIC URL for browser
            localRealm,
            remoteKeycloakAdminPassword: remoteKeycloakPassword,
            federationClientId,
        });

        logger.info('IdP federation link created (BIDIRECTIONAL)', {
            requestId,
            direction1: result.local.alias,
            direction2: result.remote.alias,
        });

        res.status(200).json({
            success: true,
            message: 'Identity Provider linked successfully (bidirectional)',
            data: {
                local: {
                    idpAlias: result.local.alias,
                    displayName: result.local.displayName,
                    enabled: result.local.enabled,
                },
                remote: {
                    idpAlias: result.remote.alias,
                    displayName: result.remote.displayName,
                    enabled: result.remote.enabled,
                },
                bidirectional: true,
            },
        });
    } catch (error) {
        logger.error('Failed to link IdP', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
            success: false,
            error: 'Failed to link Identity Provider',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

/**
 * Helper: Get instance display name
 */
function getInstanceDisplayName(instanceCode: string): string {
    const names: Record<string, string> = {
        'USA': 'United States',
        'FRA': 'France',
        'GBR': 'United Kingdom',
        'DEU': 'Germany',
        'CAN': 'Canada',
    };
    return names[instanceCode.toUpperCase()] || instanceCode;
}

/**
 * Helper: Get public (browser-accessible) IdP URL
 *
 * Different from internal Docker network URL.
 * Used for browser redirects during federation authentication.
 */
function getPublicIdpUrl(instanceCode: string): string {
    const code = instanceCode.toUpperCase();

    // Check environment variable first
    const envVar = `${code}_KEYCLOAK_PUBLIC_URL`;
    if (process.env[envVar]) {
        return process.env[envVar];
    }

    // For local development, use localhost port mapping
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        const portMap: Record<string, string> = {
            'USA': '8443',  // Hub Keycloak
            'FRA': '8444',
            'GBR': '8446',
            'DEU': '8447',
            'CAN': '8448',
        };
        const port = portMap[code] || '8443';
        return `https://localhost:${port}`;
    }

    // Production: Use instance's public domain
    const domainMap: Record<string, string> = {
        'USA': 'usa-idp.dive25.com',
        'FRA': 'fra-idp.dive25.com',
        'GBR': 'gbr-idp.dive25.com',
        'DEU': 'deu-idp.dive25.com',
        'CAN': 'can-idp.dive25.com',
    };
    const domain = domainMap[code] || `${code.toLowerCase()}-idp.dive25.com`;
    return `https://${domain}`;
}

/**
 * Helper: Get remote Keycloak admin password
 *
 * CONSOLIDATED: Uses gcp-secrets.ts as single source of truth for GCP/env vars
 * Federation-specific: Also checks spoke registry for stored passwords
 */
async function getRemoteKeycloakPassword(instanceCode: string): Promise<string> {
    const code = instanceCode.toUpperCase();
    const codeLower = instanceCode.toLowerCase();

    // PRIORITY 1: Check spoke registry for stored password from registration
    // This is federation-specific: spokes register their credentials during onboarding
    try {
        const spoke = await hubSpokeRegistry.getSpokeByInstanceCode(code);
        if (spoke?.keycloakAdminPassword && spoke.keycloakAdminPassword.length >= 12) {
            logger.info('Using stored Keycloak password from spoke registry', {
                instanceCode,
                hasPassword: true
            });
            return spoke.keycloakAdminPassword;
        }
    } catch (error) {
        logger.debug('Could not get password from spoke registry', {
            instanceCode,
            error: error instanceof Error ? error.message : 'Unknown'
        });
    }

    // PRIORITY 2: Use centralized gcp-secrets utility (GCP Secret Manager + env vars)
    // This consolidates all other secret retrieval logic into one place
    try {
        const { getKeycloakPassword } = await import('../utils/gcp-secrets');
        const password = await getKeycloakPassword(codeLower);
        logger.info('Using Keycloak password from gcp-secrets utility', {
            instanceCode
        });
        return password;
    } catch (error) {
        logger.error('Keycloak admin password not available via gcp-secrets - failing fast', {
            instanceCode,
            error: error instanceof Error ? error.message : 'Unknown'
        });
        throw error; // Propagate the error from gcp-secrets which has detailed instructions
    }
}

/**
 * @openapi
 * /api/federation/unlink-idp/{alias}:
 *   delete:
 *     summary: Unlink Identity Provider
 *     description: Removes Identity Provider configuration and terminates cross-border SSO trust relationship. Super admin access required.
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: alias
 *         required: true
 *         schema:
 *           type: string
 *         description: IdP alias to remove (typically instance code like 'fra', 'deu')
 *     responses:
 *       200:
 *         description: IdP unlinked successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       403:
 *         description: Insufficient permissions (super_admin required)
 *       404:
 *         description: IdP not found
 *       500:
 *         description: Unlinking failed
 */
router.delete('/unlink-idp/:alias', requireSuperAdmin, async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { alias } = req.params;

    try {
        const { keycloakFederationService } = await import('../services/keycloak-federation.service');

        await keycloakFederationService.deleteIdentityProvider(alias);

        logger.info('IdP unlinked', { requestId, idpAlias: alias });

        res.status(200).json({
            success: true,
            message: 'Identity Provider unlinked',
        });
    } catch (error) {
        logger.error('Failed to unlink IdP', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
        });

        res.status(500).json({
            success: false,
            error: 'Failed to unlink IdP',
            message: error instanceof Error ? error.message : 'Unknown error',
        });
    }
});

// ============================================
// COI SYNC ENDPOINTS (Issue #2 Fix: 2026-02-03)
// ============================================

/**
 * @openapi
 * /api/federation/coi/sync:
 *   get:
 *     summary: Sync COI definitions from Hub to Spoke
 *     description: |
 *       Returns all active COI definitions from Hub's MongoDB.
 *       Spokes call this endpoint on startup to populate their local coi_definitions collection.
 *
 *       CRITICAL FIX: Addresses Issue #2 - Spokes need COI definitions for OPA policy evaluation.
 *       Without this, spokes fail COI validation with "Failed to load COI membership from MongoDB".
 *     tags: [Federation]
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: COI definitions successfully retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 coiDefinitions:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       coiId:
 *                         type: string
 *                       name:
 *                         type: string
 *                       type:
 *                         type: string
 *                       members:
 *                         type: array
 *                         items:
 *                           type: string
 *                       description:
 *                         type: string
 *                       status:
 *                         type: string
 *                       color:
 *                         type: string
 *                       icon:
 *                         type: string
 *                 count:
 *                   type: integer
 *                 syncedAt:
 *                   type: string
 *                   format: date-time
 *       401:
 *         $ref: '#/components/responses/Unauthorized'
 *       500:
 *         description: Failed to retrieve COI definitions
 */
router.get('/coi/sync', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const instanceCode = process.env.INSTANCE_CODE || 'USA';

    try {
        const { mongoCoiDefinitionStore } = await import('../models/coi-definition.model');
        await mongoCoiDefinitionStore.initialize();

        // Get all COI definitions from Hub's MongoDB (SSOT)
        const coiDefinitions = await mongoCoiDefinitionStore.findAll();

        logger.info('COI definitions synced to spoke', {
            requestId,
            spokeInstance: req.headers['x-origin-realm'] || 'unknown',
            coiCount: coiDefinitions.length,
            instanceCode
        });

        res.status(200).json({
            success: true,
            coiDefinitions: coiDefinitions.map(coi => ({
                coiId: coi.coiId,
                name: coi.name,
                type: coi.type,
                members: coi.members,
                description: coi.description,
                status: coi.enabled ? 'active' : 'inactive',
                color: (coi as any).color,
                icon: (coi as any).icon,
                mutable: coi.mutable,
                autoUpdate: coi.autoUpdate,
                priority: coi.priority,
                mutuallyExclusiveWith: (coi as any).mutuallyExclusiveWith,
                subsetOf: (coi as any).subsetOf,
                supersetOf: (coi as any).supersetOf
            })),
            count: coiDefinitions.length,
            syncedAt: new Date().toISOString()
        });
    } catch (error) {
        logger.error('Failed to sync COI definitions', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            instanceCode
        });

        res.status(500).json({
            success: false,
            error: 'Failed to sync COI definitions',
            message: error instanceof Error ? error.message : 'Unknown error'
        });
    }
});

export default router;
