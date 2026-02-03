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
 *
 * Phase 3: Extended with comprehensive multi-IdP support
 * - Spain SAML (test fixture)
 * - USA OIDC (test fixture)
 * - France SAML (production)
 * - Canada OIDC (production)
 * - Germany OIDC (production)
 * - UK OIDC (production)
 * - Industry OIDC (production)
 */
export function normalizeExternalIdPAttributes(
    idpAlias: string,
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    logger.info('Normalizing external IdP attributes', { idpAlias, attributes });

    const alias = idpAlias.toLowerCase();

    // Spain SAML IdP (test fixture)
    if (alias.includes('spain') || alias.includes('esp')) {
        return normalizeSpanishSAMLAttributes(attributes);
    }

    // USA OIDC IdP (test fixture and production)
    if (alias.includes('usa') || alias.includes('us-dod') || alias.includes('us-oidc')) {
        return normalizeUSAOIDCAttributes(attributes);
    }

    // France SAML IdP (production)
    if (alias.includes('france') || alias.includes('fra')) {
        return normalizeFrenchAttributes(attributes);
    }

    // Canada OIDC IdP (production)
    if (alias.includes('canada') || alias.includes('can')) {
        return normalizeCanadianAttributes(attributes);
    }

    // Germany OIDC IdP (production)
    if (alias.includes('germany') || alias.includes('deu') || alias.includes('bundeswehr')) {
        return normalizeGermanAttributes(attributes);
    }

    // UK OIDC IdP (production)
    if (alias.includes('uk') || alias.includes('gbr') || alias.includes('britain')) {
        return normalizeUKAttributes(attributes);
    }

    // Industry IdP (production)
    if (alias.includes('industry') || alias.includes('contractor')) {
        return normalizeIndustryAttributes(attributes);
    }

    // Default: generic normalization
    logger.warn('Unknown IdP alias, using generic normalization', { idpAlias });
    return genericNormalization(attributes);
}

/**
 * German attribute normalization
 *
 * German clearance levels (VSA):
 * - STRENG GEHEIM → TOP_SECRET
 * - GEHEIM / VS-GEHEIM → SECRET
 * - VERTRAULICH / VS-VERTRAULICH → CONFIDENTIAL
 * - VS-NUR FÜR DEN DIENSTGEBRAUCH → RESTRICTED
 * - OFFEN → UNCLASSIFIED
 */
function normalizeGermanAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const GERMAN_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        'STRENG_GEHEIM': 'TOP_SECRET',
        'STRENG GEHEIM': 'TOP_SECRET',
        'GEHEIM': 'SECRET',
        'VS-GEHEIM': 'SECRET',
        'VS_GEHEIM': 'SECRET',
        'VERTRAULICH': 'CONFIDENTIAL',
        'VS-VERTRAULICH': 'CONFIDENTIAL',
        'VS_VERTRAULICH': 'CONFIDENTIAL',
        'VS-NUR_FÜR_DEN_DIENSTGEBRAUCH': 'UNCLASSIFIED',
        'VS-NFD': 'UNCLASSIFIED',
        'OFFEN': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    normalized.uniqueID =
        getFirstValue(attributes.uniqueID) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.preferred_username);

    const clearance =
        getFirstValue(attributes.clearance) ||
        getFirstValue(attributes.sicherheitsstufe);

    if (clearance) {
        const normalizedClearance = clearance.toUpperCase().trim();
        normalized.clearance = GERMAN_CLEARANCE_MAP[normalizedClearance] || 'UNCLASSIFIED';
    }

    normalized.countryOfAffiliation = 'DEU';

    const acpCOI = attributes.acpCOI || attributes.interessengruppe;
    if (acpCOI) {
        normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
    }

    normalized.organization = getFirstValue(attributes.organization) || getFirstValue(attributes.organisation);

    logger.info('Normalized German attributes', { original: attributes, normalized });

    return normalized;
}

/**
 * UK attribute normalization
 *
 * UK clearance levels (GPMS):
 * - TOP SECRET → TOP_SECRET
 * - SECRET → SECRET
 * - OFFICIAL-SENSITIVE → CONFIDENTIAL
 * - OFFICIAL → UNCLASSIFIED
 */
function normalizeUKAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const UK_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        'TOP_SECRET': 'TOP_SECRET',
        'TOP SECRET': 'TOP_SECRET',
        'SECRET': 'SECRET',
        'OFFICIAL-SENSITIVE': 'CONFIDENTIAL',
        'OFFICIAL_SENSITIVE': 'CONFIDENTIAL',
        'OFFICIAL': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    normalized.uniqueID =
        getFirstValue(attributes.uniqueID) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.preferred_username);

    const clearance = getFirstValue(attributes.clearance) || getFirstValue(attributes.securityClearance);
    if (clearance) {
        const normalizedClearance = clearance.toUpperCase().trim();
        normalized.clearance = UK_CLEARANCE_MAP[normalizedClearance] || 'UNCLASSIFIED';
    }

    normalized.countryOfAffiliation = 'GBR';

    const acpCOI = attributes.acpCOI || attributes.communityOfInterest;
    if (acpCOI) {
        normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
    }

    normalized.organization = getFirstValue(attributes.organization) || getFirstValue(attributes.organisation);

    logger.info('Normalized UK attributes', { original: attributes, normalized });

    return normalized;
}

/**
 * Industry IdP attribute normalization
 *
 * Industry clearance levels:
 * - HIGHLY_SENSITIVE → TOP_SECRET (but will be capped by policy)
 * - SENSITIVE → SECRET
 * - CONFIDENTIAL → CONFIDENTIAL
 * - INTERNAL → RESTRICTED
 * - PUBLIC → UNCLASSIFIED
 *
 * Note: Industry users are subject to clearance caps per tenant policy
 */
function normalizeIndustryAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    const INDUSTRY_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        'HIGHLY_SENSITIVE': 'TOP_SECRET',
        'HIGHLY SENSITIVE': 'TOP_SECRET',
        'SENSITIVE': 'SECRET',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'INTERNAL': 'UNCLASSIFIED',
        'PUBLIC': 'UNCLASSIFIED',
        // Standard US clearances for industry users with government clearance
        'TOP_SECRET': 'TOP_SECRET',
        'SECRET': 'SECRET',
        'UNCLASSIFIED': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    normalized.uniqueID =
        getFirstValue(attributes.uniqueID) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.preferred_username);

    const clearance = getFirstValue(attributes.clearance) || getFirstValue(attributes.securityLevel);
    if (clearance) {
        const normalizedClearance = clearance.toUpperCase().trim();
        const mappedClearance = INDUSTRY_CLEARANCE_MAP[normalizedClearance];
        normalized.clearance = mappedClearance || 'UNCLASSIFIED';
    }

    // Industry users: infer country from organization or email domain
    normalized.countryOfAffiliation = getFirstValue(attributes.countryOfAffiliation);
    // Country will be enriched later if missing based on email domain

    const acpCOI = attributes.acpCOI || attributes.programs;
    if (acpCOI) {
        normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
    }

    normalized.organization = getFirstValue(attributes.organization) || getFirstValue(attributes.company);

    // Mark as industry organization type
    if (attributes.organizationType) {
        // Pass through organization type if provided
    }

    logger.info('Normalized Industry attributes', { original: attributes, normalized });

    return normalized;
}

/**
 * French attribute normalization (IGI 1300 security classification)
 *
 * French clearance levels (IGI 1300):
 * - TRES SECRET DEFENSE (TSD) → TOP_SECRET
 * - SECRET DEFENSE (SD) → SECRET
 * - CONFIDENTIEL DEFENSE (CD) → CONFIDENTIAL
 * - DIFFUSION RESTREINTE (DR) → RESTRICTED
 * - NON PROTEGE (NP) → UNCLASSIFIED
 *
 * Phase 3: Enhanced to handle all French clearance formats with/without accents
 */
function normalizeFrenchAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    // Comprehensive French clearance mapping (handles various formats)
    const FRENCH_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        // TRES SECRET DEFENSE variants
        'TRES_SECRET_DEFENSE': 'TOP_SECRET',
        'TRES-SECRET-DEFENSE': 'TOP_SECRET',
        'TRÈS_SECRET_DÉFENSE': 'TOP_SECRET',
        'TRÈS SECRET DÉFENSE': 'TOP_SECRET',
        'TSD': 'TOP_SECRET',

        // SECRET DEFENSE variants
        'SECRET_DEFENSE': 'SECRET',
        'SECRET-DEFENSE': 'SECRET',
        'SECRET_DÉFENSE': 'SECRET',
        'SECRET DÉFENSE': 'SECRET',
        'SD': 'SECRET',

        // CONFIDENTIEL DEFENSE variants
        'CONFIDENTIEL_DEFENSE': 'CONFIDENTIAL',
        'CONFIDENTIEL-DEFENSE': 'CONFIDENTIAL',
        'CONFIDENTIEL_DÉFENSE': 'CONFIDENTIAL',
        'CONFIDENTIEL DÉFENSE': 'CONFIDENTIAL',
        'CD': 'CONFIDENTIAL',

        // DIFFUSION RESTREINTE variants (maps to RESTRICTED, but we use UNCLASSIFIED as fallback)
        'DIFFUSION_RESTREINTE': 'UNCLASSIFIED',
        'DIFFUSION-RESTREINTE': 'UNCLASSIFIED',
        'DR': 'UNCLASSIFIED',

        // NON PROTEGE variants
        'NON_PROTEGE': 'UNCLASSIFIED',
        'NON-PROTEGE': 'UNCLASSIFIED',
        'NON_PROTÉGÉ': 'UNCLASSIFIED',
        'NON PROTÉGÉ': 'UNCLASSIFIED',
        'NP': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    // UniqueID: Try multiple French attribute names
    normalized.uniqueID =
        getFirstValue(attributes.uid) ||
        getFirstValue(attributes.mail) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.identifiantUnique);

    // Clearance: Try multiple French attribute names and normalize
    const clearance =
        getFirstValue(attributes.niveauHabilitation) ||
        getFirstValue(attributes.niveauSecret) ||
        getFirstValue(attributes.clearance);

    if (clearance) {
        const normalizedClearance = clearance.toUpperCase().trim();
        normalized.clearance = FRENCH_CLEARANCE_MAP[normalizedClearance] || 'UNCLASSIFIED';

        logger.info('Normalized French clearance', {
            original: clearance,
            normalized: normalized.clearance,
        });
    }

    // Country: Always FRA for French IdP
    normalized.countryOfAffiliation =
        getFirstValue(attributes.paysAffiliation) ||
        getFirstValue(attributes.pays) ||
        'FRA';

    // Normalize country code
    if (normalized.countryOfAffiliation) {
        normalized.countryOfAffiliation = COUNTRY_CODE_MAP[normalized.countryOfAffiliation] || normalized.countryOfAffiliation;
    }

    // COI tags: Try multiple French attribute names
    const coi =
        attributes.groupeInteret ||
        attributes.acpCOI ||
        attributes.communauteInteret;

    if (coi) {
        normalized.acpCOI = Array.isArray(coi) ? coi : [coi];
    }

    // Organization
    normalized.organization =
        getFirstValue(attributes.organisation) ||
        getFirstValue(attributes.organization);

    // Rank
    normalized.rank =
        getFirstValue(attributes.grade) ||
        getFirstValue(attributes.rank);

    logger.info('Normalized French SAML attributes', {
        original: attributes,
        normalized,
    });

    return normalized;
}

/**
 * Canadian attribute normalization
 *
 * Canadian clearance levels (PSCP):
 * - TOP SECRET → TOP_SECRET
 * - SECRET → SECRET
 * - CONFIDENTIAL → CONFIDENTIAL
 * - PROTECTED B → CONFIDENTIAL (Canadian designation)
 * - PROTECTED A → RESTRICTED
 * - UNCLASSIFIED → UNCLASSIFIED
 *
 * Phase 3: Enhanced to handle Canadian-specific PROTECTED designations
 */
function normalizeCanadianAttributes(
    attributes: ExternalIdPAttributes
): Partial<NormalizedDIVEAttributes> {
    // Canadian clearance mapping (handles PROTECTED designations)
    const CANADIAN_CLEARANCE_MAP: Record<string, NormalizedDIVEAttributes['clearance']> = {
        // Standard clearances (same as US)
        'TOP_SECRET': 'TOP_SECRET',
        'TOP SECRET': 'TOP_SECRET',
        'TS': 'TOP_SECRET',
        'SECRET': 'SECRET',
        'S': 'SECRET',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'C': 'CONFIDENTIAL',
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'U': 'UNCLASSIFIED',

        // Canadian PROTECTED designations
        'PROTECTED_C': 'SECRET',
        'PROTECTED C': 'SECRET',
        'PROTECTED_B': 'CONFIDENTIAL',
        'PROTECTED B': 'CONFIDENTIAL',
        'PROTECTED_A': 'UNCLASSIFIED',
        'PROTECTED A': 'UNCLASSIFIED',
    };

    const normalized: Partial<NormalizedDIVEAttributes> = {};

    // UniqueID: Try multiple attribute names
    normalized.uniqueID =
        getFirstValue(attributes.uniqueID) ||
        getFirstValue(attributes.email) ||
        getFirstValue(attributes.preferred_username) ||
        getFirstValue(attributes.sub);

    // Clearance: Normalize Canadian-specific designations
    const clearance = getFirstValue(attributes.clearance) || getFirstValue(attributes.securityLevel);
    if (clearance) {
        const normalizedClearance = clearance.toUpperCase().trim();
        const mappedClearance = CANADIAN_CLEARANCE_MAP[normalizedClearance];

        if (mappedClearance) {
            normalized.clearance = mappedClearance;
        } else if (isValidClearance(clearance)) {
            normalized.clearance = clearance as NormalizedDIVEAttributes['clearance'];
        }

        logger.info('Normalized Canadian clearance', {
            original: clearance,
            normalized: normalized.clearance,
        });
    }

    // Country: Always CAN for Canadian IdP, but allow override
    normalized.countryOfAffiliation =
        getFirstValue(attributes.countryOfAffiliation) ||
        getFirstValue(attributes.country) ||
        'CAN';

    // Normalize country code
    if (normalized.countryOfAffiliation) {
        normalized.countryOfAffiliation = COUNTRY_CODE_MAP[normalized.countryOfAffiliation] || normalized.countryOfAffiliation;
    }

    // COI tags
    const acpCOI = attributes.acpCOI || attributes.communityOfInterest;
    if (acpCOI) {
        normalized.acpCOI = Array.isArray(acpCOI) ? acpCOI : [acpCOI];
    }

    // Organization
    normalized.organization =
        getFirstValue(attributes.organization) ||
        getFirstValue(attributes.organisation);

    // Rank
    normalized.rank =
        getFirstValue(attributes.rank) ||
        getFirstValue(attributes.grade);

    // Unit
    normalized.unit = getFirstValue(attributes.unit);

    logger.info('Normalized Canadian OIDC attributes', {
        original: attributes,
        normalized,
    });

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
