/**
 * DIVE V3 - Clearance Normalization Service
 * 
 * Normalizes foreign clearance levels to standardized English equivalents
 * for consistent policy evaluation across coalition partners.
 * 
 * Supports:
 * - Spanish clearances (ESP): SECRETO → SECRET
 * - French clearances (FRA): SECRET DEFENSE → SECRET
 * - German clearances (DEU): GEHEIM → SECRET
 * - Italian clearances (ITA): SEGRETO → SECRET
 * - Dutch clearances (NLD): GEHEIM → SECRET
 * - Polish clearances (POL): TAJNY → SECRET
 * - UK clearances (GBR): OFFICIAL-SENSITIVE → CONFIDENTIAL
 * - Canadian clearances (CAN): PROTECTED B → CONFIDENTIAL
 * - Industry clearances (IND): SENSITIVE → SECRET
 * - NATO clearances: NATO_SECRET → SECRET
 * 
 * Pattern: Backend enrichment (TypeScript) rather than Keycloak SPI (Java)
 * Rationale: Faster iteration, codebase consistency, pilot demonstration scope
 * 
 * Last Updated: October 28, 2025 - Added 6 new countries (DEU, ITA, NLD, POL, GBR, IND)
 */

import { logger } from '../utils/logger';

/**
 * Standard DIVE clearance levels (English)
 */
export enum StandardClearance {
    UNCLASSIFIED = 'UNCLASSIFIED',
    RESTRICTED = 'RESTRICTED',
    CONFIDENTIAL = 'CONFIDENTIAL',
    SECRET = 'SECRET',
    TOP_SECRET = 'TOP_SECRET'
}

/**
 * Spanish clearance level mappings
 * Source: Spanish Ministry of Defense classification system
 */
const SPANISH_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // Spanish classification levels
    'NO_CLASIFICADO': StandardClearance.UNCLASSIFIED,
    'DIFUSION_LIMITADA': StandardClearance.RESTRICTED,  // Limited distribution
    'CONFIDENCIAL': StandardClearance.CONFIDENTIAL,
    'SECRETO': StandardClearance.SECRET,
    'ALTO_SECRETO': StandardClearance.TOP_SECRET,

    // Alternate spellings/formats
    'NO CLASIFICADO': StandardClearance.UNCLASSIFIED,
    'DIFUSIÓN LIMITADA': StandardClearance.RESTRICTED,
    'ALTO SECRETO': StandardClearance.TOP_SECRET,
};

/**
 * French clearance level mappings
 * Source: French Defense Security Authority (ANSSI)
 */
const FRENCH_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // French classification levels
    'NON_PROTEGE': StandardClearance.UNCLASSIFIED,
    'DIFFUSION_RESTREINTE': StandardClearance.RESTRICTED,
    'CONFIDENTIEL_DEFENSE': StandardClearance.CONFIDENTIAL,
    'SECRET_DEFENSE': StandardClearance.SECRET,
    'TRES_SECRET_DEFENSE': StandardClearance.TOP_SECRET,

    // Alternate formats
    'NON PROTÉGÉ': StandardClearance.UNCLASSIFIED,
    'DIFFUSION RESTREINTE': StandardClearance.RESTRICTED,
    'CONFIDENTIEL DÉFENSE': StandardClearance.CONFIDENTIAL,
    'SECRET DÉFENSE': StandardClearance.SECRET,
    'TRÈS SECRET DÉFENSE': StandardClearance.TOP_SECRET,
};

/**
 * Canadian clearance level mappings (already in English, but included for completeness)
 */
const CANADIAN_CLEARANCE_MAP: Record<string, StandardClearance> = {
    'UNCLASSIFIED': StandardClearance.UNCLASSIFIED,
    'PROTECTED_A': StandardClearance.RESTRICTED,
    'PROTECTED_B': StandardClearance.CONFIDENTIAL,
    'CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
    'SECRET': StandardClearance.SECRET,
    'TOP_SECRET': StandardClearance.TOP_SECRET,
};

/**
 * NATO clearance level mappings (multilingual)
 */
const NATO_CLEARANCE_MAP: Record<string, StandardClearance> = {
    'NATO_UNCLASSIFIED': StandardClearance.UNCLASSIFIED,
    'NATO_RESTRICTED': StandardClearance.RESTRICTED,
    'NATO_CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
    'NATO_SECRET': StandardClearance.SECRET,
    'COSMIC_TOP_SECRET': StandardClearance.TOP_SECRET,
};

/**
 * German clearance level mappings
 * Source: German Federal Office for Information Security (BSI)
 */
const GERMAN_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // German classification levels
    'OFFEN': StandardClearance.UNCLASSIFIED,
    'VERTRAULICH': StandardClearance.CONFIDENTIAL,
    'GEHEIM': StandardClearance.SECRET,
    'STRENG_GEHEIM': StandardClearance.TOP_SECRET,

    // Alternate formats
    'STRENG GEHEIM': StandardClearance.TOP_SECRET,
    'VS-NUR_FÜR_DEN_DIENSTGEBRAUCH': StandardClearance.RESTRICTED, // VS-NFD
    'VS-VERTRAULICH': StandardClearance.CONFIDENTIAL,
    'VS-GEHEIM': StandardClearance.SECRET,
    'STRENGGEHEIM': StandardClearance.TOP_SECRET,
};

/**
 * Italian clearance level mappings
 * Source: Italian Ministry of Defense classification system
 */
const ITALIAN_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // Italian classification levels
    'NON_CLASSIFICATO': StandardClearance.UNCLASSIFIED,
    'RISERVATO': StandardClearance.CONFIDENTIAL,
    'SEGRETO': StandardClearance.SECRET,
    'SEGRETISSIMO': StandardClearance.TOP_SECRET,

    // Alternate formats
    'NON CLASSIFICATO': StandardClearance.UNCLASSIFIED,
    'USO UFFICIALE': StandardClearance.RESTRICTED,
    'AD USO UFFICIALE': StandardClearance.RESTRICTED,
    'RISERVATISSIMO': StandardClearance.CONFIDENTIAL, // Highly Confidential
};

/**
 * Dutch clearance level mappings
 * Source: Dutch Ministry of Defense classification system
 */
const DUTCH_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // Dutch classification levels
    'NIET_GERUBRICEERD': StandardClearance.UNCLASSIFIED,
    'DEPARTEMENTAAL_VERTROUWELIJK': StandardClearance.RESTRICTED,
    'VERTROUWELIJK': StandardClearance.CONFIDENTIAL,
    'GEHEIM': StandardClearance.SECRET,
    'ZEER_GEHEIM': StandardClearance.TOP_SECRET,

    // Alternate formats
    'NIET GERUBRICEERD': StandardClearance.UNCLASSIFIED,
    'DEPARTEMENTAAL VERTROUWELIJK': StandardClearance.RESTRICTED,
    'ZEER GEHEIM': StandardClearance.TOP_SECRET,
    'STGGEHEIM': StandardClearance.TOP_SECRET, // Staatsgeheim
};

/**
 * Polish clearance level mappings
 * Source: Polish Ministry of National Defense classification system
 */
const POLISH_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // Polish classification levels
    'JAWNY': StandardClearance.UNCLASSIFIED,
    'NIEJAWNE': StandardClearance.UNCLASSIFIED,
    'UŻYTEK SŁUŻBOWY': StandardClearance.RESTRICTED, // Official use
    'UZYTEK SLUZBOWY': StandardClearance.RESTRICTED, // Without diacritics
    'ZASTRZEŻONY': StandardClearance.CONFIDENTIAL, // Restricted
    'POUFNY': StandardClearance.CONFIDENTIAL,
    'TAJNY': StandardClearance.SECRET,
    'ŚCIŚLE_TAJNY': StandardClearance.TOP_SECRET,

    // Alternate formats
    'ŚCIŚLE TAJNY': StandardClearance.TOP_SECRET,
    'SCISLE TAJNY': StandardClearance.TOP_SECRET, // Without diacritics
    'ZASTRZEZONY': StandardClearance.CONFIDENTIAL,
};

/**
 * United Kingdom clearance level mappings
 * Source: UK Government Security Classifications
 */
const UK_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // UK classification levels
    'OFFICIAL': StandardClearance.UNCLASSIFIED,
    'OFFICIAL-SENSITIVE': StandardClearance.RESTRICTED,
    'SECRET': StandardClearance.SECRET,
    'TOP_SECRET': StandardClearance.TOP_SECRET,

    // Alternate formats
    'TOP SECRET': StandardClearance.TOP_SECRET,
    'OFFICIAL_SENSITIVE': StandardClearance.RESTRICTED,
    'OFFICIAL SENSITIVE': StandardClearance.RESTRICTED,

    // Legacy classifications (pre-2014)
    'PROTECT': StandardClearance.UNCLASSIFIED,
    'RESTRICTED': StandardClearance.RESTRICTED,
    'CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
};

/**
 * Industry/Commercial clearance level mappings
 * Source: Common commercial classification schemes
 */
const INDUSTRY_CLEARANCE_MAP: Record<string, StandardClearance> = {
    // Industry classification levels
    'PUBLIC': StandardClearance.UNCLASSIFIED,
    'INTERNAL': StandardClearance.RESTRICTED,
    'INTERNAL_USE_ONLY': StandardClearance.RESTRICTED,
    'CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
    'SENSITIVE': StandardClearance.SECRET,
    'HIGHLY_SENSITIVE': StandardClearance.TOP_SECRET,

    // Alternate formats
    'HIGHLY SENSITIVE': StandardClearance.TOP_SECRET,
    'PROPRIETARY': StandardClearance.CONFIDENTIAL,
    'COMPANY_CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
    'RESTRICTED': StandardClearance.RESTRICTED,
};

/**
 * Country-specific clearance mappings
 */
const CLEARANCE_MAPS: Record<string, Record<string, StandardClearance>> = {
    'ESP': SPANISH_CLEARANCE_MAP,
    'FRA': FRENCH_CLEARANCE_MAP,
    'CAN': CANADIAN_CLEARANCE_MAP,
    'DEU': GERMAN_CLEARANCE_MAP,
    'ITA': ITALIAN_CLEARANCE_MAP,
    'NLD': DUTCH_CLEARANCE_MAP,
    'POL': POLISH_CLEARANCE_MAP,
    'GBR': UK_CLEARANCE_MAP,
    'IND': INDUSTRY_CLEARANCE_MAP,
    'USA': {}, // USA already uses English standard
    'NATO': NATO_CLEARANCE_MAP,
};

/**
 * Normalization result interface
 */
export interface IClearanceNormalizationResult {
    /** Original clearance level from source IdP */
    original: string;
    /** Normalized clearance level (English) */
    normalized: StandardClearance;
    /** Country code (ISO 3166-1 alpha-3) */
    country: string;
    /** Whether normalization was applied */
    wasNormalized: boolean;
    /** Confidence level (for audit/debugging) */
    confidence: 'exact' | 'fuzzy' | 'fallback' | 'passthrough';
}

/**
 * Normalize clearance level to standard English equivalent
 * 
 * @param clearance - Original clearance level from IdP
 * @param country - Country code (ESP, FRA, CAN, USA, etc.)
 * @returns Normalization result with original and normalized values
 */
export function normalizeClearance(
    clearance: string,
    country: string
): IClearanceNormalizationResult {
    // Input validation
    if (!clearance || typeof clearance !== 'string') {
        logger.warn('Invalid clearance value provided for normalization', {
            clearance,
            country,
            type: typeof clearance
        });

        return {
            original: clearance || '',
            normalized: StandardClearance.UNCLASSIFIED,
            country,
            wasNormalized: true,
            confidence: 'fallback'
        };
    }

    // Normalize input for matching (uppercase, trim)
    const cleanedClearance = clearance.trim().toUpperCase();
    const cleanedCountry = country ? country.trim().toUpperCase() : '';

    // Check if already in standard format (passthrough)
    if (Object.values(StandardClearance).includes(cleanedClearance as StandardClearance)) {
        logger.debug('Clearance already in standard format', {
            clearance: cleanedClearance,
            country: cleanedCountry
        });

        return {
            original: clearance,
            normalized: cleanedClearance as StandardClearance,
            country: cleanedCountry,
            wasNormalized: false,
            confidence: 'passthrough'
        };
    }

    // Get country-specific mapping
    const countryMap = CLEARANCE_MAPS[cleanedCountry] || {};

    // Try exact match first
    const exactMatch = countryMap[cleanedClearance];
    if (exactMatch) {
        logger.info('Clearance normalized via exact match', {
            original: clearance,
            normalized: exactMatch,
            country: cleanedCountry
        });

        return {
            original: clearance,
            normalized: exactMatch,
            country: cleanedCountry,
            wasNormalized: true,
            confidence: 'exact'
        };
    }

    // Try fuzzy match (remove underscores, spaces, accents)
    const fuzzyKey = cleanedClearance
        .replace(/[_\s-]/g, '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');

    for (const [key, value] of Object.entries(countryMap)) {
        const fuzzyMapKey = key
            .replace(/[_\s-]/g, '')
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '');

        if (fuzzyMapKey === fuzzyKey) {
            logger.info('Clearance normalized via fuzzy match', {
                original: clearance,
                normalized: value,
                country: cleanedCountry,
                matchedKey: key
            });

            return {
                original: clearance,
                normalized: value,
                country: cleanedCountry,
                wasNormalized: true,
                confidence: 'fuzzy'
            };
        }
    }

    // Fallback to UNCLASSIFIED if no match found
    logger.warn('Clearance normalization fallback to UNCLASSIFIED', {
        original: clearance,
        country: cleanedCountry,
        reason: 'No mapping found'
    });

    return {
        original: clearance,
        normalized: StandardClearance.UNCLASSIFIED,
        country: cleanedCountry,
        wasNormalized: true,
        confidence: 'fallback'
    };
}

/**
 * Batch normalize multiple clearances (for performance)
 * 
 * @param clearances - Array of clearances with country codes
 * @returns Array of normalization results
 */
export function normalizeClearances(
    clearances: Array<{ clearance: string; country: string }>
): IClearanceNormalizationResult[] {
    return clearances.map(({ clearance, country }) =>
        normalizeClearance(clearance, country)
    );
}

/**
 * Get all supported countries
 */
export function getSupportedCountries(): string[] {
    return Object.keys(CLEARANCE_MAPS);
}

/**
 * Get clearance mappings for a specific country
 */
export function getCountryMappings(country: string): Record<string, StandardClearance> {
    return CLEARANCE_MAPS[country.toUpperCase()] || {};
}

/**
 * Check if a country has clearance mappings
 */
export function hasCountryMappings(country: string): boolean {
    const mappings = CLEARANCE_MAPS[country.toUpperCase()];
    return mappings !== undefined && Object.keys(mappings).length > 0;
}

/**
 * Validate that a clearance level exists in the standard set
 */
export function isValidStandardClearance(clearance: string): boolean {
    return Object.values(StandardClearance).includes(clearance as StandardClearance);
}

/**
 * Get clearance hierarchy level (for comparison)
 * Returns numeric value: UNCLASSIFIED=0, RESTRICTED=0.5, CONFIDENTIAL=1, SECRET=2, TOP_SECRET=3
 * 
 * CRITICAL: RESTRICTED is now a separate level above UNCLASSIFIED
 * - UNCLASSIFIED users CANNOT access RESTRICTED content
 * - RESTRICTED users CAN access UNCLASSIFIED content
 * - Both remain AAL1 (no MFA required)
 */
export function getClearanceLevel(clearance: StandardClearance): number {
    const levels: Record<StandardClearance, number> = {
        [StandardClearance.UNCLASSIFIED]: 0,
        [StandardClearance.RESTRICTED]: 0.5,
        [StandardClearance.CONFIDENTIAL]: 1,
        [StandardClearance.SECRET]: 2,
        [StandardClearance.TOP_SECRET]: 3,
    };

    return levels[clearance] ?? 0;
}

/**
 * Compare two clearance levels
 * Returns: 1 if a > b, -1 if a < b, 0 if equal
 */
export function compareClearances(a: StandardClearance, b: StandardClearance): number {
    const levelA = getClearanceLevel(a);
    const levelB = getClearanceLevel(b);

    if (levelA > levelB) return 1;
    if (levelA < levelB) return -1;
    return 0;
}

/**
 * Export all mappings for documentation/testing
 */
export const CLEARANCE_MAPPINGS = {
    SPANISH: SPANISH_CLEARANCE_MAP,
    FRENCH: FRENCH_CLEARANCE_MAP,
    CANADIAN: CANADIAN_CLEARANCE_MAP,
    GERMAN: GERMAN_CLEARANCE_MAP,
    ITALIAN: ITALIAN_CLEARANCE_MAP,
    DUTCH: DUTCH_CLEARANCE_MAP,
    POLISH: POLISH_CLEARANCE_MAP,
    UK: UK_CLEARANCE_MAP,
    INDUSTRY: INDUSTRY_CLEARANCE_MAP,
    NATO: NATO_CLEARANCE_MAP,
};

/**
 * Service singleton instance
 */
export const ClearanceNormalizationService = {
    normalizeClearance,
    normalizeClearances,
    getSupportedCountries,
    getCountryMappings,
    hasCountryMappings,
    isValidStandardClearance,
    getClearanceLevel,
    compareClearances,
    StandardClearance,
    CLEARANCE_MAPPINGS,
};

export default ClearanceNormalizationService;
