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
 */
router.get('/idps/public', async (req: Request, res: Response): Promise<void> => {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        logger.info('Public: List enabled IdPs request', { requestId });

        // Get all IdPs from Keycloak
        const result = await keycloakAdminService.listIdentityProviders();

        // Filter to only enabled IdPs (users should only see active options)
        const enabledIdps = result.idps.filter(idp => idp.enabled);

        logger.info('Public: Returning enabled IdPs', {
            requestId,
            total: result.total,
            enabled: enabledIdps.length
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
            error: error instanceof Error ? error.message : 'Unknown error'
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

