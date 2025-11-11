/**
 * COI Validation Service
 * 
 * Enforces NATO ACP-240 / STANAG 4774/5636 COI and Releasability Coherence
 * 
 * **UPDATED:** Now uses MongoDB COI Keys collection as single source of truth
 * for COI membership data instead of hardcoded COI_MEMBERSHIP map.
 * 
 * Implements fail-closed validation of:
 * 1. COI mutual exclusivity (US-ONLY ⊥ foreign-sharing COIs)
 * 2. COI superset/subset conflicts (when operator=ANY)
 * 3. Releasability ⊆ COI membership (prevents over-release)
 * 4. Caveat enforcement (NOFORN → US-ONLY + REL USA only)
 * 5. STANAG compliance (label integrity)
 * 
 * Date: October 21, 2025
 */

import { logger } from '../utils/logger';

// Import COI Keys service for dynamic membership lookup
import { getCOIMembershipMap } from './coi-key.service';

// ============================================
// COI Operator Types
// ============================================

/**
 * COI Operator defines how multiple COIs are evaluated
 * - ALL: Requester must have ALL listed COIs (intersection) - more restrictive, prevents widening
 * - ANY: Requester may have ANY listed COI (union) - broader, requires subset/superset checks
 */
export type COIOperator = 'ALL' | 'ANY';

/**
 * Enhanced Security Label with COI Operator
 */
export interface IEnhancedSecurityLabel {
    classification: string;
    releasabilityTo: string[];
    COI: string[];
    coiOperator: COIOperator;
    caveats?: string[];
    originatingCountry?: string;
}

// ============================================
// COI Membership Registry
// ============================================

/**
 * Static COI → Country Membership Map (DEPRECATED - for backwards compatibility only)
 * 
 * **IMPORTANT:** This is maintained for backwards compatibility and testing.
 * Production code should use getCOIMembershipMapFromDB() which queries
 * the MongoDB COI Keys collection as the single source of truth.
 * 
 * @deprecated Use getCOIMembershipMapFromDB() instead
 */
export const COI_MEMBERSHIP: Record<string, Set<string>> = {
    'US-ONLY': new Set(['USA']),
    'CAN-US': new Set(['CAN', 'USA']),
    'GBR-US': new Set(['GBR', 'USA']),
    'FRA-US': new Set(['FRA', 'USA']),
    'FVEY': new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL']),
    'NATO': new Set([
        'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
        'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
        'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
    ]),
    'NATO-COSMIC': new Set([
        // COSMIC TOP SECRET is NATO's highest classification - all NATO members
        'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
        'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
        'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA'
    ]),
    'EU-RESTRICTED': new Set([
        'AUT', 'BEL', 'BGR', 'HRV', 'CYP', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
        'DEU', 'GRC', 'HUN', 'IRL', 'ITA', 'LVA', 'LTU', 'LUX', 'MLT', 'NLD',
        'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE'
    ]),
    'AUKUS': new Set(['AUS', 'GBR', 'USA']),
    'QUAD': new Set(['USA', 'AUS', 'IND', 'JPN']),
    'NORTHCOM': new Set(['USA', 'CAN', 'MEX']),
    'EUCOM': new Set(['USA', 'DEU', 'GBR', 'FRA', 'ITA', 'ESP', 'POL']),
    'PACOM': new Set(['USA', 'JPN', 'KOR', 'AUS', 'NZL', 'PHL']),
    'CENTCOM': new Set(['USA', 'SAU', 'ARE', 'QAT', 'KWT', 'BHR', 'JOR', 'EGY']),
    'SOCOM': new Set(['USA', 'GBR', 'CAN', 'AUS', 'NZL']), // FVEY special ops
    'Alpha': new Set([]), // No country affiliation
    'Beta': new Set([]), // No country affiliation
    'Gamma': new Set([]) // No country affiliation
};

/**
 * Get COI Membership Map from MongoDB (single source of truth)
 * 
 * This replaces the static COI_MEMBERSHIP map with live data from the database.
 * 
 * @returns Promise<Record<string, Set<string>>> Map of COI ID -> Set of country codes
 */
async function getCOIMembershipMapFromDB(): Promise<Record<string, Set<string>>> {
    try {
        const membershipMap = await getCOIMembershipMap();

        // Special handling for NATO-COSMIC (requires NATO membership)
        if (membershipMap['NATO-COSMIC']) {
            // NATO-COSMIC inherits NATO membership
            membershipMap['NATO-COSMIC'] = membershipMap['NATO'] || new Set();
        }

        return membershipMap;
    } catch (error) {
        logger.warn('Failed to load COI membership from database, falling back to static map', { error });
        return COI_MEMBERSHIP; // Fallback for resilience
    }
}

// ============================================
// COI Relationship Definitions
// ============================================

/**
 * Mutual Exclusivity Pairs
 * These COIs MUST NOT coexist (hard deny)
 */
export const MUTUAL_EXCLUSIONS: [string, string[]][] = [
    ['US-ONLY', ['CAN-US', 'GBR-US', 'FRA-US', 'FVEY', 'NATO', 'NATO-COSMIC', 'EU-RESTRICTED', 'AUKUS', 'QUAD', 'NORTHCOM', 'EUCOM', 'PACOM', 'CENTCOM', 'SOCOM']],
    ['EU-RESTRICTED', ['US-ONLY', 'NATO-COSMIC']]
];

/**
 * Subset/Superset Pairs
 * Block these when coiOperator=ANY (prevents accidental widening)
 */
export const SUBSET_SUPERSET_PAIRS: [string, string][] = [
    ['CAN-US', 'FVEY'],
    ['GBR-US', 'FVEY'],
    ['AUKUS', 'FVEY'],
    ['NATO-COSMIC', 'NATO']
];

// ============================================
// Validation Result
// ============================================

export interface IValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

// ============================================
// Core Validation Functions
// ============================================

/**
 * INVARIANT 1: Check mutual exclusivity violations
 */
function checkMutualExclusivity(cois: string[]): string[] {
    const errors: string[] = [];

    for (const [exclusive, forbidden] of MUTUAL_EXCLUSIONS) {
        if (cois.includes(exclusive)) {
            const violations = forbidden.filter(f => cois.includes(f));
            if (violations.length > 0) {
                errors.push(
                    `COI "${exclusive}" cannot be combined with foreign-sharing COIs: ${violations.join(', ')}`
                );
            }
        }
    }

    return errors;
}

/**
 * INVARIANT 2: Check subset/superset conflicts (when operator=ANY)
 */
function checkSubsetSupersetConflicts(cois: string[], operator: COIOperator): string[] {
    const errors: string[] = [];

    if (operator === 'ANY') {
        for (const [subset, superset] of SUBSET_SUPERSET_PAIRS) {
            if (cois.includes(subset) && cois.includes(superset)) {
                errors.push(
                    `Subset+superset COIs [${subset}, ${superset}] invalid with ANY semantics (widens access)`
                );
            }
        }
    }

    return errors;
}

/**
 * INVARIANT 3: Releasability must be subset of COI membership union
 * 
 * NOTE: When COI is empty, releasability alignment check is skipped.
 * Empty COI means "no COI-based restrictions" - not "deny all".
 * 
 * SPECIAL CASE: COIs with no country affiliation (Alpha, Beta, Gamma)
 * These COIs are based on membership only, not country affiliation,
 * so they skip releasability alignment checks.
 */
async function checkReleasabilityAlignment(releasabilityTo: string[], cois: string[]): Promise<string[]> {
    const errors: string[] = [];

    // If no COI tags specified, skip releasability alignment check
    // Empty COI = no COI restrictions (not deny all)
    if (!cois || cois.length === 0) {
        logger.debug('Skipping releasability alignment - no COI tags specified', {
            releasabilityTo,
            note: 'Empty COI allows releasability without COI-based key encryption'
        });
        return errors; // Return empty errors array (validation passes)
    }

    // Get live COI membership data from database
    const membershipMap = await getCOIMembershipMapFromDB();

    // COIs with no country affiliation (membership-based only)
    const noCountryAffiliationCOIs = new Set(['Alpha', 'Beta', 'Gamma']);

    // Compute union of all COI member countries (excluding no-affiliation COIs)
    const union = new Set<string>();
    let hasCountryBasedCOI = false;
    
    for (const coi of cois) {
        // Skip COIs with no country affiliation
        if (noCountryAffiliationCOIs.has(coi)) {
            logger.debug(`Skipping releasability check for no-affiliation COI: ${coi}`);
            continue;
        }

        hasCountryBasedCOI = true;
        let members = membershipMap[coi];

        // Special case: NATO-COSMIC expands to full NATO membership
        if (coi === 'NATO-COSMIC') {
            members = membershipMap['NATO'];
        }

        if (members) {
            members.forEach(m => union.add(m));
        } else {
            errors.push(`Unknown COI: ${coi} (cannot validate releasability)`);
        }
    }

    // If all COIs are no-affiliation COIs, skip releasability alignment check
    if (!hasCountryBasedCOI) {
        logger.debug('All COIs have no country affiliation - skipping releasability alignment', {
            cois,
            releasabilityTo
        });
        return errors;
    }

    // Check if releasabilityTo ⊆ union
    const violations = releasabilityTo.filter(country => !union.has(country));
    if (violations.length > 0) {
        errors.push(
            `Releasability countries [${violations.join(', ')}] not in COI union [${Array.from(union).sort().join(', ')}]`
        );
    }

    return errors;
}

/**
 * INVARIANT 4: Caveat enforcement (NOFORN)
 */
function checkCaveatEnforcement(caveats: string[] | undefined, cois: string[], releasabilityTo: string[]): string[] {
    const errors: string[] = [];

    if (caveats && caveats.includes('NOFORN')) {
        // NOFORN requires US-ONLY and REL TO [USA]
        if (cois.length !== 1 || cois[0] !== 'US-ONLY') {
            errors.push('NOFORN caveat requires COI=[US-ONLY]');
        }
        if (releasabilityTo.length !== 1 || releasabilityTo[0] !== 'USA') {
            errors.push('NOFORN caveat requires releasabilityTo=[USA]');
        }
    }

    return errors;
}

/**
 * INVARIANT 5: Empty releasability check
 */
function checkEmptyReleasability(releasabilityTo: string[]): string[] {
    if (releasabilityTo.length === 0) {
        return ['Empty releasabilityTo (denies all access)'];
    }
    return [];
}

/**
 * INVARIANT 6: Empty COI with explicit caveats check
 */
function checkEmptyCOI(cois: string[], caveats: string[] | undefined): string[] {
    const warnings: string[] = [];

    if (cois.length === 0 && (!caveats || caveats.length === 0)) {
        warnings.push('Empty COI list (no COI-based key encryption)');
    }

    return warnings;
}

// ============================================
// Main Validation Function
// ============================================

/**
 * Validate COI and Releasability Coherence
 * 
 * Enforces all invariants with fail-closed semantics
 * 
 * @param label Security label with COI operator
 * @returns Validation result with errors/warnings
 */
export async function validateCOICoherence(label: IEnhancedSecurityLabel): Promise<IValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    logger.debug('Validating COI coherence', {
        classification: label.classification,
        cois: label.COI,
        operator: label.coiOperator,
        releasabilityTo: label.releasabilityTo,
        caveats: label.caveats
    });

    // Run all invariant checks (note: checkReleasabilityAlignment is now async)
    errors.push(...checkMutualExclusivity(label.COI));
    errors.push(...checkSubsetSupersetConflicts(label.COI, label.coiOperator));
    errors.push(...await checkReleasabilityAlignment(label.releasabilityTo, label.COI));
    errors.push(...checkCaveatEnforcement(label.caveats, label.COI, label.releasabilityTo));
    errors.push(...checkEmptyReleasability(label.releasabilityTo));
    warnings.push(...checkEmptyCOI(label.COI, label.caveats));

    const valid = errors.length === 0;

    if (!valid) {
        logger.warn('COI validation failed', {
            classification: label.classification,
            errors,
            warnings
        });
    }

    return {
        valid,
        errors,
        warnings
    };
}

/**
 * Validate and throw if invalid (for middleware/service use)
 */
export async function validateCOICoherenceOrThrow(label: IEnhancedSecurityLabel): Promise<void> {
    const result = await validateCOICoherence(label);
    if (!result.valid) {
        throw new Error(`COI validation failed: ${result.errors.join('; ')}`);
    }
}

/**
 * Get allowed COIs given mutual exclusivity constraints
 * Used by UI to filter COI picker options
 */
export async function getAllowedCOIs(selectedCOIs: string[]): Promise<string[]> {
    // Get all COIs from database
    const membershipMap = await getCOIMembershipMapFromDB();
    const allCOIs = Object.keys(membershipMap);

    if (selectedCOIs.length === 0) {
        return allCOIs;
    }

    // Check what's forbidden by current selection
    const forbidden = new Set<string>();

    for (const selected of selectedCOIs) {
        // Find mutual exclusions for this COI
        for (const [exclusive, excludedList] of MUTUAL_EXCLUSIONS) {
            if (selected === exclusive) {
                excludedList.forEach(e => forbidden.add(e));
            } else if (excludedList.includes(selected)) {
                forbidden.add(exclusive);
            }
        }
    }

    return allCOIs.filter(coi => !forbidden.has(coi) && !selectedCOIs.includes(coi));
}

/**
 * Get allowed countries given COI selection
 * Used by UI to populate releasability picker
 */
export async function getAllowedCountriesForCOIs(cois: string[]): Promise<string[]> {
    if (cois.length === 0) {
        return []; // No COI = no default countries
    }

    // Get live COI membership data
    const membershipMap = await getCOIMembershipMapFromDB();

    // Union of all COI member countries
    const union = new Set<string>();
    for (const coi of cois) {
        const members = membershipMap[coi];
        if (members) {
            members.forEach(m => union.add(m));
        }
    }

    return Array.from(union).sort();
}

/**
 * Suggest COI operator based on COI selection
 * Helps users avoid accidental widening
 */
export function suggestCOIOperator(cois: string[]): { operator: COIOperator; reason: string } {
    if (cois.length === 0) {
        return { operator: 'ALL', reason: 'Default (no COIs selected)' };
    }

    if (cois.length === 1) {
        return { operator: 'ALL', reason: 'Single COI (operator not applicable)' };
    }

    // Check for subset/superset pairs
    for (const [subset, superset] of SUBSET_SUPERSET_PAIRS) {
        if (cois.includes(subset) && cois.includes(superset)) {
            return {
                operator: 'ALL',
                reason: `Contains subset+superset pair [${subset}, ${superset}] - use ALL to prevent widening`
            };
        }
    }

    // Default to ALL (safer)
    return {
        operator: 'ALL',
        reason: 'Recommended: ALL (more restrictive, prevents accidental over-release)'
    };
}

// ============================================
// Exports
// ============================================

export {
    COI_MEMBERSHIP as COI_COUNTRY_MEMBERSHIP,
    MUTUAL_EXCLUSIONS as COI_MUTUAL_EXCLUSIONS,
    SUBSET_SUPERSET_PAIRS as COI_SUBSET_SUPERSET_PAIRS
};

