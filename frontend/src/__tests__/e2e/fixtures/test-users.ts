/**
 * Centralized Test Users for E2E Tests
 * 
 * Based on Terraform configuration in terraform/modules/federated-instance/test-users.tf
 * 
 * User Pattern: testuser-{country}-{1,2,3,4}
 *   1 = UNCLASSIFIED
 *   2 = CONFIDENTIAL
 *   3 = SECRET
 *   4 = TOP_SECRET
 * 
 * Password: TestUser2025!Pilot (from terraform)
 * 
 * MFA Requirements:
 * - Level 1 (UNCLASSIFIED): No MFA (AAL1)
 * - Level 2 (CONFIDENTIAL): OTP required (AAL2)
 * - Level 3 (SECRET): OTP required (AAL2)
 * - Level 4 (TOP_SECRET): WebAuthn required (AAL3)
 */

export interface TestUser {
  username: string;
  password: string;
  email: string;
  clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
  clearanceLevel: 1 | 2 | 3 | 4;
  country: string;
  countryCode: string; // ISO 3166-1 alpha-3
  coi: string[];
  dutyOrg: string;
  mfaRequired: boolean;
  mfaType?: 'otp' | 'webauthn';
  idp: string; // IdP selector button text (e.g., "United States DoD")
  realmName: string;
}

/**
 * Default password for all test users (from terraform/modules/federated-instance/test-users.tf)
 * Override with TEST_USER_PASSWORD env var
 */
export const DEFAULT_TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'TestUser2025!Pilot';

/**
 * Clearance level mapping
 */
export const CLEARANCE_LEVELS = {
  1: { clearance: 'UNCLASSIFIED' as const, coi: [], mfaRequired: false },
  2: { clearance: 'CONFIDENTIAL' as const, coi: [], mfaRequired: true, mfaType: 'otp' as const },
  3: { clearance: 'SECRET' as const, coi: ['NATO'], mfaRequired: true, mfaType: 'otp' as const },
  4: { clearance: 'TOP_SECRET' as const, coi: ['FVEY', 'NATO-COSMIC'], mfaRequired: true, mfaType: 'webauthn' as const },
};

/**
 * USA Test Users (4 users)
 */
export const USA_USERS = {
  LEVEL_1: {
    username: 'testuser-usa-1',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-1@dive-demo.example',
    clearance: 'UNCLASSIFIED',
    clearanceLevel: 1,
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'United States Defense',
    mfaRequired: false,
    idp: 'United States',
    realmName: 'dive-v3-broker',
  },
  LEVEL_2: {
    username: 'testuser-usa-2',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-2@dive-demo.example',
    clearance: 'CONFIDENTIAL',
    clearanceLevel: 2,
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'United States Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United States',
    realmName: 'dive-v3-broker',
  },
  LEVEL_3: {
    username: 'testuser-usa-3',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-3@dive-demo.example',
    clearance: 'SECRET',
    clearanceLevel: 3,
    country: 'United States',
    countryCode: 'USA',
    coi: ['NATO'],
    dutyOrg: 'United States Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United States',
    realmName: 'dive-v3-broker',
  },
  LEVEL_4: {
    username: 'testuser-usa-4',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-4@dive-demo.example',
    clearance: 'TOP_SECRET',
    clearanceLevel: 4,
    country: 'United States',
    countryCode: 'USA',
    coi: ['FVEY', 'NATO-COSMIC'],
    dutyOrg: 'United States Defense',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'United States',
    realmName: 'dive-v3-broker',
  },
} as const satisfies Record<string, TestUser>;

/**
 * France Test Users (4 users)
 */
export const FRA_USERS = {
  LEVEL_1: {
    username: 'testuser-fra-1',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-1@dive-demo.example',
    clearance: 'UNCLASSIFIED',
    clearanceLevel: 1,
    country: 'France',
    countryCode: 'FRA',
    coi: [],
    dutyOrg: 'France Defense',
    mfaRequired: false,
    idp: 'France',
    realmName: 'dive-v3-broker',
  },
  LEVEL_2: {
    username: 'testuser-fra-2',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-2@dive-demo.example',
    clearance: 'CONFIDENTIAL',
    clearanceLevel: 2,
    country: 'France',
    countryCode: 'FRA',
    coi: [],
    dutyOrg: 'France Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'France',
    realmName: 'dive-v3-broker',
  },
  LEVEL_3: {
    username: 'testuser-fra-3',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-3@dive-demo.example',
    clearance: 'SECRET',
    clearanceLevel: 3,
    country: 'France',
    countryCode: 'FRA',
    coi: ['NATO'],
    dutyOrg: 'France Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'France',
    realmName: 'dive-v3-broker',
  },
  LEVEL_4: {
    username: 'testuser-fra-4',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-4@dive-demo.example',
    clearance: 'TOP_SECRET',
    clearanceLevel: 4,
    country: 'France',
    countryCode: 'FRA',
    coi: ['FVEY', 'NATO-COSMIC'],
    dutyOrg: 'France Defense',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'France',
    realmName: 'dive-v3-broker',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Germany Test Users (4 users)
 */
export const DEU_USERS = {
  LEVEL_1: {
    username: 'testuser-deu-1',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-1@dive-demo.example',
    clearance: 'UNCLASSIFIED',
    clearanceLevel: 1,
    country: 'Germany',
    countryCode: 'DEU',
    coi: [],
    dutyOrg: 'Germany Defense',
    mfaRequired: false,
    idp: 'Germany',
    realmName: 'dive-v3-broker',
  },
  LEVEL_2: {
    username: 'testuser-deu-2',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-2@dive-demo.example',
    clearance: 'CONFIDENTIAL',
    clearanceLevel: 2,
    country: 'Germany',
    countryCode: 'DEU',
    coi: [],
    dutyOrg: 'Germany Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Germany',
    realmName: 'dive-v3-broker',
  },
  LEVEL_3: {
    username: 'testuser-deu-3',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-3@dive-demo.example',
    clearance: 'SECRET',
    clearanceLevel: 3,
    country: 'Germany',
    countryCode: 'DEU',
    coi: ['NATO'],
    dutyOrg: 'Germany Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Germany',
    realmName: 'dive-v3-broker',
  },
  LEVEL_4: {
    username: 'testuser-deu-4',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-4@dive-demo.example',
    clearance: 'TOP_SECRET',
    clearanceLevel: 4,
    country: 'Germany',
    countryCode: 'DEU',
    coi: ['FVEY', 'NATO-COSMIC'],
    dutyOrg: 'Germany Defense',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Germany',
    realmName: 'dive-v3-broker',
  },
} as const satisfies Record<string, TestUser>;

/**
 * United Kingdom Test Users (4 users)
 */
export const GBR_USERS = {
  LEVEL_1: {
    username: 'testuser-gbr-1',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-1@dive-demo.example',
    clearance: 'UNCLASSIFIED',
    clearanceLevel: 1,
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: [],
    dutyOrg: 'United Kingdom Defense',
    mfaRequired: false,
    idp: 'United Kingdom',
    realmName: 'dive-v3-broker',
  },
  LEVEL_2: {
    username: 'testuser-gbr-2',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-2@dive-demo.example',
    clearance: 'CONFIDENTIAL',
    clearanceLevel: 2,
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: [],
    dutyOrg: 'United Kingdom Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United Kingdom',
    realmName: 'dive-v3-broker',
  },
  LEVEL_3: {
    username: 'testuser-gbr-3',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-3@dive-demo.example',
    clearance: 'SECRET',
    clearanceLevel: 3,
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: ['NATO'],
    dutyOrg: 'United Kingdom Defense',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United Kingdom',
    realmName: 'dive-v3-broker',
  },
  LEVEL_4: {
    username: 'testuser-gbr-4',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-4@dive-demo.example',
    clearance: 'TOP_SECRET',
    clearanceLevel: 4,
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: ['FVEY', 'NATO-COSMIC'],
    dutyOrg: 'United Kingdom Defense',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'United Kingdom',
    realmName: 'dive-v3-broker',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Industry Partner Test Users (Booz Allen Hamilton for USA)
 */
export const INDUSTRY_USERS = {
  BAH: {
    username: 'contractor.bah',
    password: DEFAULT_TEST_PASSWORD,
    email: 'contractor.bah@bah.com',
    clearance: 'SECRET',
    clearanceLevel: 3,
    country: 'United States',
    countryCode: 'USA',
    coi: ['NATO'],
    dutyOrg: 'Booz Allen Hamilton',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United States',
    realmName: 'dive-v3-broker',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Consolidated Test Users Object
 * Use in tests: import { TEST_USERS } from '../fixtures/test-users';
 * 
 * Access patterns:
 * - TEST_USERS.USA.LEVEL_3 (SECRET)
 * - TEST_USERS.USA.SECRET (alias for LEVEL_3)
 */
export const TEST_USERS = {
  USA: {
    ...USA_USERS,
    // Aliases for backward compatibility
    UNCLASS: USA_USERS.LEVEL_1,
    CONFIDENTIAL: USA_USERS.LEVEL_2,
    SECRET: USA_USERS.LEVEL_3,
    TOP_SECRET: USA_USERS.LEVEL_4,
  },
  FRA: {
    ...FRA_USERS,
    // Aliases for backward compatibility
    UNCLASS: FRA_USERS.LEVEL_1,
    CONFIDENTIAL: FRA_USERS.LEVEL_2,
    SECRET: FRA_USERS.LEVEL_3,
    TOP_SECRET: FRA_USERS.LEVEL_4,
  },
  DEU: {
    ...DEU_USERS,
    // Aliases for backward compatibility
    UNCLASS: DEU_USERS.LEVEL_1,
    CONFIDENTIAL: DEU_USERS.LEVEL_2,
    SECRET: DEU_USERS.LEVEL_3,
    TOP_SECRET: DEU_USERS.LEVEL_4,
  },
  GBR: {
    ...GBR_USERS,
    // Aliases for backward compatibility
    UNCLASS: GBR_USERS.LEVEL_1,
    CONFIDENTIAL: GBR_USERS.LEVEL_2,
    SECRET: GBR_USERS.LEVEL_3,
    TOP_SECRET: GBR_USERS.LEVEL_4,
  },
  INDUSTRY: INDUSTRY_USERS,
} as const;

/**
 * Helper: Get user by username
 */
export function getUserByUsername(username: string): TestUser | undefined {
  for (const countryUsers of Object.values(TEST_USERS)) {
    for (const user of Object.values(countryUsers)) {
      if (user.username === username) {
        return user;
      }
    }
  }
  return undefined;
}

/**
 * Helper: Get all users with a specific clearance level
 */
export function getUsersByClearance(clearance: TestUser['clearance']): TestUser[] {
  const users: TestUser[] = [];
  for (const countryUsers of Object.values(TEST_USERS)) {
    for (const user of Object.values(countryUsers)) {
      if (user.clearance === clearance) {
        users.push(user);
      }
    }
  }
  return users;
}

/**
 * Helper: Get all users by numeric level (1-4)
 */
export function getUsersByLevel(level: 1 | 2 | 3 | 4): TestUser[] {
  const users: TestUser[] = [];
  for (const countryUsers of Object.values(TEST_USERS)) {
    for (const user of Object.values(countryUsers)) {
      if (user.clearanceLevel === level) {
        users.push(user);
      }
    }
  }
  return users;
}

/**
 * Helper: Get all users from a specific country
 */
export function getUsersByCountry(countryCode: string): TestUser[] {
  const users: TestUser[] = [];
  for (const countryUsers of Object.values(TEST_USERS)) {
    for (const user of Object.values(countryUsers)) {
      if (user.countryCode === countryCode) {
        users.push(user);
      }
    }
  }
  return users;
}

/**
 * Helper: Get users without MFA (for quick tests)
 */
export function getUsersWithoutMFA(): TestUser[] {
  const users: TestUser[] = [];
  for (const countryUsers of Object.values(TEST_USERS)) {
    for (const user of Object.values(countryUsers)) {
      if (!user.mfaRequired) {
        users.push(user);
      }
    }
  }
  return users;
}
