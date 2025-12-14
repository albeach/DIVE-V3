/**
 * Public Routes
 * 
 * Unauthenticated endpoints for public-facing features
 * 
 * Routes:
 * - GET /api/idps/public - List enabled IdPs for login page
 * - POST /api/public/sp-registration - Self-service SP registration (Phase 4)
 */

import { Router, Request, Response } from 'express';
import { keycloakAdminService } from '../services/keycloak-admin.service';
import { logger } from '../utils/logger';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

/**
 * GET /api/idps/public
 * Public endpoint to list enabled Identity Providers for login page
 * No authentication required - this is for unauthenticated users selecting their IdP
 * 
 * UX Enhancement: Filters out self-referential IdP (don't show "USA" on USA Hub)
 */
router.get('/idps/public', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Public: List enabled IdPs request', { requestId });

        // Get all IdPs from Keycloak
        const result = await keycloakAdminService.listIdentityProviders();

        // Get current instance code (USA, FRA, GBR, etc.)
        const currentInstance = (process.env.INSTANCE_CODE || 'USA').toUpperCase();
        const selfIdpAlias = `${currentInstance.toLowerCase()}-idp`;

        // Filter to only enabled IdPs AND exclude self-referential IdP
        // Don't show "United States" on USA Hub - that's confusing!
        const enabledIdps = result.idps.filter(idp => 
            idp.enabled && idp.alias !== selfIdpAlias
        );

        logger.info('Public: Returning enabled IdPs (excluding self)', {
            requestId,
            total: result.total,
            enabled: enabledIdps.length,
            filtered: `Excluded ${selfIdpAlias}`
        });

        res.status(200).json({
            success: true,
            idps: enabledIdps.map(idp => ({
                alias: idp.alias,
                displayName: idp.displayName,
                protocol: idp.protocol,
                enabled: idp.enabled
            })),
            total: enabledIdps.length
        });
    } catch (error) {
        logger.error('Failed to list public IdPs', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined,
            keycloakUrl: process.env.KEYCLOAK_URL,
            keycloakRealm: process.env.KEYCLOAK_REALM
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve identity providers',
            message: error instanceof Error ? error.message : 'Unknown error',
            idps: [], // Return empty array for graceful fallback
            total: 0
        });
    }
});

/**
 * GET /api/idps/:alias/health
 * Public endpoint to check IdP health status
 * No authentication required - used by frontend to show status indicators
 */
router.get('/idps/:alias/health', async (req: Request, res: Response): Promise<void> => {
    const { alias } = req.params;
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.debug('IdP health check', { requestId, alias });

        // Get full IdP configuration from Keycloak (including URLs)
        const idpDetails = await keycloakAdminService.getIdentityProvider(alias);
        
        if (!idpDetails) {
            // IdP not found - could be disabled or doesn't exist
            res.status(404).json({
                success: false,
                healthy: false,
                alias,
                status: 'not_found',
                message: 'Identity provider not found'
            });
            return;
        }

        const idp = idpDetails;

        if (!idp.enabled) {
            res.status(200).json({
                success: true,
                healthy: false,
                degraded: false,
                alias,
                status: 'disabled',
                message: 'Identity provider is disabled'
            });
            return;
        }

        // Try to reach the IdP's endpoint
        // Priority: discoveryEndpoint > tokenUrl (internal Docker URL) > authorizationUrl
        // The tokenUrl typically uses internal Docker hostnames (e.g., fra-keycloak-fra-1:8443)
        // while authorizationUrl uses localhost which isn't reachable from inside Docker
        const tokenUrl = idp.config?.tokenUrl;
        const discoveryEndpoint = idp.config?.discoveryEndpoint;
        
        // Build the well-known URL from internal Docker URL or discovery endpoint
        let wellKnownUrl: string | null = null;
        
        if (discoveryEndpoint) {
            wellKnownUrl = discoveryEndpoint;
        } else if (tokenUrl) {
            // Convert tokenUrl to well-known endpoint
            // tokenUrl: https://fra-keycloak-fra-1:8443/realms/.../protocol/openid-connect/token
            // wellKnown: https://fra-keycloak-fra-1:8443/realms/.../.well-known/openid-configuration
            const issuer = tokenUrl.replace(/\/protocol\/openid-connect.*$/, '');
            wellKnownUrl = `${issuer}/.well-known/openid-configuration`;
        }
        
        logger.debug('IdP health check - URLs', { 
            requestId, 
            alias, 
            tokenUrl,
            discoveryEndpoint,
            wellKnownUrl 
        });

        if (wellKnownUrl) {
            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 2000); // 2s timeout
                
                const response = await fetch(wellKnownUrl, {
                    method: 'GET',
                    signal: controller.signal,
                });
                
                clearTimeout(timeoutId);
                
                if (response.ok) {
                    res.status(200).json({
                        success: true,
                        healthy: true,
                        degraded: false,
                        alias,
                        displayName: idp.displayName,
                        status: 'online',
                        responseTime: 'fast'
                    });
                    return;
                } else {
                    res.status(200).json({
                        success: true,
                        healthy: false,
                        degraded: true,
                        alias,
                        displayName: idp.displayName,
                        status: 'degraded',
                        message: `IdP returned ${response.status}`
                    });
                    return;
                }
            } catch (fetchError) {
                // Network error or timeout
                res.status(200).json({
                    success: true,
                    healthy: false,
                    degraded: false,
                    alias,
                    displayName: idp.displayName,
                    status: 'unreachable',
                    message: 'IdP is not reachable'
                });
                return;
            }
        }

        // If we can't determine the endpoint, assume healthy if enabled
        res.status(200).json({
            success: true,
            healthy: true,
            degraded: false,
            alias,
            displayName: idp.displayName,
            status: 'assumed_online',
            message: 'IdP is enabled (health check unavailable)'
        });

    } catch (error) {
        logger.error('IdP health check failed', {
            requestId,
            alias,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            healthy: false,
            alias,
            status: 'error',
            message: 'Health check failed'
        });
    }
});

/**
 * POST /api/public/sp-registration
 * Phase 4, Task 1.2: Self-Service SP Registration Portal
 * 
 * Allows external organizations to self-register as OAuth clients.
 * Registration requires approval by SuperAdmin.
 * 
 * NATO Compliance: ACP-240 §4.5 (External Entity Registration)
 */
router.post('/public/sp-registration', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        const {
            organizationName,
            organizationType,
            country,
            website,
            contactName,
            contactEmail,
            contactPhone,
            applicationName,
            applicationDescription,
            redirectUris,
            maxClassification,
            requestedCOIs,
            requestedRateLimit,
            submittedBy
        } = req.body;

        // Validation
        if (!organizationName || !country || !applicationName || !contactEmail) {
            res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'Missing required fields: organizationName, country, applicationName, contactEmail'
            });
            return;
        }

        // Validate redirect URIs
        if (!redirectUris || redirectUris.length === 0) {
            res.status(400).json({
                success: false,
                error: 'Bad Request',
                message: 'At least one redirect URI is required'
            });
            return;
        }

        // Generate registration ID
        const registrationId = `sp-reg-${uuidv4().substring(0, 8)}`;

        // Create registration record (will be stored in MongoDB)
        const registration = {
            registrationId,
            status: 'PENDING_APPROVAL',

            // Organization details
            organization: {
                name: organizationName,
                type: organizationType || 'other',
                country,
                website: website || null
            },

            // Contact information
            contact: {
                name: contactName || null,
                email: contactEmail,
                phone: contactPhone || null
            },

            // Application details
            application: {
                name: applicationName,
                description: applicationDescription || null,
                redirectUris: redirectUris.filter((uri: string) => uri && uri.trim())
            },

            // Access requirements
            accessRequirements: {
                maxClassification: maxClassification || 'CONFIDENTIAL',
                requestedCOIs: requestedCOIs || [],
                requestedRateLimit: requestedRateLimit || 60
            },

            // Audit trail
            audit: {
                submittedBy: submittedBy || contactEmail,
                submittedAt: new Date().toISOString(),
                submittedFrom: req.ip,
                userAgent: req.headers['user-agent']
            },

            // Timeline
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };

        logger.info('SP Self-Service Registration submitted', {
            requestId,
            registrationId: registration.registrationId,
            organization: registration.organization.name,
            country: registration.organization.country,
            applicationName: registration.application.name,
            contactEmail: registration.contact.email,
            maxClassification: registration.accessRequirements.maxClassification,
            status: registration.status
        });

        // TODO: Store in MongoDB
        // const db = getMongoClient().db();
        // await db.collection('sp_registrations').insertOne(registration);

        // TODO: Send notification email to SuperAdmin
        // await sendAdminNotification({
        //     type: 'SP_REGISTRATION_PENDING',
        //     registrationId,
        //     organization: organizationName,
        //     country,
        //     contactEmail
        // });

        // TODO: Send confirmation email to applicant
        // await sendConfirmationEmail({
        //     to: contactEmail,
        //     registrationId,
        //     organization: organizationName
        // });

        res.status(201).json({
            success: true,
            message: 'Registration submitted successfully',
            registrationId,
            status: 'PENDING_APPROVAL',
            estimatedReviewTime: '1-3 business days',
            statusUrl: `/register/sp/status?id=${registrationId}`
        });

    } catch (error) {
        logger.error('SP Self-Service Registration failed', {
            requestId,
            error: error instanceof Error ? error.message : 'Unknown error',
            stack: error instanceof Error ? error.stack : undefined
        });

        res.status(500).json({
            success: false,
            error: 'Internal Server Error',
            message: 'Registration submission failed. Please try again later.'
        });
    }
});

/**
 * GET /api/public/sp-registration/:id
 * Check registration status
 */
router.get('/public/sp-registration/:id', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;
    const { id } = req.params;

    try {
        logger.info('SP Registration status check', {
            requestId,
            registrationId: id
        });

        // TODO: Fetch from MongoDB
        // const db = getMongoClient().db();
        // const registration = await db.collection('sp_registrations').findOne({ registrationId: id });

        // For now, return mock status
        res.status(200).json({
            success: true,
            registrationId: id,
            status: 'PENDING_APPROVAL',
            submittedAt: new Date().toISOString(),
            estimatedReviewTime: '1-3 business days',
            message: 'Your registration is pending review by an administrator.'
        });

    } catch (error) {
        logger.error('SP Registration status check failed', {
            requestId,
            registrationId: id,
            error: error instanceof Error ? error.message : 'Unknown error'
        });

        res.status(500).json({
            success: false,
            error: 'Failed to retrieve registration status'
        });
    }
});

export default router;

