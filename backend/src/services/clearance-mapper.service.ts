/**
 * Clearance Mapper Service
 * 
 * Maps national clearance levels to standardized DIVE clearance levels
 * Required for multi-realm MFA enforcement
 * 
 * Task 3: Multi-Realm MFA Expansion
 * Date: October 24, 2025
 */

import { logger } from '../utils/logger';

/**
 * Standardized DIVE clearance levels
 * These are used for MFA enforcement and authorization decisions
 */
export type DiveClearanceLevel =
    | 'UNCLASSIFIED'
    | 'RESTRICTED'
    | 'CONFIDENTIAL'
    | 'SECRET'
    | 'TOP_SECRET';

/**
 * National clearance systems
 */
export type NationalClearanceSystem =
    | 'USA'
    | 'FRA'  // France
    | 'CAN'  // Canada
    | 'GBR'  // United Kingdom
    | 'DEU'  // Germany
    | 'ITA'  // Italy
    | 'ESP'  // Spain
    | 'POL'  // Poland
    | 'NLD'  // Netherlands
    | 'INDUSTRY';  // Industry partners

/**
 * Clearance mapping entry
 */
export interface IClearanceMapping {
    standardLevel: DiveClearanceLevel;
    nationalEquivalents: Record<string, string[]>;
    mfaRequired: boolean;
    description: string;
}

/**
 * Comprehensive clearance equivalency table
 * 
 * Based on NATO STANAG 4774, bilateral security agreements,
 * and national security classification systems
 */
export const CLEARANCE_EQUIVALENCY_TABLE: IClearanceMapping[] = [
    // Level 0: Unclassified
    {
        standardLevel: 'UNCLASSIFIED',
        nationalEquivalents: {
            USA: ['UNCLASSIFIED', 'U'],
            FRA: ['NON CLASSIFIÉ', 'NON CLASSIFIE'],
            CAN: ['UNCLASSIFIED', 'U'],
            GBR: ['UNCLASSIFIED', 'OFFICIAL'],
            DEU: ['OFFEN'],
            ITA: ['NON CLASSIFICATO'],
            ESP: ['NO CLASIFICADO'],
            POL: ['NIEJAWNE'],
            NLD: ['NIET-GERUBRICEERD'],
            INDUSTRY: ['UNCLASSIFIED', 'PUBLIC']
        },
        mfaRequired: false,
        description: 'Public or unclassified information'
    },

    // Level 0.5: Restricted (AAL1 like UNCLASSIFIED, but separate clearance level)
    // CRITICAL: RESTRICTED is above UNCLASSIFIED in the hierarchy
    // - UNCLASSIFIED users CANNOT access RESTRICTED content
    // - RESTRICTED users CAN access UNCLASSIFIED content
    // - Both remain AAL1 (no MFA required)
    {
        standardLevel: 'RESTRICTED',
        nationalEquivalents: {
            USA: ['RESTRICTED', 'FOUO', 'FOR OFFICIAL USE ONLY'],
            FRA: ['DIFFUSION RESTREINTE'],
            CAN: ['PROTECTED A', 'PROTECTED-A'],
            GBR: ['OFFICIAL-SENSITIVE', 'OFFICIAL SENSITIVE'],
            DEU: ['VS-NUR FÜR DEN DIENSTGEBRAUCH', 'VS-NUR FUR DEN DIENSTGEBRAUCH', 'VS-NFD'],
            ITA: ['USO UFFICIALE', 'AD USO UFFICIALE'],
            ESP: ['DIFUSIÓN LIMITADA', 'DIFUSION LIMITADA'],
            POL: ['UŻYTEK SŁUŻBOWY', 'UZYTEK SLUZBOWY'],
            NLD: ['DEPARTEMENTAAL VERTROUWELIJK'],
            INDUSTRY: ['INTERNAL', 'INTERNAL USE ONLY']
        },
        mfaRequired: false,
        description: 'Limited distribution, official use only (AAL1, but above UNCLASSIFIED)'
    },

    // Level 2: Confidential
    {
        standardLevel: 'CONFIDENTIAL',
        nationalEquivalents: {
            USA: ['CONFIDENTIAL', 'C'],
            FRA: [
                'CONFIDENTIEL DÉFENSE',
                'CONFIDENTIEL DEFENSE',
                'CONFIDENTIEL-DÉFENSE',
                'CONFIDENTIEL-DEFENSE',
                'CONFIDENTIAL'
            ],
            CAN: ['CONFIDENTIAL', 'PROTECTED B', 'PROTECTED-B'],
            GBR: ['CONFIDENTIAL'],
            DEU: ['VS-VERTRAULICH'],
            ITA: ['RISERVATO', 'RISERVATISSIMO'],
            ESP: ['CONFIDENCIAL'],
            POL: ['ZASTRZEŻONE', 'ZASTRZEZIONE', 'POUFNE'],
            NLD: ['VERTROUWELIJK'],
            INDUSTRY: ['CONFIDENTIAL', 'PROPRIETARY']
        },
        mfaRequired: true,
        description: 'Information requiring protection'
    },

    // Level 2: Secret
    {
        standardLevel: 'SECRET',
        nationalEquivalents: {
            USA: ['SECRET', 'S'],
            FRA: [
                'SECRET DÉFENSE',
                'SECRET DEFENSE',
                'SECRET-DÉFENSE',
                'SECRET-DEFENSE',
                'SECRET'
            ],
            CAN: ['SECRET', 'PROTECTED C', 'PROTECTED-C'],
            GBR: ['SECRET'],
            DEU: ['GEHEIM'],
            ITA: ['SEGRETO'],
            ESP: ['SECRETO'],
            POL: ['TAJNE'],
            NLD: ['GEHEIM'],
            INDUSTRY: ['SECRET', 'TRADE SECRET']
        },
        mfaRequired: true,
        description: 'Sensitive information requiring strict protection'
    },

    // Level 3: Top Secret
    {
        standardLevel: 'TOP_SECRET',
        nationalEquivalents: {
            USA: ['TOP SECRET', 'TS', 'TOP_SECRET'],
            FRA: [
                'TRÈS SECRET DÉFENSE',
                'TRES SECRET DEFENSE',
                'TRÈS-SECRET-DÉFENSE',
                'TRES-SECRET-DEFENSE',
                'TOP SECRET'
            ],
            CAN: ['TOP SECRET', 'TS', 'TOP_SECRET'],
            GBR: ['TOP SECRET', 'TS'],
            DEU: ['STRENG GEHEIM'],
            ITA: ['SEGRETISSIMO'],
            ESP: ['ALTO SECRETO'],
            POL: ['ŚCIŚLE TAJNE', 'SCISLE TAJNE'],
            NLD: ['ZEER GEHEIM'],
            INDUSTRY: ['TOP SECRET', 'HIGHLY CONFIDENTIAL']
        },
        mfaRequired: true,
        description: 'Highly sensitive information requiring maximum protection'
    }
];

/**
 * Map national clearance level to DIVE standard clearance
 * 
 * Handles both national-specific labels and NATO standard labels.
 * Case-insensitive matching with support for multiple formats.
 * 
 * @param nationalClearance - National clearance level (e.g., "CONFIDENTIEL DÉFENSE")
 * @param country - ISO 3166 alpha-3 country code (e.g., "FRA")
 * @returns DIVE standard clearance level
 */
export function mapNationalClearance(
    nationalClearance: string,
    country: NationalClearanceSystem
): DiveClearanceLevel {
    // Handle null/undefined/empty
    if (!nationalClearance || nationalClearance.trim() === '') {
        logger.warn('Empty clearance provided, defaulting to UNCLASSIFIED', { country });
        return 'UNCLASSIFIED';
    }

    // Normalize input - collapse multiple spaces
    const normalized = nationalClearance.trim().replace(/\s+/g, ' ').toUpperCase();

    logger.debug('Mapping national clearance', {
        nationalClearance,
        country,
        normalized
    });

    // Search equivalency table
    for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
        const countryEquivalents = mapping.nationalEquivalents[country] || [];

        for (const equivalent of countryEquivalents) {
            if (equivalent.toUpperCase() === normalized) {
                logger.info('Clearance mapped successfully', {
                    nationalClearance,
                    country,
                    standardLevel: mapping.standardLevel
                });

                return mapping.standardLevel;
            }
        }
    }

    // Fallback: Check if it's already a standard level
    const standardLevels: DiveClearanceLevel[] = [
        'UNCLASSIFIED',
        'RESTRICTED',
        'CONFIDENTIAL',
        'SECRET',
        'TOP_SECRET'
    ];

    for (const level of standardLevels) {
        if (level === normalized || level.replace('_', ' ') === normalized) {
            logger.info('Clearance already in standard format', {
                nationalClearance,
                standardLevel: level
            });
            return level;
        }
    }

    // Ultimate fallback: return UNCLASSIFIED and log warning
    logger.warn('Unknown clearance level, defaulting to UNCLASSIFIED', {
        nationalClearance,
        country,
        normalized
    });

    return 'UNCLASSIFIED';
}

/**
 * Check if MFA is required for a given clearance level
 * 
 * @param clearance - DIVE standard clearance level
 * @returns true if MFA required, false otherwise
 */
export function isMFARequired(clearance: DiveClearanceLevel): boolean {
    const mapping = CLEARANCE_EQUIVALENCY_TABLE.find(
        m => m.standardLevel === clearance
    );

    return mapping?.mfaRequired ?? true;  // Default to true for safety
}

/**
 * Get all national equivalents for a DIVE clearance level
 * 
 * @param standardLevel - DIVE standard clearance level
 * @param country - ISO 3166 alpha-3 country code (optional, returns all if not specified)
 * @returns Array of national clearance equivalents
 */
export function getNationalEquivalents(
    standardLevel: DiveClearanceLevel,
    country?: NationalClearanceSystem
): string[] {
    const mapping = CLEARANCE_EQUIVALENCY_TABLE.find(
        m => m.standardLevel === standardLevel
    );

    if (!mapping) {
        return [];
    }

    if (country) {
        return mapping.nationalEquivalents[country] || [];
    }

    // Return all equivalents from all countries
    return Object.values(mapping.nationalEquivalents).flat();
}

/**
 * Map clearance from Keycloak token attribute
 * 
 * Handles various formats and provides realm-specific mapping
 * 
 * @param clearanceAttribute - Clearance from Keycloak token
 * @param realmName - Keycloak realm name (e.g., "dive-v3-fra")
 * @returns DIVE standard clearance level
 */
export function mapClearanceFromToken(
    clearanceAttribute: string | string[] | undefined,
    realmName: string
): DiveClearanceLevel {
    // Handle undefined or empty
    if (!clearanceAttribute ||
        (Array.isArray(clearanceAttribute) && clearanceAttribute.length === 0)) {
        logger.warn('No clearance attribute in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Handle array (Keycloak sometimes returns arrays)
    const clearanceValue = Array.isArray(clearanceAttribute)
        ? clearanceAttribute[0]
        : clearanceAttribute;

    // Final check after array extraction
    if (!clearanceValue) {
        logger.warn('Empty clearance value in token, defaulting to UNCLASSIFIED', {
            realmName
        });
        return 'UNCLASSIFIED';
    }

    // Determine country from realm name
    const country = getCountryFromRealm(realmName);

    return mapNationalClearance(clearanceValue, country);
}

/**
 * Extract country code from realm name
 * 
 * @param realmName - Keycloak realm name (e.g., "dive-v3-fra", "usa-realm-broker")
 * @returns National clearance system identifier
 */
export function getCountryFromRealm(realmName: string): NationalClearanceSystem {
    const normalized = realmName.toLowerCase();

    if (normalized.includes('usa') || normalized.includes('us-')) {
        return 'USA';
    }
    if (normalized.includes('fra') || normalized.includes('france')) {
        return 'FRA';
    }
    if (normalized.includes('can') || normalized.includes('canada')) {
        return 'CAN';
    }
    if (normalized.includes('gbr') || normalized.includes('uk') || normalized.includes('britain')) {
        return 'GBR';
    }
    if (normalized.includes('deu') || normalized.includes('germany') || normalized.includes('german')) {
        return 'DEU';
    }
    if (normalized.includes('ita') || normalized.includes('italy') || normalized.includes('italian')) {
        return 'ITA';
    }
    if (normalized.includes('esp') || normalized.includes('spain') || normalized.includes('spanish')) {
        return 'ESP';
    }
    if (normalized.includes('pol') || normalized.includes('poland') || normalized.includes('polish')) {
        return 'POL';
    }
    if (normalized.includes('nld') || normalized.includes('netherlands') || normalized.includes('dutch')) {
        return 'NLD';
    }
    if (normalized.includes('industry') || normalized.includes('partner')) {
        return 'INDUSTRY';
    }

    // Default to USA for unknown realms (including broker)
    logger.warn('Unknown realm, defaulting to USA clearance system', {
        realmName
    });
    return 'USA';
}

/**
 * Validate clearance mapping configuration
 * 
 * Ensures all mappings are properly configured
 * Should be called at service startup
 * 
 * @returns Validation result
 */
export function validateClearanceMapping(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Check that all standard levels are present
    const standardLevels: DiveClearanceLevel[] = [
        'UNCLASSIFIED',
        'RESTRICTED',
        'CONFIDENTIAL',
        'SECRET',
        'TOP_SECRET'
    ];

    const mappedLevels = CLEARANCE_EQUIVALENCY_TABLE.map(m => m.standardLevel);

    for (const level of standardLevels) {
        if (!mappedLevels.includes(level)) {
            errors.push(`Missing mapping for standard level: ${level}`);
        }
    }

    // Check that each mapping has equivalents for all countries
    const requiredCountries: NationalClearanceSystem[] = ['USA', 'FRA', 'CAN', 'GBR', 'DEU', 'ITA', 'ESP', 'POL', 'NLD', 'INDUSTRY'];

    for (const mapping of CLEARANCE_EQUIVALENCY_TABLE) {
        for (const country of requiredCountries) {
            if (!mapping.nationalEquivalents[country] || mapping.nationalEquivalents[country].length === 0) {
                errors.push(`Missing equivalents for ${country} at level ${mapping.standardLevel}`);
            }
        }
    }

    const valid = errors.length === 0;

    if (valid) {
        logger.info('Clearance mapping validation successful', {
            mappingsCount: CLEARANCE_EQUIVALENCY_TABLE.length,
            countriesCount: requiredCountries.length
        });
    } else {
        logger.error('Clearance mapping validation failed', { errors });
    }

    return { valid, errors };
}

