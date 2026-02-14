/**
 * DIVE V3 - Clearance Normalization Service
 *
 * Normalizes foreign clearance levels to standardized English equivalents
 * for consistent policy evaluation across coalition partners.
 *
 * SSOT: Derives all mappings from CLEARANCE_EQUIVALENCY_TABLE in clearance-mapper.service.ts,
 * which seeds the MongoDB clearance_equivalency collection (the runtime SSOT).
 * This eliminates duplicate mapping tables and ensures consistency.
 *
 * Supports all 32 NATO member nations + partners via the SSOT table.
 *
 * Pattern: Backend enrichment (TypeScript) rather than Keycloak SPI (Java)
 */

import { logger } from '../utils/logger';
import { CLEARANCE_EQUIVALENCY_TABLE } from './clearance-mapper.service';

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
 * Clearance hierarchy — consistent with OPA clearance.rego and authz.middleware.ts
 * RESTRICTED=1 (integer rank, not 0.5)
 */
const CLEARANCE_HIERARCHY: Record<StandardClearance, number> = {
    [StandardClearance.UNCLASSIFIED]: 0,
    [StandardClearance.RESTRICTED]: 1,
    [StandardClearance.CONFIDENTIAL]: 2,
    [StandardClearance.SECRET]: 3,
    [StandardClearance.TOP_SECRET]: 4,
};

/**
 * NATO prefix clearance mappings (not country-specific)
 */
const NATO_CLEARANCE_MAP: Record<string, StandardClearance> = {
    'NATO_UNCLASSIFIED': StandardClearance.UNCLASSIFIED,
    'NATO_RESTRICTED': StandardClearance.RESTRICTED,
    'NATO_CONFIDENTIAL': StandardClearance.CONFIDENTIAL,
    'NATO_SECRET': StandardClearance.SECRET,
    'COSMIC_TOP_SECRET': StandardClearance.TOP_SECRET,
};

/**
 * Build country-specific normalization maps from the SSOT CLEARANCE_EQUIVALENCY_TABLE.
 * Each country gets a map of { nationalValue → StandardClearance }.
 * Built once at module load time.
 */
function buildClearanceMaps(): Record<string, Record<string, StandardClearance>> {
    const maps: Record<string, Record<string, StandardClearance>> = {};

    for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
        const level = mapping.standardLevel as StandardClearance;
        for (const [country, equivalents] of Object.entries(mapping.nationalEquivalents)) {
            if (!maps[country]) {
                maps[country] = {};
            }
            for (const equiv of equivalents) {
                maps[country][equiv.toUpperCase()] = level;
            }
        }
    }

    // Add NATO prefix mappings as a pseudo-country
    maps['NATO'] = { ...NATO_CLEARANCE_MAP };

    return maps;
}

const CLEARANCE_MAPS = buildClearanceMaps();

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

    // Check NATO prefix mappings (country-independent)
    const natoMatch = NATO_CLEARANCE_MAP[cleanedClearance];
    if (natoMatch) {
        return {
            original: clearance,
            normalized: natoMatch,
            country: cleanedCountry,
            wasNormalized: true,
            confidence: 'exact'
        };
    }

    // Get country-specific mapping from SSOT-derived maps
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
 * Get all supported countries (derived from SSOT)
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
 * Returns integer rank: UNCLASSIFIED=0, RESTRICTED=1, CONFIDENTIAL=2, SECRET=3, TOP_SECRET=4
 * Consistent with OPA clearance.rego and authz.middleware.ts
 */
export function getClearanceLevel(clearance: StandardClearance): number {
    return CLEARANCE_HIERARCHY[clearance] ?? 0;
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
 * Export all mappings for documentation/testing (derived from SSOT)
 */
export const CLEARANCE_MAPPINGS = CLEARANCE_MAPS;

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
