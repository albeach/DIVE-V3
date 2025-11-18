/**
 * Centralized Test Resources for E2E Tests
 * 
 * Based on backend/src/__tests__/helpers/seed-test-data.ts
 * These resources are automatically seeded in globalSetup.ts
 * 
 * Resource Pattern: test-{classification}-{scenario}
 * 
 * Usage:
 * ```typescript
 * import { TEST_RESOURCES } from '../fixtures/test-resources';
 * 
 * // Test USA user accessing FVEY document
 * await page.goto(`/resources/${TEST_RESOURCES.FVEY_SECRET.resourceId}`);
 * ```
 */

export interface TestResource {
  resourceId: string;
  title: string;
  classification: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  releasabilityTo: string[]; // ISO 3166-1 alpha-3 country codes
  COI: string[]; // Community of Interest tags
  content: string;
  encrypted: boolean;
  description?: string; // E2E test description
}

/**
 * UNCLASSIFIED Test Resources
 */
export const UNCLASSIFIED_RESOURCES = {
  BASIC: {
    resourceId: 'test-unclassified-doc',
    title: 'Test Unclassified Document',
    classification: 'UNCLASSIFIED',
    releasabilityTo: ['USA', 'GBR', 'CAN', 'FRA', 'DEU'],
    COI: [],
    content: 'This is unclassified test content',
    encrypted: false,
    description: 'Basic unclassified document - should be accessible to all users',
  },
} as const satisfies Record<string, TestResource>;

/**
 * SECRET Test Resources
 */
export const SECRET_RESOURCES = {
  BASIC: {
    resourceId: 'test-secret-doc',
    title: 'Test Secret Document',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR', 'CAN'],
    COI: ['FVEY'],
    content: 'This is secret test content',
    encrypted: false,
    description: 'SECRET document releasable to USA/GBR/CAN with FVEY COI',
  },
  USA_ONLY: {
    resourceId: 'test-secret-usa',
    title: 'Test Secret USA Only',
    classification: 'SECRET',
    releasabilityTo: ['USA'],
    COI: ['US-ONLY'],
    content: 'US only secret content',
    encrypted: false,
    description: 'SECRET document releasable ONLY to USA - tests country restriction',
  },
  NATO: {
    resourceId: 'test-secret-nato',
    title: 'Test NATO Secret',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR', 'FRA', 'DEU', 'CAN', 'ESP', 'ITA', 'NLD', 'POL'],
    COI: ['NATO'],
    content: 'NATO coalition document',
    encrypted: false,
    description: 'SECRET NATO document - tests multi-nation releasability',
  },
  FVEY: {
    resourceId: 'test-secret-fvey',
    title: 'Test FVEY Secret',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
    COI: ['FVEY'],
    content: 'Five Eyes intelligence',
    encrypted: false,
    description: 'FVEY intelligence - France should be DENIED',
  },
  FVEY_ONLY: {
    resourceId: 'test-secret-fvey-only',
    title: 'Test FVEY Only',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
    COI: ['FVEY'],
    content: 'FVEY exclusive content',
    encrypted: false,
    description: 'Duplicate FVEY resource for testing',
  },
  USA_GBR_BILATERAL: {
    resourceId: 'test-secret-usa-gbr-only',
    title: 'Test USA-GBR Bilateral',
    classification: 'SECRET',
    releasabilityTo: ['USA', 'GBR'],
    COI: ['GBR-US'],
    content: 'USA-UK bilateral intelligence',
    encrypted: false,
    description: 'Bilateral USA-UK only - Canada should be DENIED',
  },
} as const satisfies Record<string, TestResource>;

/**
 * TOP_SECRET Test Resources
 */
export const TOP_SECRET_RESOURCES = {
  USA_RESTRICTED: {
    resourceId: 'test-top-secret-restricted',
    title: 'Test Top Secret Restricted',
    classification: 'TOP_SECRET',
    releasabilityTo: ['USA'],
    COI: ['US-ONLY'],
    content: 'Top secret restricted content',
    encrypted: false,
    description: 'TOP_SECRET USA only - requires TS clearance + USA nationality',
  },
} as const satisfies Record<string, TestResource>;

/**
 * Consolidated Test Resources
 */
export const TEST_RESOURCES = {
  UNCLASSIFIED: UNCLASSIFIED_RESOURCES,
  SECRET: SECRET_RESOURCES,
  TOP_SECRET: TOP_SECRET_RESOURCES,
} as const;

/**
 * Flat list of all test resources (for iteration)
 */
export const ALL_TEST_RESOURCES: TestResource[] = [
  ...Object.values(UNCLASSIFIED_RESOURCES),
  ...Object.values(SECRET_RESOURCES),
  ...Object.values(TOP_SECRET_RESOURCES),
];

/**
 * Helper: Get resource by ID
 */
export function getResourceById(resourceId: string): TestResource | undefined {
  return ALL_TEST_RESOURCES.find((r) => r.resourceId === resourceId);
}

/**
 * Helper: Get resources by classification
 */
export function getResourcesByClassification(
  classification: TestResource['classification']
): TestResource[] {
  return ALL_TEST_RESOURCES.filter((r) => r.classification === classification);
}

/**
 * Helper: Get resources releasable to a specific country
 */
export function getResourcesReleasableTo(countryCode: string): TestResource[] {
  return ALL_TEST_RESOURCES.filter((r) => r.releasabilityTo.includes(countryCode));
}

/**
 * Helper: Get resources with a specific COI
 */
export function getResourcesByCOI(coi: string): TestResource[] {
  return ALL_TEST_RESOURCES.filter((r) => r.COI.includes(coi));
}

/**
 * Test Scenarios - Expected Authorization Outcomes
 * 
 * Use these to validate authorization decisions in E2E tests
 */
export const TEST_SCENARIOS = {
  /**
   * USA SECRET user accessing FVEY document
   * EXPECTED: ALLOW (clearance: SECRET, country: USA in releasabilityTo, COI: FVEY matches)
   */
  USA_SECRET_FVEY_ALLOW: {
    user: 'testuser-usa-secret',
    resource: TEST_RESOURCES.SECRET.FVEY,
    expectedDecision: 'ALLOW',
    reason: 'User has SECRET clearance, USA nationality, and FVEY COI',
  },
  
  /**
   * France SECRET user accessing FVEY document
   * EXPECTED: DENY (country FRA not in releasabilityTo: [USA, GBR, CAN, AUS, NZL])
   */
  FRA_SECRET_FVEY_DENY: {
    user: 'testuser-fra-secret',
    resource: TEST_RESOURCES.SECRET.FVEY,
    expectedDecision: 'DENY',
    reason: 'Country FRA not in releasabilityTo',
  },
  
  /**
   * Canada UNCLASSIFIED user accessing SECRET document
   * EXPECTED: DENY (clearance insufficient: UNCLASSIFIED < SECRET)
   */
  CAN_UNCLASS_SECRET_DENY: {
    user: 'testuser-can-unclass',
    resource: TEST_RESOURCES.SECRET.BASIC,
    expectedDecision: 'DENY',
    reason: 'Clearance UNCLASSIFIED insufficient for SECRET document',
  },
  
  /**
   * Germany SECRET user accessing NATO document
   * EXPECTED: ALLOW (clearance: SECRET, country: DEU in releasabilityTo, COI: NATO-COSMIC matches)
   */
  DEU_SECRET_NATO_ALLOW: {
    user: 'testuser-deu-secret',
    resource: TEST_RESOURCES.SECRET.NATO,
    expectedDecision: 'ALLOW',
    reason: 'User has SECRET clearance, DEU in NATO releasabilityTo, NATO-COSMIC COI',
  },
  
  /**
   * Industry SECRET user accessing US-ONLY document
   * EXPECTED: DENY (COI mismatch: contractor has [], document requires [US-ONLY])
   */
  INDUSTRY_SECRET_USONLY_DENY: {
    user: 'testuser-industry-secret',
    resource: TEST_RESOURCES.SECRET.USA_ONLY,
    expectedDecision: 'DENY',
    reason: 'Industry user lacks US-ONLY COI',
  },
  
  /**
   * UK TOP_SECRET user accessing TOP_SECRET restricted document
   * EXPECTED: DENY (country: GBR not in releasabilityTo: [USA])
   */
  GBR_TS_USA_RESTRICTED_DENY: {
    user: 'testuser-gbr-ts',
    resource: TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED,
    expectedDecision: 'DENY',
    reason: 'Country GBR not in releasabilityTo (USA only)',
  },
} as const;

/**
 * COI Reference Data (from seed-test-data.ts)
 */
export const TEST_COI_KEYS = {
  'US-ONLY': {
    coiId: 'US-ONLY',
    name: 'US Only',
    memberCountries: ['USA'],
  },
  'CAN-US': {
    coiId: 'CAN-US',
    name: 'Canada-US',
    memberCountries: ['CAN', 'USA'],
  },
  'GBR-US': {
    coiId: 'GBR-US',
    name: 'UK-US',
    memberCountries: ['GBR', 'USA'],
  },
  'FVEY': {
    coiId: 'FVEY',
    name: 'Five Eyes',
    memberCountries: ['USA', 'GBR', 'CAN', 'AUS', 'NZL'],
  },
  'NATO': {
    coiId: 'NATO',
    name: 'NATO',
    memberCountries: [
      'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
      'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
      'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA',
    ],
  },
  'NATO-COSMIC': {
    coiId: 'NATO-COSMIC',
    name: 'NATO COSMIC TOP SECRET',
    memberCountries: [
      'ALB', 'BEL', 'BGR', 'CAN', 'HRV', 'CZE', 'DNK', 'EST', 'FIN', 'FRA',
      'DEU', 'GBR', 'GRC', 'HUN', 'ISL', 'ITA', 'LVA', 'LTU', 'LUX', 'MNE', 'NLD',
      'MKD', 'NOR', 'POL', 'PRT', 'ROU', 'SVK', 'SVN', 'ESP', 'SWE', 'TUR', 'USA',
    ],
  },
  'AUKUS': {
    coiId: 'AUKUS',
    name: 'AUKUS',
    memberCountries: ['AUS', 'GBR', 'USA'],
  },
} as const;


