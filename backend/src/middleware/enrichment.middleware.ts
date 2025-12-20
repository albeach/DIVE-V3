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

// Import trusted federation instances - dynamic from environment
const TRUSTED_FEDERATION_INSTANCES: string[] = (() => {
    const envValue = process.env.TRUSTED_FEDERATION_INSTANCES;
    if (envValue) {
        return envValue.split(',').map(s => s.trim().toUpperCase()).filter(s => s);
    }
    // Default: Legacy hardcoded list for backward compatibility
    return ['USA', 'FRA', 'GBR', 'DEU', 'HUN'];
})();

/**
 * Email domain to country mapping
 * ISO 3166-1 alpha-3 country codes
 * 
 * Phase 3: Extended with comprehensive multi-IdP support
 * - Government/Military domains for all coalition partners
 * - Major defense contractors by headquarters country
 */
const EMAIL_DOMAIN_COUNTRY_MAP: Record<string, string> = {
    // ============================================
    // United States - Government/Military
    // ============================================
    'mil': 'USA',
    'army.mil': 'USA',
    'navy.mil': 'USA',
    'af.mil': 'USA',
    'marines.mil': 'USA',
    'uscg.mil': 'USA',
    'spaceforce.mil': 'USA',
    'pentagon.mil': 'USA',
    'disa.mil': 'USA',
    'nsa.mil': 'USA',
    'dia.mil': 'USA',
    'state.gov': 'USA',
    'defense.gov': 'USA',

    // ============================================
    // France - Government/Military
    // ============================================
    'gouv.fr': 'FRA',
    'defense.gouv.fr': 'FRA',
    'intradef.gouv.fr': 'FRA',
    'interieur.gouv.fr': 'FRA',
    'ssi.gouv.fr': 'FRA',
    'dgse.gouv.fr': 'FRA',
    'gendarmerie.interieur.gouv.fr': 'FRA',

    // ============================================
    // Canada - Government/Military
    // ============================================
    'gc.ca': 'CAN',
    'canada.ca': 'CAN',
    'forces.gc.ca': 'CAN',
    'dnd-mdn.gc.ca': 'CAN',
    'rcmp-grc.gc.ca': 'CAN',
    'cse-cst.gc.ca': 'CAN',

    // ============================================
    // United Kingdom - Government/Military
    // ============================================
    'mod.uk': 'GBR',
    'gov.uk': 'GBR',
    'mil.uk': 'GBR',
    'gchq.gov.uk': 'GBR',
    'mi5.gov.uk': 'GBR',
    'mi6.gov.uk': 'GBR',
    'royal-navy.mod.uk': 'GBR',
    'army.mod.uk': 'GBR',
    'raf.mod.uk': 'GBR',

    // ============================================
    // Germany - Government/Military
    // ============================================
    'bundeswehr.org': 'DEU',
    'bundeswehr.de': 'DEU',
    'bund.de': 'DEU',
    'bmi.bund.de': 'DEU',
    'bmvg.bund.de': 'DEU',
    'bnd.bund.de': 'DEU',

    // ============================================
    // Australia - Government/Military
    // ============================================
    'defence.gov.au': 'AUS',
    'gov.au': 'AUS',
    'asd.gov.au': 'AUS',

    // ============================================
    // New Zealand - Government/Military
    // ============================================
    'govt.nz': 'NZL',
    'nzdf.mil.nz': 'NZL',

    // ============================================
    // NATO
    // ============================================
    'nato.int': 'NATO',

    // ============================================
    // Industry Contractors - USA Headquartered
    // ============================================
    'lockheedmartin.com': 'USA',
    'lockheed.com': 'USA',
    'northropgrumman.com': 'USA',
    'raytheon.com': 'USA',
    'rtx.com': 'USA',
    'boeing.com': 'USA',
    'l3harris.com': 'USA',
    'gd.com': 'USA',
    'general-dynamics.com': 'USA',
    'leidos.com': 'USA',
    'saic.com': 'USA',
    'booz.com': 'USA',
    'caci.com': 'USA',
    'mantech.com': 'USA',
    'parsons.com': 'USA',
    'peraton.com': 'USA',

    // ============================================
    // Industry Contractors - UK Headquartered
    // ============================================
    'bae.com': 'GBR',
    'baesystems.com': 'GBR',
    'rolls-royce.com': 'GBR',
    'qinetiq.com': 'GBR',
    'babcockinternational.com': 'GBR',

    // ============================================
    // Industry Contractors - France Headquartered
    // ============================================
    'thalesgroup.com': 'FRA',
    'safrangroup.com': 'FRA',
    'naval-group.com': 'FRA',
    'mbda-systems.com': 'FRA',
    'dfrancaise.com': 'FRA',

    // ============================================
    // Industry Contractors - Germany Headquartered
    // ============================================
    'rheinmetall.com': 'DEU',
    'airbus.com': 'DEU',
    'hensoldt.net': 'DEU',
    'diehl.com': 'DEU',
    'krauss-maffei.com': 'DEU',

    // ============================================
    // Industry Contractors - Italy Headquartered
    // ============================================
    'leonardocompany.com': 'ITA',
    'fincantieri.com': 'ITA',

    // ============================================
    // Industry Contractors - Canada Headquartered
    // ============================================
    'cae.com': 'CAN',
    'gdcanada.com': 'CAN',
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
        let payload: any;

        // Check if user is already authenticated (from authenticateJWT middleware)
        if ((req as any).user) {
            // User object already exists - use it directly
            const user = (req as any).user;
            payload = {
                uniqueID: user.uniqueID,
                clearance: user.clearance,
                countryOfAffiliation: user.countryOfAffiliation,
                acpCOI: user.acpCOI,
                email: user.email || `${user.uniqueID}@local.example`
            };

            logger.debug('enrichment', 'Using existing authenticated user', {
                requestId,
                uniqueID: payload.uniqueID,
                federated: !!user.federated
            });

        } else {
            // Check for federated request from another instance
            const federatedFrom = req.headers['x-federated-from'] as string;

            if (federatedFrom && TRUSTED_FEDERATION_INSTANCES.includes(federatedFrom)) {
                // This is a federated request - extract user info from token without full validation
                const authHeader = req.headers.authorization;

                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    logger.error('enrichment', 'No JWT token in federated request', { requestId, federatedFrom });
                    res.status(401).json({
                        error: 'Unauthorized',
                        message: 'Missing authorization token in federated request'
                    });
                    return;
                }

                const token = authHeader.substring(7);

                // Decode JWT without verification (trust federated partner)
                try {
                    const jose = await import('jose');
                    const decoded = jose.decodeJwt(token);

                    payload = {
                        uniqueID: (decoded as any).uniqueID || (decoded as any).preferred_username || decoded.sub || `federated-${federatedFrom}-user`,
                        clearance: (decoded as any).clearance || 'UNCLASSIFIED',
                        countryOfAffiliation: (decoded as any).countryOfAffiliation || federatedFrom,
                        acpCOI: (decoded as any).acpCOI || [],
                        email: (decoded as any).email || `${(decoded as any).uniqueID || 'user'}@federated.${federatedFrom.toLowerCase()}`
                    };

                    logger.debug('enrichment', 'Enriching federated request', {
                        requestId,
                        federatedFrom,
                        uniqueID: payload.uniqueID
                    });

                } catch (decodeError) {
                    logger.error('enrichment', 'Failed to decode federated JWT', {
                        requestId,
                        federatedFrom,
                        error: decodeError instanceof Error ? decodeError.message : String(decodeError)
                    });
                    res.status(400).json({
                        error: 'Bad Request',
                        message: 'Invalid JWT in federated request'
                    });
                    return;
                }

            } else {
                // Standard NextAuth flow - parse JWT token
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

                // Parse JWT without verification (already verified by authenticateJWT)
                payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
            }
        }

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
