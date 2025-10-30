/**
 * DIVE V3 - Attribute Normalization Service
 * 
 * Normalizes attributes from external IdPs (Spain SAML, USA OIDC) to DIVE standard claims.
 * 
 * DIVE Standard Attributes:
 * - uniqueID: Unique user identifier
 * - clearance: UNCLASSIFIED | CONFIDENTIAL | SECRET | TOP_SECRET
 * - countryOfAffiliation: ISO 3166-1 alpha-3 (USA, ESP, CAN, etc.)
 * - acpCOI: Array of Community of Interest tags
 */

import { logger } from '../utils/logger';

export interface ExternalIdPAttributes {
    [key: string]: string | string[] | undefined;
}

export interface NormalizedDIVEAttributes {
    uniqueID: string;
    clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
    countryOfAffiliation: string;
    acpCOI?: string[];
    organization?: string;
    rank?: string;
    unit?: string;
}

/**
 * Spanish clearance level mappings
 * Spain uses different terminology for security classifications
 */
const SPANISH_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
    'SECRETO': 'TOP_SECRET',
    'CONFIDENCIAL-DEFENSA': 'SECRET',
    'CONFIDENCIAL': 'CONFIDENTIAL',
    'NO-CLASIFICADO': 'UNCLASSIFIED',
    'RESERVADO': 'CONFIDENTIAL',  // Fallback
};

/**
 * Spanish COI tag normalization
 * Maps Spanish COI tags to NATO/DIVE standard tags
 */
const SPANISH_COI_MAP: Record<string, string> = {
    'OTAN-COSMIC': 'NATO-COSMIC',
    'OTAN': 'NATO-COSMIC',
    'ESP-EXCLUSIVO': 'ESP-ONLY',
    'ESP-OTAN': 'NATO-COSMIC',
    'UE-RESTRINGIDO': 'EU-RESTRICTED',
};

/**
 * Country code normalization
 * Ensures ISO 3166-1 alpha-3 format
 */
const COUNTRY_CODE_MAP: Record<string, string> = {
    'ES': 'ESP',
    'ESP': 'ESP',
    'SPAIN': 'ESP',
    'US': 'USA',
    'USA': 'USA',
    'UNITED STATES': 'USA',
    'CA': 'CAN',
    'CAN': 'CAN',
    'CANADA': 'CAN',
    'FR': 'FRA',
    'FRA': 'FRA',
    'FRANCE': 'FRA',
    'GB': 'GBR',
    'GBR': 'GBR',
    'UK': 'GBR',
    'UNITED KINGDOM': 'GBR',
    'DE': 'DEU',
    'DEU': 'DEU',
    'GERMANY': 'DEU',
};

/**
 * Normalize Spanish SAML attributes to DIVE standard
 */
export function normalizeSpanishSAMLAttributes(
    samlAttributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const normalized: Partial<NormalizedDIVEAttributes> = {};

    try {
        // UniqueID: Use uid or email
        const uid = getFirstValue(samlAttributes.uid) || getFirstValue(samlAttributes.mail);
        if (uid) {
            normalized.uniqueID = uid;
        }

        // Clearance: Map Spanish security levels
        const nivelSeguridad = getFirstValue(samlAttributes.nivelSeguridad);
        if (nivelSeguridad) {
            normalized.clearance = SPANISH_CLEARANCE_MAP[nivelSeguridad] || 'UNCLASSIFIED';

            logger.info('Normalized Spanish clearance', {
                spanish: nivelSeguridad,
                dive: normalized.clearance,
            });
        }

        // Country of Affiliation
        const paisAfiliacion = getFirstValue(samlAttributes.paisAfiliacion);
        if (paisAfiliacion) {
            normalized.countryOfAffiliation = COUNTRY_CODE_MAP[paisAfiliacion] || paisAfiliacion;
        } else {
            // Default to ESP for Spanish IdP
            normalized.countryOfAffiliation = 'ESP';
        }

        // COI Tags: Normalize Spanish tags
        const grupoInteres = samlAttributes.grupoInteresCompartido;
        if (grupoInteres) {
            const coiArray = Array.isArray(grupoInteres) ? grupoInteres : [grupoInteres];
            normalized.acpCOI = coiArray.map(
                (tag) => SPANISH_COI_MAP[tag] || tag
            );

            logger.info('Normalized Spanish COI tags', {
                spanish: grupoInteres,
                dive: normalized.acpCOI,
            });
        }

        // Additional metadata
        normalized.organization = getFirstValue(samlAttributes.organizacion);
        normalized.rank = getFirstValue(samlAttributes.rango);
        normalized.unit = getFirstValue(samlAttributes.unidad);

        logger.info('Normalized Spanish SAML attributes', {
            original: samlAttributes,
            normalized,
        });

        return normalized;
    } catch (error) {
        logger.error('Error normalizing Spanish SAML attributes', { error, attributes: samlAttributes });
        return {};
    }
}

/**
 * Normalize USA OIDC attributes to DIVE standard
 * USA DoD already uses DIVE-compliant attribute names
 */
export function normalizeUSAOIDCAttributes(
    oidcClaims: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const normalized: Partial<NormalizedDIVEAttributes> = {};

    try {
        // USA DoD already uses DIVE attribute names, just validate and pass through
        normalized.uniqueID =
            getFirstValue(oidcClaims.uniqueID) ||
            getFirstValue(oidcClaims.preferred_username) ||
            getFirstValue(oidcClaims.email);

        // Validate clearance value
        const clearance = getFirstValue(oidcClaims.clearance);
        if (clearance && isValidClearance(clearance)) {
            normalized.clearance = clearance as NormalizedDIVEAttributes['clearance'];
        }

        // Country code normalization
        const country = getFirstValue(oidcClaims.countryOfAffiliation);
        if (country) {
            normalized.countryOfAffiliation = COUNTRY_CODE_MAP[country] || country;
        } else {
            // Default to USA for U.S. DoD IdP
            normalized.countryOfAffiliation = 'USA';
        }

        // COI Tags
        const acpCOI = oidcClaims.acpCOI;
        if (acpCOI) {
            normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
        }

        // Additional metadata
        normalized.organization = getFirstValue(oidcClaims.organization);
        normalized.rank = getFirstValue(oidcClaims.rank);
        normalized.unit = getFirstValue(oidcClaims.unit);

        logger.info('Normalized USA OIDC attributes', {
            original: oidcClaims,
            normalized,
        });

        return normalized;
    } catch (error) {
        logger.error('Error normalizing USA OIDC attributes', { error, attributes: oidcClaims });
        return {};
    }
}

/**
 * Generic attribute normalizer
 * Routes to IdP-specific normalizers based on identity provider alias
 */
export function normalizeExternalIdPAttributes(
    idpAlias: string,
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    logger.info('Normalizing external IdP attributes', { idpAlias, attributes });

    switch (idpAlias.toLowerCase()) {
        case 'spain-external':
        case 'spain-saml':
        case 'esp-idp':
            return normalizeSpanishSAMLAttributes(attributes);

        case 'usa-external':
        case 'usa-oidc':
        case 'us-dod':
            return normalizeUSAOIDCAttributes(attributes);

        // France, Canada, Industry use similar patterns
        case 'france-idp':
        case 'fra-saml':
            return normalizeFrenchAttributes(attributes);

        case 'canada-idp':
        case 'can-oidc':
            return normalizeCanadianAttributes(attributes);

        default:
            logger.warn('Unknown IdP alias, using generic normalization', { idpAlias });
            return genericNormalization(attributes);
    }
}

/**
 * French attribute normalization (similar to Spanish)
 */
function normalizeFrenchAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const FRENCH_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        'TRES-SECRET-DEFENSE': 'TOP_SECRET',
        'SECRET-DEFENSE': 'SECRET',
        'CONFIDENTIEL-DEFENSE': 'CONFIDENTIAL',
        'DIFFUSION-RESTREINTE': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    normalized.uniqueID = getFirstValue(attributes.uid) || getFirstValue(attributes.mail);

    const clearance = getFirstValue(attributes.niveauHabilitation);
    if (clearance) {
        normalized.clearance = FRENCH_CLEARANCE_MAP[clearance] || 'UNCLASSIFIED';
    }

    normalized.countryOfAffiliation = 'FRA';

    const coi = attributes.groupeInteret;
    if (coi) {
        normalized.acpCOI = Array.isArray(coi) ? coi : [coi];
    }

    return normalized;
}

/**
 * Canadian attribute normalization
 */
function normalizeCanadianAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    // Canada uses similar clearance levels to USA
    const normalized: Partial<NormalizedDIVEAttributes> = {};

    normalized.uniqueID = getFirstValue(attributes.uniqueID) || getFirstValue(attributes.email);

    const clearance = getFirstValue(attributes.clearance);
    if (clearance && isValidClearance(clearance)) {
        normalized.clearance = clearance as NormalizedDIVEAttributes['clearance'];
    }

    normalized.countryOfAffiliation = 'CAN';

    const acpCOI = attributes.acpCOI;
    if (acpCOI) {
        normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
    }

    return normalized;
}

/**
 * Generic normalization for unknown IdPs
 * Attempts to map common attribute names
 */
function genericNormalization(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const normalized: Partial<NormalizedDIVEAttributes> = {};

    // Try to find uniqueID from common attribute names
    normalized.uniqueID =
        getFirstValue(attributes.uniqueID) ||
        getFirstValue(attributes.uid) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.mail) ||
        getFirstValue(attributes.preferred_username) ||
        getFirstValue(attributes.sub);

    // Try to find clearance
    const clearance =
        getFirstValue(attributes.clearance) ||
        getFirstValue(attributes.securityClearance) ||
        getFirstValue(attributes.classificationLevel);

    if (clearance && isValidClearance(clearance)) {
        normalized.clearance = clearance as NormalizedDIVEAttributes['clearance'];
    }

    // Try to find country
    const country =
        getFirstValue(attributes.countryOfAffiliation) ||
        getFirstValue(attributes.country) ||
        getFirstValue(attributes.c);

    if (country) {
        normalized.countryOfAffiliation = COUNTRY_CODE_MAP[country] || country;
    }

    // COI tags
    const coi = attributes.acpCOI || attributes.coi || attributes.groups;
    if (coi) {
        normalized.acpCOI = Array.isArray(coi) ? coi : [coi];
    }

    return normalized;
}

/**
 * Enriches attributes with defaults when missing
 */
export function enrichAttributes(
    normalized: Partial<NormalizedDIVEAttributes>,
    idpAlias: string
): NormalizedDIVEAttributes {
    // Ensure uniqueID exists
    if (!normalized.uniqueID) {
        throw new Error('uniqueID is required but missing');
    }

    // Default clearance if missing
    const clearance = normalized.clearance || 'UNCLASSIFIED';

    // Infer country from IdP alias if missing
    let country = normalized.countryOfAffiliation;
    if (!country) {
        if (idpAlias.includes('spain') || idpAlias.includes('esp')) {
            country = 'ESP';
        } else if (idpAlias.includes('usa') || idpAlias.includes('us-')) {
            country = 'USA';
        } else if (idpAlias.includes('france') || idpAlias.includes('fra')) {
            country = 'FRA';
        } else if (idpAlias.includes('canada') || idpAlias.includes('can')) {
            country = 'CAN';
        } else {
            // Fallback: try to extract from email domain
            const emailMatch = normalized.uniqueID.match(/@.*\.(mil|gov|gc\.ca|mde\.es|gouv\.fr)/);
            if (emailMatch) {
                const domain = emailMatch[1];
                if (domain === 'mil') country = 'USA';
                else if (domain === 'gc.ca') country = 'CAN';
                else if (domain === 'mde.es') country = 'ESP';
                else if (domain === 'gouv.fr') country = 'FRA';
            }
        }

        if (!country) {
            throw new Error('countryOfAffiliation could not be determined');
        }
    }

    return {
        uniqueID: normalized.uniqueID,
        clearance,
        countryOfAffiliation: country,
        acpCOI: normalized.acpCOI,
        organization: normalized.organization,
        rank: normalized.rank,
        unit: normalized.unit,
    };
}

// Helper functions

function getFirstValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) {
        return value[0];
    }
    return value;
}

function isValidClearance(clearance: string): boolean {
    const validLevels = ['UNCLASSIFIED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
    return validLevels.includes(clearance);
}

/**
 * Export mapping dictionaries for testing
 */
export const mappings = {
    spanishClearance: SPANISH_CLEARANCE_MAP,
    spanishCOI: SPANISH_COI_MAP,
    countryCodes: COUNTRY_CODE_MAP,
};


