/**
 * Claim Enrichment Middleware (Week 3)
 * 
 * Enriches JWT tokens with missing identity attributes for non-standard IdPs (e.g., Industry).
 * Applied BEFORE authzMiddleware in resource routes to ensure all required attributes exist.
 * 
 * Enrichment Rules:
 * 1. countryOfAffiliation missing → Infer from email domain
 *    - @*.mil, @*.army.mil, @*.navy.mil, @*.af.mil → USA
 *    - @*.gouv.fr, @*.defense.gouv.fr → FRA
 *    - @*.gc.ca, @*.forces.gc.ca → CAN
 *    - @*.mod.uk → GBR
 *    - Default: USA (with warning log)
 * 
 * 2. clearance missing → Default to UNCLASSIFIED (log enrichment)
 * 
 * 3. acpCOI missing → Default to empty array []
 * 
 * All enrichments are logged for audit trail compliance.
 * 
 * Security: Enrichment failures result in 403 Forbidden (fail-secure).
 */

import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * Email domain to country mapping
 * ISO 3166-1 alpha-3 country codes
 */
const EMAIL_DOMAIN_COUNTRY_MAP: Record<string, string> = {
    // United States
    'mil': 'USA',
    'army.mil': 'USA',
    'navy.mil': 'USA',
    'af.mil': 'USA',
    'marines.mil': 'USA',
    'uscg.mil': 'USA',
    'pentagon.mil': 'USA',

    // France
    'gouv.fr': 'FRA',
    'defense.gouv.fr': 'FRA',
    'intradef.gouv.fr': 'FRA',

    // Canada
    'gc.ca': 'CAN',
    'forces.gc.ca': 'CAN',
    'dnd-mdn.gc.ca': 'CAN',

    // United Kingdom
    'mod.uk': 'GBR',
    'ministry-of-defence.uk': 'GBR',

    // Germany (if needed)
    'bundeswehr.org': 'DEU',

    // Industry contractors (U.S. based)
    'lockheed.com': 'USA',
    'northropgrumman.com': 'USA',
    'raytheon.com': 'USA',
    'boeing.com': 'USA',
    'l3harris.com': 'USA',
};

/**
 * Valid clearance levels (from .cursorrules)
 */
const VALID_CLEARANCE_LEVELS = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];

/**
 * Infer countryOfAffiliation from email address
 * @param email User's email address
 * @returns ISO 3166-1 alpha-3 country code or 'USA' (default)
 */
function inferCountryFromEmail(email: string): { country: string; confidence: 'high' | 'low' } {
    if (!email || typeof email !== 'string') {
        logger.warn('enrichment', 'Invalid email for country inference', { email });
        return { country: 'USA', confidence: 'low' };
    }

    const emailLower = email.toLowerCase();
    const domain = emailLower.split('@')[1];

    if (!domain) {
        logger.warn('enrichment', 'No domain in email for country inference', { email: emailLower });
        return { country: 'USA', confidence: 'low' };
    }

    // Check exact match first
    if (EMAIL_DOMAIN_COUNTRY_MAP[domain]) {
        return { country: EMAIL_DOMAIN_COUNTRY_MAP[domain], confidence: 'high' };
    }

    // Check subdomain match (e.g., unit.army.mil → matches army.mil)
    for (const [mappedDomain, country] of Object.entries(EMAIL_DOMAIN_COUNTRY_MAP)) {
        if (domain.endsWith(`.${mappedDomain}`) || domain === mappedDomain) {
            return { country, confidence: 'high' };
        }
    }

    // Default to USA with low confidence
    logger.warn('enrichment', 'Unknown email domain, defaulting to USA', {
        email: emailLower,
        domain
    });
    return { country: 'USA', confidence: 'low' };
}

/**
 * Enrichment middleware
 * Fills missing identity attributes before authorization
 */
export async function enrichmentMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    const requestId = req.headers['x-request-id'] as string || `req-${Date.now()}`;

    try {
        // Get JWT payload from req.user (set by earlier auth middleware)
        // In DIVE V3, NextAuth passes JWT via Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            logger.error('enrichment', 'No JWT token in request', { requestId });
            res.status(401).json({
                error: 'Unauthorized',
                message: 'Missing or invalid authorization token'
            });
            return;
        }

        const token = authHeader.substring(7);

        // Parse JWT without verification (already verified by NextAuth)
        // We just need the payload for enrichment
        const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());

        const originalClaims = {
            uniqueID: payload.uniqueID,
            clearance: payload.clearance,
            countryOfAffiliation: payload.countryOfAffiliation,
            acpCOI: payload.acpCOI,
            email: payload.email
        };

        let enriched = false;
        const enrichments: string[] = [];

        // Enrichment 1: countryOfAffiliation missing
        if (!payload.countryOfAffiliation || payload.countryOfAffiliation === '') {
            if (payload.email) {
                const { country, confidence } = inferCountryFromEmail(payload.email);
                payload.countryOfAffiliation = country;
                enriched = true;
                enrichments.push(`countryOfAffiliation=${country} (inferred from email, confidence=${confidence})`);

                logger.info('enrichment', 'Inferred country from email', {
                    requestId,
                    uniqueID: payload.uniqueID,
                    email: payload.email,
                    inferredCountry: country,
                    confidence
                });
            } else {
                // No email available, fail-secure
                logger.error('enrichment', 'Cannot infer country: no email provided', {
                    requestId,
                    uniqueID: payload.uniqueID
                });
                res.status(403).json({
                    error: 'Forbidden',
                    message: 'Missing countryOfAffiliation and cannot infer from email',
                    details: {
                        reason: 'Required attribute countryOfAffiliation is missing and no email available for inference'
                    }
                });
                return;
            }
        }

        // Enrichment 2: clearance missing
        if (!payload.clearance || payload.clearance === '') {
            payload.clearance = 'UNCLASSIFIED';
            enriched = true;
            enrichments.push('clearance=UNCLASSIFIED (default)');

            logger.info('enrichment', 'Defaulted clearance to UNCLASSIFIED', {
                requestId,
                uniqueID: payload.uniqueID
            });
        }

        // Validate clearance level
        if (!VALID_CLEARANCE_LEVELS.includes(payload.clearance)) {
            logger.error('enrichment', 'Invalid clearance level after enrichment', {
                requestId,
                uniqueID: payload.uniqueID,
                clearance: payload.clearance
            });
            res.status(403).json({
                error: 'Forbidden',
                message: 'Invalid clearance level',
                details: {
                    clearance: payload.clearance,
                    validLevels: VALID_CLEARANCE_LEVELS
                }
            });
            return;
        }

        // Enrichment 3: acpCOI missing
        if (!payload.acpCOI) {
            payload.acpCOI = '[]';
            enriched = true;
            enrichments.push('acpCOI=[] (default)');

            logger.info('enrichment', 'Defaulted acpCOI to empty array', {
                requestId,
                uniqueID: payload.uniqueID
            });
        }

        // Log all enrichments for audit
        if (enriched) {
            logger.info('enrichment', 'Attributes enriched', {
                requestId,
                uniqueID: payload.uniqueID,
                enrichments,
                originalClaims: {
                    clearance: originalClaims.clearance,
                    countryOfAffiliation: originalClaims.countryOfAffiliation,
                    acpCOI: originalClaims.acpCOI
                },
                enrichedClaims: {
                    clearance: payload.clearance,
                    countryOfAffiliation: payload.countryOfAffiliation,
                    acpCOI: payload.acpCOI
                }
            });

            // Attach enriched payload to request for downstream middleware
            (req as any).enrichedUser = payload;
            (req as any).wasEnriched = true;
        } else {
            // No enrichment needed
            logger.debug('enrichment', 'No enrichment needed', {
                requestId,
                uniqueID: payload.uniqueID
            });
            (req as any).enrichedUser = payload;
            (req as any).wasEnriched = false;
        }

        next();

    } catch (error) {
        logger.error('enrichment', 'Enrichment middleware error', {
            requestId,
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined
        });

        res.status(500).json({
            error: 'Internal Server Error',
            message: 'Failed to enrich identity attributes'
        });
    }
}

