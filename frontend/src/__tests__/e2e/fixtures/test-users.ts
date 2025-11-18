/**
 * Centralized Test Users for E2E Tests
 * 
 * Based on Terraform configuration in terraform/all-test-users.tf
 * 44 users total (4 per realm × 11 realms)
 * 
 * User Pattern: testuser-{country}-{clearance}
 * Password: All users share same password (from terraform.tfvars)
 * 
 * MFA Requirements:
 * - UNCLASSIFIED: No MFA (AAL1)
 * - CONFIDENTIAL: OTP required (AAL2)
 * - SECRET: OTP required (AAL2)
 * - TOP_SECRET: WebAuthn required (AAL3)
 */

export interface TestUser {
  username: string;
  password: string;
  email: string;
  clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET';
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
 * Default password for all test users
 * Override with TEST_USER_PASSWORD env var
 */
export const DEFAULT_TEST_PASSWORD = process.env.TEST_USER_PASSWORD || 'Password123!';

/**
 * USA Test Users (4 users)
 */
export const USA_USERS = {
  UNCLASS: {
    username: 'testuser-usa-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-unclass@example.mil',
    clearance: 'UNCLASSIFIED',
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'US_ARMY',
    mfaRequired: false,
    idp: 'United States DoD',
    realmName: 'dive-v3-usa',
  },
  CONFIDENTIAL: {
    username: 'testuser-usa-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-confidential@example.mil',
    clearance: 'CONFIDENTIAL',
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'US_ARMY',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United States DoD',
    realmName: 'dive-v3-usa',
  },
  SECRET: {
    username: 'testuser-usa-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-secret@example.mil',
    clearance: 'SECRET',
    country: 'United States',
    countryCode: 'USA',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'US_ARMY',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'United States DoD',
    realmName: 'dive-v3-usa',
  },
  TOP_SECRET: {
    username: 'testuser-usa-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-usa-ts@example.mil',
    clearance: 'TOP_SECRET',
    country: 'United States',
    countryCode: 'USA',
    coi: ['NATO-COSMIC', 'FVEY', 'CAN-US'],
    dutyOrg: 'US_ARMY',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'United States DoD',
    realmName: 'dive-v3-usa',
  },
} as const satisfies Record<string, TestUser>;

/**
 * France Test Users (4 users)
 */
export const FRA_USERS = {
  UNCLASS: {
    username: 'testuser-fra-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-unclass@example.fr',
    clearance: 'UNCLASSIFIED',
    country: 'France',
    countryCode: 'FRA',
    coi: [],
    dutyOrg: 'FRENCH_AIR_FORCE',
    mfaRequired: false,
    idp: 'France Ministry of Defense',
    realmName: 'dive-v3-fra',
  },
  CONFIDENTIAL: {
    username: 'testuser-fra-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-confidential@example.fr',
    clearance: 'CONFIDENTIAL',
    country: 'France',
    countryCode: 'FRA',
    coi: [],
    dutyOrg: 'FRENCH_AIR_FORCE',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'France Ministry of Defense',
    realmName: 'dive-v3-fra',
  },
  SECRET: {
    username: 'testuser-fra-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-secret@example.fr',
    clearance: 'SECRET',
    country: 'France',
    countryCode: 'FRA',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'FRENCH_AIR_FORCE',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'France Ministry of Defense',
    realmName: 'dive-v3-fra',
  },
  TOP_SECRET: {
    username: 'testuser-fra-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-fra-ts@example.fr',
    clearance: 'TOP_SECRET',
    country: 'France',
    countryCode: 'FRA',
    coi: ['NATO-COSMIC'], // France NOT in FVEY
    dutyOrg: 'FRENCH_AIR_FORCE',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'France Ministry of Defense',
    realmName: 'dive-v3-fra',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Canada Test Users (4 users)
 */
export const CAN_USERS = {
  UNCLASS: {
    username: 'testuser-can-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-can-unclass@example.ca',
    clearance: 'UNCLASSIFIED',
    country: 'Canada',
    countryCode: 'CAN',
    coi: [],
    dutyOrg: 'CANADIAN_ARMED_FORCES',
    mfaRequired: false,
    idp: 'Canadian Armed Forces',
    realmName: 'dive-v3-can',
  },
  CONFIDENTIAL: {
    username: 'testuser-can-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-can-confidential@example.ca',
    clearance: 'CONFIDENTIAL',
    country: 'Canada',
    countryCode: 'CAN',
    coi: [],
    dutyOrg: 'CANADIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Canadian Armed Forces',
    realmName: 'dive-v3-can',
  },
  SECRET: {
    username: 'testuser-can-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-can-secret@example.ca',
    clearance: 'SECRET',
    country: 'Canada',
    countryCode: 'CAN',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'CANADIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Canadian Armed Forces',
    realmName: 'dive-v3-can',
  },
  TOP_SECRET: {
    username: 'testuser-can-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-can-ts@example.ca',
    clearance: 'TOP_SECRET',
    country: 'Canada',
    countryCode: 'CAN',
    coi: ['NATO-COSMIC', 'FVEY', 'CAN-US'],
    dutyOrg: 'CANADIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Canadian Armed Forces',
    realmName: 'dive-v3-can',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Germany Test Users (4 users)
 */
export const DEU_USERS = {
  UNCLASS: {
    username: 'testuser-deu-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-unclass@example.de',
    clearance: 'UNCLASSIFIED',
    country: 'Germany',
    countryCode: 'DEU',
    coi: [],
    dutyOrg: 'BUNDESWEHR',
    mfaRequired: false,
    idp: 'German Bundeswehr',
    realmName: 'dive-v3-deu',
  },
  CONFIDENTIAL: {
    username: 'testuser-deu-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-confidential@example.de',
    clearance: 'CONFIDENTIAL',
    country: 'Germany',
    countryCode: 'DEU',
    coi: [],
    dutyOrg: 'BUNDESWEHR',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'German Bundeswehr',
    realmName: 'dive-v3-deu',
  },
  SECRET: {
    username: 'testuser-deu-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-secret@example.de',
    clearance: 'SECRET',
    country: 'Germany',
    countryCode: 'DEU',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'BUNDESWEHR',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'German Bundeswehr',
    realmName: 'dive-v3-deu',
  },
  TOP_SECRET: {
    username: 'testuser-deu-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-deu-ts@example.de',
    clearance: 'TOP_SECRET',
    country: 'Germany',
    countryCode: 'DEU',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'BUNDESWEHR',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'German Bundeswehr',
    realmName: 'dive-v3-deu',
  },
} as const satisfies Record<string, TestUser>;

/**
 * United Kingdom Test Users (4 users)
 */
export const GBR_USERS = {
  UNCLASS: {
    username: 'testuser-gbr-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-unclass@example.uk',
    clearance: 'UNCLASSIFIED',
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: [],
    dutyOrg: 'UK_MOD',
    mfaRequired: false,
    idp: 'UK Ministry of Defence',
    realmName: 'dive-v3-gbr',
  },
  CONFIDENTIAL: {
    username: 'testuser-gbr-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-confidential@example.uk',
    clearance: 'CONFIDENTIAL',
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: [],
    dutyOrg: 'UK_MOD',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'UK Ministry of Defence',
    realmName: 'dive-v3-gbr',
  },
  SECRET: {
    username: 'testuser-gbr-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-secret@example.uk',
    clearance: 'SECRET',
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'UK_MOD',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'UK Ministry of Defence',
    realmName: 'dive-v3-gbr',
  },
  TOP_SECRET: {
    username: 'testuser-gbr-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-gbr-ts@example.uk',
    clearance: 'TOP_SECRET',
    country: 'United Kingdom',
    countryCode: 'GBR',
    coi: ['NATO-COSMIC', 'FVEY'],
    dutyOrg: 'UK_MOD',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'UK Ministry of Defence',
    realmName: 'dive-v3-gbr',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Italy Test Users (4 users)
 */
export const ITA_USERS = {
  UNCLASS: {
    username: 'testuser-ita-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-ita-unclass@example.it',
    clearance: 'UNCLASSIFIED',
    country: 'Italy',
    countryCode: 'ITA',
    coi: [],
    dutyOrg: 'ITALIAN_ARMED_FORCES',
    mfaRequired: false,
    idp: 'Italian Armed Forces',
    realmName: 'dive-v3-ita',
  },
  CONFIDENTIAL: {
    username: 'testuser-ita-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-ita-confidential@example.it',
    clearance: 'CONFIDENTIAL',
    country: 'Italy',
    countryCode: 'ITA',
    coi: [],
    dutyOrg: 'ITALIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Italian Armed Forces',
    realmName: 'dive-v3-ita',
  },
  SECRET: {
    username: 'testuser-ita-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-ita-secret@example.it',
    clearance: 'SECRET',
    country: 'Italy',
    countryCode: 'ITA',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'ITALIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Italian Armed Forces',
    realmName: 'dive-v3-ita',
  },
  TOP_SECRET: {
    username: 'testuser-ita-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-ita-ts@example.it',
    clearance: 'TOP_SECRET',
    country: 'Italy',
    countryCode: 'ITA',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'ITALIAN_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Italian Armed Forces',
    realmName: 'dive-v3-ita',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Spain Test Users (4 users)
 */
export const ESP_USERS = {
  UNCLASS: {
    username: 'testuser-esp-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-esp-unclass@example.es',
    clearance: 'UNCLASSIFIED',
    country: 'Spain',
    countryCode: 'ESP',
    coi: [],
    dutyOrg: 'SPANISH_ARMED_FORCES',
    mfaRequired: false,
    idp: 'Spanish Armed Forces',
    realmName: 'dive-v3-esp',
  },
  CONFIDENTIAL: {
    username: 'testuser-esp-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-esp-confidential@example.es',
    clearance: 'CONFIDENTIAL',
    country: 'Spain',
    countryCode: 'ESP',
    coi: [],
    dutyOrg: 'SPANISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Spanish Armed Forces',
    realmName: 'dive-v3-esp',
  },
  SECRET: {
    username: 'testuser-esp-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-esp-secret@example.es',
    clearance: 'SECRET',
    country: 'Spain',
    countryCode: 'ESP',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'SPANISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Spanish Armed Forces',
    realmName: 'dive-v3-esp',
  },
  TOP_SECRET: {
    username: 'testuser-esp-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-esp-ts@example.es',
    clearance: 'TOP_SECRET',
    country: 'Spain',
    countryCode: 'ESP',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'SPANISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Spanish Armed Forces',
    realmName: 'dive-v3-esp',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Poland Test Users (4 users)
 */
export const POL_USERS = {
  UNCLASS: {
    username: 'testuser-pol-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-pol-unclass@example.pl',
    clearance: 'UNCLASSIFIED',
    country: 'Poland',
    countryCode: 'POL',
    coi: [],
    dutyOrg: 'POLISH_ARMED_FORCES',
    mfaRequired: false,
    idp: 'Polish Armed Forces',
    realmName: 'dive-v3-pol',
  },
  CONFIDENTIAL: {
    username: 'testuser-pol-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-pol-confidential@example.pl',
    clearance: 'CONFIDENTIAL',
    country: 'Poland',
    countryCode: 'POL',
    coi: [],
    dutyOrg: 'POLISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Polish Armed Forces',
    realmName: 'dive-v3-pol',
  },
  SECRET: {
    username: 'testuser-pol-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-pol-secret@example.pl',
    clearance: 'SECRET',
    country: 'Poland',
    countryCode: 'POL',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'POLISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Polish Armed Forces',
    realmName: 'dive-v3-pol',
  },
  TOP_SECRET: {
    username: 'testuser-pol-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-pol-ts@example.pl',
    clearance: 'TOP_SECRET',
    country: 'Poland',
    countryCode: 'POL',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'POLISH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Polish Armed Forces',
    realmName: 'dive-v3-pol',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Netherlands Test Users (4 users)
 */
export const NLD_USERS = {
  UNCLASS: {
    username: 'testuser-nld-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-nld-unclass@example.nl',
    clearance: 'UNCLASSIFIED',
    country: 'Netherlands',
    countryCode: 'NLD',
    coi: [],
    dutyOrg: 'DUTCH_ARMED_FORCES',
    mfaRequired: false,
    idp: 'Dutch Armed Forces',
    realmName: 'dive-v3-nld',
  },
  CONFIDENTIAL: {
    username: 'testuser-nld-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-nld-confidential@example.nl',
    clearance: 'CONFIDENTIAL',
    country: 'Netherlands',
    countryCode: 'NLD',
    coi: [],
    dutyOrg: 'DUTCH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Dutch Armed Forces',
    realmName: 'dive-v3-nld',
  },
  SECRET: {
    username: 'testuser-nld-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-nld-secret@example.nl',
    clearance: 'SECRET',
    country: 'Netherlands',
    countryCode: 'NLD',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'DUTCH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Dutch Armed Forces',
    realmName: 'dive-v3-nld',
  },
  TOP_SECRET: {
    username: 'testuser-nld-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-nld-ts@example.nl',
    clearance: 'TOP_SECRET',
    country: 'Netherlands',
    countryCode: 'NLD',
    coi: ['NATO-COSMIC'],
    dutyOrg: 'DUTCH_ARMED_FORCES',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Dutch Armed Forces',
    realmName: 'dive-v3-nld',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Industry (Contractor) Test Users (4 users)
 */
export const INDUSTRY_USERS = {
  UNCLASS: {
    username: 'testuser-industry-unclass',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-industry-unclass@contractor.com',
    clearance: 'UNCLASSIFIED',
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'DEFENSE_CONTRACTOR',
    mfaRequired: false,
    idp: 'Industry Partner',
    realmName: 'dive-v3-industry',
  },
  CONFIDENTIAL: {
    username: 'testuser-industry-confidential',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-industry-confidential@contractor.com',
    clearance: 'CONFIDENTIAL',
    country: 'United States',
    countryCode: 'USA',
    coi: [],
    dutyOrg: 'DEFENSE_CONTRACTOR',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Industry Partner',
    realmName: 'dive-v3-industry',
  },
  SECRET: {
    username: 'testuser-industry-secret',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-industry-secret@contractor.com',
    clearance: 'SECRET',
    country: 'United States',
    countryCode: 'USA',
    coi: [], // Industry gets minimal COI
    dutyOrg: 'DEFENSE_CONTRACTOR',
    mfaRequired: true,
    mfaType: 'otp',
    idp: 'Industry Partner',
    realmName: 'dive-v3-industry',
  },
  TOP_SECRET: {
    username: 'testuser-industry-ts',
    password: DEFAULT_TEST_PASSWORD,
    email: 'testuser-industry-ts@contractor.com',
    clearance: 'TOP_SECRET',
    country: 'United States',
    countryCode: 'USA',
    coi: ['FVEY'], // Limited contractor access
    dutyOrg: 'DEFENSE_CONTRACTOR',
    mfaRequired: true,
    mfaType: 'webauthn',
    idp: 'Industry Partner',
    realmName: 'dive-v3-industry',
  },
} as const satisfies Record<string, TestUser>;

/**
 * Consolidated Test Users Object
 * Use in tests: import { TEST_USERS } from '../fixtures/test-users';
 */
export const TEST_USERS = {
  USA: USA_USERS,
  FRA: FRA_USERS,
  CAN: CAN_USERS,
  DEU: DEU_USERS,
  GBR: GBR_USERS,
  ITA: ITA_USERS,
  ESP: ESP_USERS,
  POL: POL_USERS,
  NLD: NLD_USERS,
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


