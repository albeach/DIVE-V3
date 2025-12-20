/**
 * DIVE V3 - Dynamic Releasability Types
 *
 * Phase 3: Replaces static releasabilityTo arrays with rule-based computation.
 *
 * Benefits:
 * - New federation partner → immediately sees NATO resources (if NATO member)
 * - Partner suspended → immediately loses access (no stale permissions)
 * - No MongoDB updates needed when federation changes
 *
 * @version 1.0.0
 * @date 2025-12-20
 */

// ============================================
// RELEASABILITY RULE TYPES
// ============================================

/**
 * Dynamic releasability rules for resources
 *
 * Instead of static `releasabilityTo: ["USA", "GBR", "FRA"]`,
 * resources can define rules that compute releasability at authorization time.
 */
export interface IReleasabilityRules {
  /**
   * Type of releasability rule
   *
   * - explicit: Specific countries listed (legacy behavior)
   * - coi-based: Any country with matching COI membership
   * - bilateral: Any country with approved bilateral agreement
   * - multilateral: Any member of a multilateral group (NATO, FVEY, AUKUS)
   */
  type: 'explicit' | 'coi-based' | 'bilateral' | 'multilateral';

  /**
   * For 'explicit' type: Specific countries (ISO 3166-1 alpha-3)
   * Example: ["USA", "GBR", "CAN"]
   */
  countries?: string[];

  /**
   * For 'coi-based' type: Required COI membership
   * Resource is releasable to any country that is member of ALL listed COIs
   * Example: ["NATO-COSMIC"] → only NATO members with COSMIC access
   */
  requiredCOI?: string[];

  /**
   * For 'coi-based' type: Match mode
   * - all: Country must be member of ALL listed COIs (default)
   * - any: Country must be member of at least ONE listed COI
   */
  coiMatchMode?: 'all' | 'any';

  /**
   * For 'bilateral' type: Require approved spoke with bilateral trust
   * If true, resource is releasable to any country with 'bilateral' or 'national' trust level
   */
  requiresBilateralAgreement?: boolean;

  /**
   * For 'multilateral' type: Multilateral group membership
   * - NATO: All 32 NATO member nations
   * - FVEY: Five Eyes (USA, GBR, CAN, AUS, NZL)
   * - AUKUS: Australia, UK, US
   */
  multilateralGroup?: 'NATO' | 'FVEY' | 'AUKUS';

  /**
   * Optional: Additional explicit countries to always include
   * Useful for "NATO + specific bilateral partners" scenarios
   */
  additionalCountries?: string[];

  /**
   * Optional: Countries to explicitly exclude
   * Useful for "NATO except Turkey" scenarios
   */
  excludeCountries?: string[];
}

// ============================================
// MULTILATERAL GROUP DEFINITIONS
// ============================================

/**
 * NATO member countries (32 members as of 2024)
 * ISO 3166-1 alpha-3 codes
 */
export const NATO_MEMBERS: readonly string[] = [
  'USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ITA', 'ESP', 'NLD', 'POL', 'BEL',
  'NOR', 'DNK', 'CZE', 'PRT', 'HUN', 'GRC', 'TUR', 'ROU', 'BGR', 'HRV',
  'SVK', 'SVN', 'LTU', 'LVA', 'EST', 'ALB', 'MNE', 'MKD', 'FIN', 'SWE',
  'ISL', 'LUX'
] as const;

/**
 * Five Eyes alliance members
 */
export const FVEY_MEMBERS: readonly string[] = [
  'USA', 'GBR', 'CAN', 'AUS', 'NZL'
] as const;

/**
 * AUKUS alliance members
 */
export const AUKUS_MEMBERS: readonly string[] = [
  'USA', 'GBR', 'AUS'
] as const;

/**
 * Get members of a multilateral group
 */
export function getMultilateralGroupMembers(group: 'NATO' | 'FVEY' | 'AUKUS'): string[] {
  switch (group) {
    case 'NATO':
      return [...NATO_MEMBERS];
    case 'FVEY':
      return [...FVEY_MEMBERS];
    case 'AUKUS':
      return [...AUKUS_MEMBERS];
    default:
      return [];
  }
}

// ============================================
// RESOURCE WITH DYNAMIC RELEASABILITY
// ============================================

/**
 * Extended resource interface with dynamic releasability rules
 */
export interface IResourceWithRules {
  resourceId: string;
  title?: string;
  classification: string;
  COI: string[];
  creationDate?: string;
  encrypted?: boolean;

  /**
   * Static releasability (deprecated, for backward compatibility)
   * Will be used if releasabilityRules is not present
   */
  releasabilityTo?: string[];

  /**
   * Dynamic releasability rules (preferred)
   * Computed at authorization time based on current federation state
   */
  releasabilityRules?: IReleasabilityRules;

  /**
   * Industry access control (ACP-240 Section 4.2)
   */
  releasableToIndustry?: boolean;
}

// ============================================
// COMPUTATION RESULT
// ============================================

/**
 * Result of releasability computation
 */
export interface IReleasabilityComputeResult {
  /**
   * Computed list of countries (ISO 3166-1 alpha-3)
   */
  countries: string[];

  /**
   * Source of computation
   */
  source: 'explicit' | 'coi-based' | 'bilateral' | 'multilateral' | 'static';

  /**
   * Timestamp of computation
   */
  computedAt: Date;

  /**
   * Debug info for troubleshooting
   */
  debug?: {
    rulesApplied?: IReleasabilityRules;
    excluded?: string[];
    added?: string[];
  };
}

