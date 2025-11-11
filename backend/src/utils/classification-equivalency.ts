/**
 * Classification Equivalency Mapping
 * 
 * ACP-240 Section 4.3: Classification Equivalency
 * "Mappings across nations (e.g., US SECRET = UK SECRET = DE GEHEIM).
 *  Carry original + standardized tags for recipients to enforce equivalents."
 * 
 * Purpose:
 * - Map national classification levels to NATO standard levels
 * - Enable cross-nation security label interpretation
 * - Support coalition information sharing
 * 
 * Reference: NATO STANAG 4774 (Security Labels)
 */

import { logger } from './logger';

/**
 * Classification level (NATO standard + national equivalents)
 */
export type NATOClassificationLevel =
    | 'UNCLASSIFIED'
    | 'NATO_UNCLASSIFIED'
    | 'RESTRICTED'
    | 'CONFIDENTIAL'
    | 'SECRET'
    | 'NATO_SECRET'
    | 'COSMIC_TOP_SECRET';

/**
 * National classification systems
 */
export type NationalClassificationSystem =
    | 'NATO'
    | 'USA'
    | 'GBR'
    | 'FRA'
    | 'CAN'
    | 'DEU'
    | 'AUS'
    | 'NZL'
    | 'ITA'
    | 'ESP'
    | 'POL'
    | 'NLD';

/**
 * Classification equivalency entry
 */
export interface IClassificationEquivalency {
    natoLevel: NATOClassificationLevel;
    nationalEquivalents: Record<NationalClassificationSystem, string>;
    displayOrder: number;
    accessControl: {
        minClearanceRequired: string;
        coiRestrictions?: string[];
    };
}

/**
 * Comprehensive classification equivalency table
 * 
 * Based on NATO STANAG 4774 and bilateral security agreements
 */
export const CLASSIFICATION_EQUIVALENCY_TABLE: IClassificationEquivalency[] = [
    // Level 0: Unclassified
    {
        natoLevel: 'UNCLASSIFIED',
        nationalEquivalents: {
            NATO: 'NATO UNCLASSIFIED',
            USA: 'UNCLASSIFIED',
            GBR: 'UNCLASSIFIED',
            FRA: 'NON CLASSIFIÉ',
            CAN: 'UNCLASSIFIED',
            DEU: 'OFFEN',
            AUS: 'UNCLASSIFIED',
            NZL: 'UNCLASSIFIED',
            ITA: 'NON CLASSIFICATO',
            ESP: 'NO CLASIFICADO',
            POL: 'NIEJAWNE',
            NLD: 'NIET GERUBRICEERD'
        },
        displayOrder: 0,
        accessControl: {
            minClearanceRequired: 'UNCLASSIFIED'
        }
    },

    // Level 1: Restricted (NATO specific)
    {
        natoLevel: 'NATO_UNCLASSIFIED',
        nationalEquivalents: {
            NATO: 'NATO UNCLASSIFIED',
            USA: 'FOUO', // For Official Use Only
            GBR: 'OFFICIAL',
            FRA: 'DIFFUSION RESTREINTE',
            CAN: 'PROTECTED A',
            DEU: 'VS-NUR FÜR DEN DIENSTGEBRAUCH',
            AUS: 'OFFICIAL',
            NZL: 'UNCLASSIFIED',
            ITA: 'USO UFFICIALE',
            ESP: 'USO OFICIAL',
            POL: 'UŻYTEK SŁUŻBOWY',
            NLD: 'DEPARTEMENTAAL VERTROUWELIJK'
        },
        displayOrder: 1,
        accessControl: {
            minClearanceRequired: 'RESTRICTED'
        }
    },

    // Level 1.5: Restricted (DIVE V3 standard)
    {
        natoLevel: 'RESTRICTED',
        nationalEquivalents: {
            NATO: 'NATO RESTRICTED',
            USA: 'RESTRICTED', // For Official Use Only
            GBR: 'OFFICIAL-SENSITIVE',
            FRA: 'DIFFUSION RESTREINTE',
            CAN: 'PROTECTED A',
            DEU: 'VS-NUR FÜR DEN DIENSTGEBRAUCH',
            AUS: 'OFFICIAL',
            NZL: 'UNCLASSIFIED',
            ITA: 'USO UFFICIALE',
            ESP: 'DIFUSIÓN LIMITADA',
            POL: 'UŻYTEK SŁUŻBOWY',
            NLD: 'DEPARTEMENTAAL VERTROUWELIJK'
        },
        displayOrder: 2,
        accessControl: {
            minClearanceRequired: 'RESTRICTED'  // Same AAL as UNCLASSIFIED (AAL1)
        }
    },

    // Level 2: Confidential
    {
        natoLevel: 'CONFIDENTIAL',
        nationalEquivalents: {
            NATO: 'NATO CONFIDENTIAL',
            USA: 'CONFIDENTIAL',
            GBR: 'CONFIDENTIAL',
            FRA: 'CONFIDENTIEL DÉFENSE',
            CAN: 'CONFIDENTIAL',
            DEU: 'VS-VERTRAULICH',
            AUS: 'CONFIDENTIAL',
            NZL: 'CONFIDENTIAL',
            ITA: 'CONFIDENZIALE',
            ESP: 'CONFIDENCIAL',
            POL: 'POUFNE',
            NLD: 'CONFIDENTIEEL'
        },
        displayOrder: 3,
        accessControl: {
            minClearanceRequired: 'CONFIDENTIAL'
        }
    },

    // Level 3: Secret
    {
        natoLevel: 'SECRET',
        nationalEquivalents: {
            NATO: 'NATO SECRET',
            USA: 'SECRET',
            GBR: 'SECRET',
            FRA: 'SECRET DÉFENSE',
            CAN: 'SECRET',
            DEU: 'GEHEIM',
            AUS: 'SECRET',
            NZL: 'SECRET',
            ITA: 'SEGRETO',
            ESP: 'SECRETO',
            POL: 'TAJNE',
            NLD: 'GEHEIM'
        },
        displayOrder: 4,
        accessControl: {
            minClearanceRequired: 'SECRET'
        }
    },

    // Level 4: Top Secret / Cosmic Top Secret
    {
        natoLevel: 'COSMIC_TOP_SECRET',
        nationalEquivalents: {
            NATO: 'COSMIC TOP SECRET',
            USA: 'TOP SECRET',
            GBR: 'TOP SECRET',
            FRA: 'TRÈS SECRET DÉFENSE',
            CAN: 'TOP SECRET',
            DEU: 'STRENG GEHEIM',
            AUS: 'TOP SECRET',
            NZL: 'TOP SECRET',
            ITA: 'SEGRETISSIMO',
            ESP: 'ALTO SECRETO',
            POL: 'ŚCIŚLE TAJNE',
            NLD: 'ZEER GEHEIM'
        },
        displayOrder: 5,
        accessControl: {
            minClearanceRequired: 'TOP_SECRET',
            coiRestrictions: ['NATO-COSMIC']
        }
    }
];

/**
 * Map national classification to NATO standard level
 * 
 * Handles both national-specific labels (GEHEIM, SECRET DÉFENSE) and
 * NATO standard labels (SECRET, CONFIDENTIAL) used by any country.
 * 
 * @param nationalLevel - National or NATO classification
 * @param country - ISO 3166 alpha-3 country code
 * @returns NATO standard level
 */
export function mapToNATOLevel(
    nationalLevel: string,
    country: NationalClassificationSystem
): NATOClassificationLevel | null {
    const normalizedLevel = nationalLevel.toUpperCase().trim();

    // First, try exact national match
    for (const entry of CLASSIFICATION_EQUIVALENCY_TABLE) {
        const nationalEquiv = entry.nationalEquivalents[country];
        
        if (nationalEquiv && normalizedLevel === nationalEquiv.toUpperCase()) {
            logger.debug('Mapped national classification to NATO level', {
                country,
                nationalLevel,
                natoLevel: entry.natoLevel
            });
            return entry.natoLevel;
        }
    }

    // Second, try NATO standard level match (e.g., any country can use "SECRET")
    for (const entry of CLASSIFICATION_EQUIVALENCY_TABLE) {
        if (normalizedLevel === entry.natoLevel.replace(/_/g, ' ')) {
            logger.debug('Mapped NATO standard level', {
                country,
                nationalLevel,
                natoLevel: entry.natoLevel
            });
            return entry.natoLevel;
        }
    }

    // Third, try simplified matching (CONFIDENTIAL, SECRET, etc.)
    const simplifiedMatches: Record<string, NATOClassificationLevel> = {
        'UNCLASSIFIED': 'UNCLASSIFIED',
        'CONFIDENTIAL': 'CONFIDENTIAL',
        'SECRET': 'SECRET',
        'TOP SECRET': 'COSMIC_TOP_SECRET',
        'TOPSECRET': 'COSMIC_TOP_SECRET'
    };

    if (simplifiedMatches[normalizedLevel]) {
        return simplifiedMatches[normalizedLevel];
    }

    logger.warn('No equivalency found for classification', {
        country,
        nationalLevel,
        recommendation: 'Using original classification (may need manual review)'
    });

    return null;
}

/**
 * Map NATO level to national classification
 * 
 * @param natoLevel - NATO standard level
 * @param country - Target country
 * @returns National classification label
 */
export function mapFromNATOLevel(
    natoLevel: NATOClassificationLevel,
    country: NationalClassificationSystem
): string {
    const entry = CLASSIFICATION_EQUIVALENCY_TABLE.find(e => e.natoLevel === natoLevel);

    if (!entry) {
        logger.warn('NATO level not found in equivalency table', { natoLevel });
        return natoLevel; // Return as-is
    }

    const nationalEquiv = entry.nationalEquivalents[country];
    
    if (!nationalEquiv) {
        logger.warn('No national equivalent for country', { natoLevel, country });
        return natoLevel; // Fallback to NATO level
    }

    logger.debug('Mapped NATO level to national classification', {
        natoLevel,
        country,
        nationalLevel: nationalEquiv
    });

    return nationalEquiv;
}

/**
 * Get all equivalent classifications for a NATO level
 * 
 * @param natoLevel - NATO standard level
 * @returns Map of country → national classification
 */
export function getAllEquivalents(
    natoLevel: NATOClassificationLevel
): Record<string, string> | null {
    const entry = CLASSIFICATION_EQUIVALENCY_TABLE.find(e => e.natoLevel === natoLevel);
    return entry ? entry.nationalEquivalents : null;
}

/**
 * Check if two classifications are equivalent
 * 
 * @param level1 - First classification
 * @param country1 - First country
 * @param level2 - Second classification
 * @param country2 - Second country
 * @returns True if equivalent, false otherwise
 */
export function areEquivalent(
    level1: string,
    country1: NationalClassificationSystem,
    level2: string,
    country2: NationalClassificationSystem
): boolean {
    // Map both to NATO level
    const natoLevel1 = mapToNATOLevel(level1, country1);
    const natoLevel2 = mapToNATOLevel(level2, country2);

    if (!natoLevel1 || !natoLevel2) {
        return false; // Cannot determine equivalency
    }

    const equivalent = natoLevel1 === natoLevel2;

    logger.debug('Classification equivalency check', {
        level1,
        country1,
        natoLevel1,
        level2,
        country2,
        natoLevel2,
        equivalent
    });

    return equivalent;
}

/**
 * Normalize classification to DIVE V3 standard format
 * 
 * DIVE V3 uses simplified NATO levels:
 * - UNCLASSIFIED
 * - CONFIDENTIAL
 * - SECRET
 * - TOP_SECRET
 * 
 * @param nationalLevel - National classification
 * @param country - Country code
 * @returns DIVE V3 standard classification
 */
export function normalizeToDIVEStandard(
    nationalLevel: string,
    country: NationalClassificationSystem
): 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET' {
    const natoLevel = mapToNATOLevel(nationalLevel, country);

    switch (natoLevel) {
        case 'UNCLASSIFIED':
        case 'NATO_UNCLASSIFIED':
        case 'RESTRICTED':
            return 'UNCLASSIFIED';

        case 'CONFIDENTIAL':
            return 'CONFIDENTIAL';

        case 'SECRET':
        case 'NATO_SECRET':
            return 'SECRET';

        case 'COSMIC_TOP_SECRET':
            return 'TOP_SECRET';

        default:
            // Fail-secure: Default to UNCLASSIFIED if unknown
            logger.warn('Unknown classification, defaulting to UNCLASSIFIED', {
                nationalLevel,
                country,
                natoLevel
            });
            return 'UNCLASSIFIED';
    }
}

/**
 * Get display marking with national equivalent
 * 
 * Example: "SECRET (US) / SECRET DÉFENSE (FR)"
 * 
 * @param classification - DIVE V3 classification
 * @param originCountry - Originating country
 * @param targetCountry - Target country (optional)
 * @returns Display marking with equivalents
 */
export function getDisplayMarkingWithEquivalent(
    classification: string,
    originCountry: NationalClassificationSystem,
    targetCountry?: NationalClassificationSystem
): string {
    // Map to NATO level
    const natoLevel = mapToNATOLevel(classification, originCountry);

    if (!natoLevel) {
        return classification; // Return as-is
    }

    if (!targetCountry || originCountry === targetCountry) {
        // Single country display
        return `${classification} (${originCountry})`;
    }

    // Dual country display
    const targetEquivalent = mapFromNATOLevel(natoLevel, targetCountry);
    return `${classification} (${originCountry}) / ${targetEquivalent} (${targetCountry})`;
}

/**
 * Validate classification against country's system
 * 
 * @param classification - Classification label
 * @param country - Country code
 * @returns Validation result
 */
export function validateClassificationForCountry(
    classification: string,
    country: NationalClassificationSystem
): {
    valid: boolean;
    natoLevel?: NATOClassificationLevel;
    error?: string;
} {
    const natoLevel = mapToNATOLevel(classification, country);

    if (!natoLevel) {
        return {
            valid: false,
            error: `Classification "${classification}" not recognized for country ${country}`
        };
    }

    return {
        valid: true,
        natoLevel
    };
}

/**
 * Get equivalency table for display/documentation
 */
export function getEquivalencyTable(): IClassificationEquivalency[] {
    return CLASSIFICATION_EQUIVALENCY_TABLE;
}

/**
 * Export for testing
 */
export const __testing__ = {
    CLASSIFICATION_EQUIVALENCY_TABLE
};

