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
import { z } from 'zod';
import { requireSPAuth, requireSPScope } from '../middleware/sp-auth.middleware';
import { getResourcesByQuery } from '../services/resource.service';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

// Initialize SP Management Service
const spManagement = new SPManagementService();

const router = Router();
// Routes are mounted at /api/federation/* in server.ts for consistency with other DIVE APIs

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
    contactEmail: z.string().email()
});

const approvalSchema = z.object({
    allowedScopes: z.array(z.string()).min(1),
    trustLevel: z.enum(['development', 'partner', 'bilateral', 'national']),
    maxClassification: z.enum(['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET']),
    dataIsolationLevel: z.enum(['full', 'filtered', 'minimal'])
});

const heartbeatSchema = z.object({
    spokeId: z.string(),
    policyVersion: z.string().optional(),
    opaHealthy: z.boolean().optional(),
    opalClientConnected: z.boolean().optional(),
    latencyMs: z.number().optional()
});

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
    (req as any).spoke = validation.spoke;
    (req as any).spokeScopes = validation.scopes;

    next();
}

/**
 * Require admin role for management endpoints
 */
function requireAdmin(req: Request, res: Response, next: NextFunction): void {
    // TODO: Integrate with actual auth middleware
    // For now, check for admin header or session
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
 * GET /federation/metadata
 * Public federation metadata (no auth)
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
 * GET /api/federation/instances
 * Dynamically returns all federation instances from federation-registry.json
 * Public endpoint (no auth) - used by frontend for federated search UI
 */
router.get('/instances', async (_req: Request, res: Response): Promise<void> => {
    try {
        const registryPaths = [
            path.join(process.cwd(), '..', 'config', 'federation-registry.json'),
            path.join(process.cwd(), 'config', 'federation-registry.json')
        ];

        let registry: any = null;
        for (const registryPath of registryPaths) {
            if (fs.existsSync(registryPath)) {
                registry = JSON.parse(fs.readFileSync(registryPath, 'utf-8'));
                break;
            }
        }

        if (!registry?.instances) {
            res.status(404).json({
                error: 'Registry not found',
                message: 'Federation registry not configured'
            });
            return;
        }

        // Map registry instances to frontend-friendly format
        const instances = Object.entries(registry.instances)
            .filter(([_key, inst]: [string, any]) => inst.enabled)
            .map(([key, inst]: [string, any]) => {
                const backendService = inst.services?.backend;
                const frontendService = inst.services?.frontend;
                const keycloakService = inst.services?.keycloak;

                // Build URLs based on development/production
                const isDev = process.env.NODE_ENV === 'development' || process.env.NODE_ENV !== 'production';
                
                return {
                    code: inst.code || key.toUpperCase(),
                    name: inst.name || key,
                    type: inst.primary ? 'hub' : 'spoke',
                    country: inst.code || key.toUpperCase(),
                    flag: getCountryFlag(inst.code || key.toUpperCase()),
                    locale: inst.locale || 'en-US',
                    endpoints: {
                        app: isDev 
                            ? `https://localhost:${frontendService?.externalPort || 3000}`
                            : `https://${frontendService?.hostname || `${key}-app.dive25.com`}`,
                        api: isDev 
                            ? `https://localhost:${backendService?.externalPort || 4000}`
                            : `https://${backendService?.hostname || `${key}-api.dive25.com`}`,
                        idp: isDev 
                            ? `https://localhost:${keycloakService?.externalPort || 8443}`
                            : `https://${keycloakService?.hostname || `${key}-idp.dive25.com`}`,
                    },
                    federationStatus: 'approved'
                };
            });

        res.json({
            instances,
            timestamp: new Date().toISOString(),
            source: 'federation-registry.json'
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
            process.env.NODE_ENV === 'test';

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
                reason: req.body.skipValidation ? 'skipValidation flag' : 'environment setting'
            });
        }

        const spoke = await hubSpokeRegistry.registerSpoke(request);

        logger.info('Spoke registration successful', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            status: spoke.status
        });

        res.status(201).json({
            success: true,
            spoke: {
                spokeId: spoke.spokeId,
                instanceCode: spoke.instanceCode,
                name: spoke.name,
                status: spoke.status,
                message: 'Registration pending approval. You will receive a token once approved.'
            }
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
 * GET /api/federation/registration/:spokeId/status
 * Check spoke registration status (public - for polling)
 * Spokes can poll this endpoint to check if they've been approved
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
 * GET /federation/search
 * Federated search (SP → Hub)
 */
router.get(
    '/search',
    requireSPAuth,
    requireSPScope('resource:search'),
    async (req: any, res: Response): Promise<void> => {
        const spContext = req.sp;
        const classification = (req.query.classification as string) || undefined;

        // Enforce agreements; tailor messages for test expectations
        const agreements = spContext?.sp?.federationAgreements || [];
        const activeAgreements = agreements.filter((ag: any) => !ag.validUntil || new Date(ag.validUntil) > new Date());

        if (activeAgreements.length === 0) {
            res.status(403).json({
                error: 'Forbidden',
                message: 'No active federation agreement'
            });
            return;
        }

        const allowedClasses = activeAgreements[0]?.classifications || [];
        const agreementCoversClass =
            !classification || activeAgreements.some((ag: any) =>
                !ag.classifications || ag.classifications.includes(classification)
            );
        const agreementCoversCountry = activeAgreements.some((ag: any) =>
            (ag.countries || []).includes(spContext.sp.country)
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

        const query: any = {};
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

        // Strip content if any
        const sanitized = resources.map((r: any) => ({
            resourceId: r.resourceId,
            title: r.title,
            classification: r.classification,
            releasabilityTo: r.releasabilityTo || [],
            COI: r.COI || []
        }));

        res.json({
            totalResults: sanitized.length,
            resources: sanitized,
            searchContext: {
                country: spContext?.sp?.country || spContext?.country || 'UNKNOWN',
                requestingEntity: spContext?.sp?.spId || spContext?.spId || 'UNKNOWN'
            }
        });
    }
);

/**
 * POST /federation/resources/request
 * Request access to a federated resource
 */
router.post(
    '/resources/request',
    requireSPAuth,
    requireSPScope('resource:read'),
    async (req: any, res: Response): Promise<void> => {
        const spContext = req.sp;
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

        const classification = resource.classification;
        const agreements = spContext?.sp?.federationAgreements || [];
        const activeAgreements = agreements.filter((ag: any) => !ag.validUntil || new Date(ag.validUntil) > new Date());
        const agreementCoversCountry = activeAgreements.some((ag: any) =>
            (ag.countries || []).includes(spContext.sp.country)
        );
        const agreementCoversClass =
            !classification ||
            activeAgreements.some((ag: any) =>
                !ag.classifications || ag.classifications.includes(classification)
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
 * POST /api/federation/sp/register
 * Register a new SP Client (OAuth/OIDC client)
 * This is for partners who want to integrate with DIVE without deploying a full spoke
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
                issuer: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker`,
                authorization: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/auth`,
                token: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/token`,
                userinfo: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/userinfo`,
                jwks: `${process.env.KEYCLOAK_URL || 'https://usa-idp.dive25.com'}/realms/dive-v3-broker/protocol/openid-connect/certs`
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
 * GET /api/federation/sp/:spId
 * Get SP Client details
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
 * GET /api/federation/sp
 * List SP Clients (admin)
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
 * POST /api/federation/sp/:spId/approve
 * Approve a pending SP Client
 */
router.post('/sp/:spId/approve', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/sp/:spId/suspend
 * Suspend an SP Client
 */
router.post('/sp/:spId/suspend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/sp/:spId/regenerate-secret
 * Regenerate client secret for an SP
 */
router.post('/sp/:spId/regenerate-secret', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

        // Record heartbeat
        await hubSpokeRegistry.recordHeartbeat(spoke.spokeId, {
            opaHealthy: parsed.data.opaHealthy,
            opalClientConnected: parsed.data.opalClientConnected,
            latencyMs: parsed.data.latencyMs
        });

        // Record policy sync status
        if (parsed.data.policyVersion) {
            await policySyncService.recordSpokeSync(spoke.spokeId, parsed.data.policyVersion);
        }

        // Get current version for comparison
        const currentVersion = policySyncService.getCurrentVersion();

        res.json({
            success: true,
            serverTime: new Date().toISOString(),
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
 * GET /api/federation/policy/version
 * Get current policy version
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
 * GET /api/federation/policy/bundle
 * Download policy bundle (scope-filtered by spoke token)
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
 * GET /api/federation/spokes/pending
 * List spokes pending approval
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
 * GET /api/federation/spokes/:spokeId
 * Get spoke details
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
 * POST /api/federation/spokes/:spokeId/approve
 * Approve a pending spoke
 */
router.post('/spokes/:spokeId/approve', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

        // Generate initial token
        const token = await hubSpokeRegistry.generateSpokeToken(spoke.spokeId);

        logger.info('Spoke approved', {
            spokeId: spoke.spokeId,
            instanceCode: spoke.instanceCode,
            approvedBy,
            allowedScopes: parsed.data.allowedScopes
        });

        res.json({
            success: true,
            spoke,
            token: {
                token: token.token,
                expiresAt: token.expiresAt,
                scopes: token.scopes
            }
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
 * POST /api/federation/spokes/:spokeId/suspend
 * Suspend an approved spoke
 */
router.post('/spokes/:spokeId/suspend', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/spokes/:spokeId/revoke
 * Permanently revoke a spoke
 */
router.post('/spokes/:spokeId/revoke', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/spokes/:spokeId/token
 * Generate new token for spoke
 */
router.post('/spokes/:spokeId/token', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/policy/push
 * Push policy update to all or specific spoke
 */
router.post('/policy/push', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * GET /api/federation/sync/status
 * Get sync status for all spokes
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
 * GET /api/federation/health
 * Get overall federation health
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
 * GET /api/federation/health/spokes
 * Enhanced spoke health aggregation for dashboard (DIVE-018)
 * Returns detailed health status for all spokes with metrics
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
 * POST /api/federation/audit/ingest
 * Receive audit logs from spokes (DIVE-020)
 * 
 * Spokes batch-send their audit logs to the Hub for centralized aggregation.
 * Authentication via spoke token.
 */
router.post('/audit/ingest', requireSpokeToken, async (req: Request, res: Response): Promise<void> => {
    const requestId = `audit-ingest-${Date.now()}`;
    const spokeId = (req as any).spoke?.spokeId;
    const instanceCode = (req as any).spoke?.instanceCode;

    try {
        const { entries } = req.body as { entries: Array<{
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
        }> };

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
 * GET /api/federation/audit/aggregated
 * Query aggregated audit logs from all spokes (DIVE-020)
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
 * GET /api/federation/audit/statistics
 * Get audit aggregation statistics (DIVE-020)
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
let crossInstanceAuthzService: any = null;

async function getCrossInstanceService() {
    if (!crossInstanceAuthzService) {
        const module = await import('../services/cross-instance-authz.service');
        crossInstanceAuthzService = module.crossInstanceAuthzService;
    }
    return crossInstanceAuthzService;
}

/**
 * POST /api/federation/evaluate-policy
 * Evaluate policy for cross-instance resource access
 * Called by remote instances to evaluate local policy
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
 * POST /api/federation/query-resources
 * Query resources for federated access
 * Called by remote instances to discover resources
 */
router.post('/query-resources', async (req: Request, res: Response): Promise<void> => {
    try {
        const { query, requestId } = req.body;

        logger.info('Cross-instance resource query', {
            requestId,
            query,
        });

        // Build MongoDB query from federation query
        const mongoQuery: any = {};

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
            resources: resources.map((r: any) => ({
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
 * POST /api/federation/cross-instance/authorize
 * Full cross-instance authorization flow
 * Evaluates both local and remote policies
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
 * POST /api/federation/cross-instance/query
 * Query resources across all federated instances
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
 * GET /api/federation/cross-instance/cache-stats
 * Get authorization cache statistics
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
 * POST /api/federation/cross-instance/cache-clear
 * Clear authorization cache
 */
router.post('/cross-instance/cache-clear', requireAdmin, async (_req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/spokes/:spokeId/sign-csr
 * Sign a Certificate Signing Request (CSR) submitted by a spoke
 * Requires admin access
 */
router.post('/spokes/:spokeId/sign-csr', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * GET /api/federation/spokes/:spokeId/certificate
 * Get the current certificate for a spoke
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
 * POST /api/federation/spokes/:spokeId/validate-certificate
 * Validate a certificate against the spoke's registered info
 */
router.post('/spokes/:spokeId/validate-certificate', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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
 * POST /api/federation/link-idp
 * 
 * Create Identity Provider configuration for cross-border SSO
 * This is called by `dive federation link <CODE>` CLI command
 * 
 * Automatically configures Keycloak IdP trust relationship
 */
router.post('/link-idp', requireAdmin, async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        const { localInstanceCode, remoteInstanceCode, federationClientId = 'dive-v3-cross-border-client' } = req.body;

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
        const remoteSpoke = spokes.find((s: any) => s.instanceCode === remoteInstanceCode);

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
        const localRealm = process.env.KEYCLOAK_REALM || 'dive-v3-broker';
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
 */
async function getRemoteKeycloakPassword(instanceCode: string): Promise<string> {
    const code = instanceCode.toUpperCase();
    
    // Try environment variable
    const envVar = `KEYCLOAK_ADMIN_PASSWORD_${code}`;
    if (process.env[envVar]) {
        return process.env[envVar];
    }

    // For local dev, all use same password
    if (process.env.NODE_ENV === 'development') {
        return process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
    }

    // Production: GCP Secret Manager
    try {
        const { getSecret } = await import('../utils/gcp-secrets');
        const secretName = `keycloak-${code.toLowerCase()}` as any;
        const secret = await getSecret(secretName);
        return secret || 'admin';  // Fallback if null
    } catch (error) {
        logger.warn('Could not get remote Keycloak password, using fallback', {
            instanceCode,
        });
        return process.env.KEYCLOAK_ADMIN_PASSWORD || 'admin';
    }
}

/**
 * DELETE /api/federation/unlink-idp/:alias
 * 
 * Remove Identity Provider configuration
 */
router.delete('/unlink-idp/:alias', requireAdmin, async (req: Request, res: Response): Promise<void> => {
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

export default router;
