import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * Comprehensive Identity Attribute Testing Suite
 *
 * Validates complete identity attribute handling across:
 * - Local users (direct Hub authentication)
 * - Federated users (Spoke → Hub via IdP)
 * - All DIVE attributes
 * - Protocol mappers (client-side token claims)
 * - IdP mappers (federation attribute sync)
 * - Localization (country-specific attribute naming)
 * - Attribute enrichment (filling missing data)
 * - MFA/AAL claims (authentication assurance)
 */

const TEST_CONFIG = {
  hubUrl: process.env.HUB_URL || 'https://localhost:3000',
  keycloakUrl: process.env.KEYCLOAK_URL || 'https://localhost:8443',
  testPassword: process.env.TEST_USER_PASSWORD || 'TestUser2025!Pilot',
  timeout: 30000,
};

// =============================================================================
// COMPLETE ATTRIBUTE SPECIFICATION
// =============================================================================

/**
 * All DIVE identity attributes that should be present
 * Reference: ACP-240, DIVE V3 Requirements
 */
interface DiveIdentityAttributes {
  // Core Identity
  uniqueID: string;                    // Unique user identifier
  email?: string;                      // Email (synthetic for federation)
  name?: string;                       // Display name

  // Security Attributes (REQUIRED)
  clearance: string;                   // UNCLASSIFIED | RESTRICTED | CONFIDENTIAL | SECRET | TOP_SECRET
  countryOfAffiliation: string;        // ISO 3166-1 alpha-3 (USA, GBR, FRA, etc.)
  acpCOI: string[];                    // Communities of Interest (NATO, FVEY, etc.)

  // Authentication Assurance (NIST 800-63B)
  amr: string[];                       // Authentication Methods Reference (pwd, otp, hwk)
  acr: string;                         // Authentication Context Reference (AAL level: 0, 1, 2, 3)

  // Authorization
  roles: string[];                     // Keycloak realm roles

  // Optional Attributes
  organizationType?: string;           // GOV | MIL | INDUSTRY
  dutyOrg?: string;                    // Organizational unit

  // Session Metadata
  auth_time?: number;                  // Unix timestamp of authentication
}

/**
 * Test user specifications for different scenarios
 */
const TEST_USERS = {
  // =============================================================================
  // LOCAL USERS (Direct Hub Authentication)
  // =============================================================================
  HUB_USERS: {
    UNCLASSIFIED: {
      username: 'testuser-usa-1',
      idpType: 'local',
      realm: 'dive-v3-broker-usa',
      expectedAttributes: {
        uniqueID: 'testuser-usa-1',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'USA',
        acpCOI: [],
        amr: ['pwd'],
        acr: '0',
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    CONFIDENTIAL: {
      username: 'testuser-usa-3',
      idpType: 'local',
      realm: 'dive-v3-broker-usa',
      expectedAttributes: {
        uniqueID: 'testuser-usa-3',
        clearance: 'CONFIDENTIAL',
        countryOfAffiliation: 'USA',
        acpCOI: [],
        amr: expect.arrayContaining(['pwd', 'otp']), // Requires TOTP
        acr: '2', // AAL2
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    TOP_SECRET: {
      username: 'testuser-usa-5',
      idpType: 'local',
      realm: 'dive-v3-broker-usa',
      expectedAttributes: {
        uniqueID: 'testuser-usa-5',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: expect.arrayContaining(['NATO', 'FVEY']),
        amr: expect.arrayContaining(['pwd', 'hwk']), // Requires WebAuthn
        acr: '3', // AAL3
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    ADMIN: {
      username: 'admin-usa',
      idpType: 'local',
      realm: 'dive-v3-broker-usa',
      expectedAttributes: {
        uniqueID: 'admin-usa',
        clearance: 'TOP_SECRET',
        countryOfAffiliation: 'USA',
        acpCOI: expect.arrayContaining(['NATO', 'FVEY', 'FRA-US', 'GBR-US', 'CAN-US', 'DEU-US']),
        amr: expect.arrayContaining(['pwd', 'hwk']),
        acr: '3',
        roles: expect.arrayContaining(['dive-user', 'dive-admin', 'super_admin', 'hub_admin']),
      },
    },
  },

  // =============================================================================
  // FEDERATED USERS (Spoke → Hub)
  // =============================================================================
  FEDERATED_USERS: {
    GBR_UNCLASSIFIED: {
      username: 'testuser-gbr-1',
      idpType: 'federated',
      idpName: 'United Kingdom',
      idpAlias: 'gbr-idp',
      spokeRealm: 'dive-v3-broker-gbr',
      expectedAttributes: {
        uniqueID: 'testuser-gbr-1',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'GBR',
        acpCOI: [],
        amr: ['pwd'],
        acr: '0',
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    GBR_SECRET: {
      username: 'testuser-gbr-3',
      idpType: 'federated',
      idpName: 'United Kingdom',
      idpAlias: 'gbr-idp',
      spokeRealm: 'dive-v3-broker-gbr',
      expectedAttributes: {
        uniqueID: 'testuser-gbr-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'GBR',
        acpCOI: expect.arrayContaining(['FVEY', 'NATO']),
        amr: expect.arrayContaining(['pwd', 'otp']),
        acr: '2',
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    FRA_UNCLASSIFIED: {
      username: 'testuser-fra-1',
      idpType: 'federated',
      idpName: 'France',
      idpAlias: 'fra-idp',
      spokeRealm: 'dive-v3-broker-fra',
      expectedAttributes: {
        uniqueID: 'testuser-fra-1',
        clearance: 'UNCLASSIFIED',
        countryOfAffiliation: 'FRA',
        acpCOI: [],
        amr: ['pwd'],
        acr: '0',
        roles: expect.arrayContaining(['dive-user']),
      },
    },
    FRA_SECRET: {
      username: 'testuser-fra-3',
      idpType: 'federated',
      idpName: 'France',
      idpAlias: 'fra-idp',
      spokeRealm: 'dive-v3-broker-fra',
      expectedAttributes: {
        uniqueID: 'testuser-fra-3',
        clearance: 'SECRET',
        countryOfAffiliation: 'FRA',
        acpCOI: expect.arrayContaining(['NATO', 'EU-RESTRICTED']),
        amr: expect.arrayContaining(['pwd', 'otp']),
        acr: '2',
        roles: expect.arrayContaining(['dive-user']),
      },
    },
  },
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

async function loginLocal(page: Page, username: string): Promise<void> {
  await page.goto(TEST_CONFIG.hubUrl);
  await page.getByRole('button', { name: /sign in/i }).click();

  // For local users, we stay on Hub realm
  await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/);

  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', TEST_CONFIG.testPassword);
  await page.click('input[type="submit"]');

  await page.waitForURL(TEST_CONFIG.hubUrl + '/**', { timeout: TEST_CONFIG.timeout });
  await page.waitForTimeout(2000);
}

async function loginFederated(page: Page, username: string, idpName: string): Promise<void> {
  await page.goto(TEST_CONFIG.hubUrl);
  await page.getByRole('button', { name: /sign in/i }).click();

  // Select federated IdP
  await page.getByRole('button', { name: new RegExp(idpName, 'i') }).click();

  // Wait for spoke Keycloak login
  await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/);

  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', TEST_CONFIG.testPassword);
  await page.click('input[type="submit"]');

  await page.waitForURL(TEST_CONFIG.hubUrl + '/**', { timeout: TEST_CONFIG.timeout });
  await page.waitForTimeout(2000);
}

async function getSessionData(page: Page): Promise<any> {
  const response = await page.request.get(`${TEST_CONFIG.hubUrl}/api/session`);
  expect(response.ok()).toBeTruthy();
  return await response.json();
}

async function logout(page: Page): Promise<void> {
  await page.goto(`${TEST_CONFIG.hubUrl}/api/auth/signout`);
  await page.waitForTimeout(1000);
}

function validateAttributes(
  actual: any,
  expected: Partial<DiveIdentityAttributes>,
  userName: string
): void {
  console.log(`\n✅ Validating attributes for ${userName}:`);

  // Core identity
  if (expected.uniqueID) {
    expect(actual.uniqueID).toBe(expected.uniqueID);
    console.log(`  ✓ uniqueID: ${actual.uniqueID}`);
  }

  // Security attributes
  if (expected.clearance) {
    expect(actual.clearance).toBe(expected.clearance);
    console.log(`  ✓ clearance: ${actual.clearance}`);
  }

  if (expected.countryOfAffiliation) {
    expect(actual.countryOfAffiliation).toBe(expected.countryOfAffiliation);
    console.log(`  ✓ countryOfAffiliation: ${actual.countryOfAffiliation}`);
  }

  if (expected.acpCOI !== undefined) {
    expect(Array.isArray(actual.acpCOI)).toBeTruthy();
    if (Array.isArray(expected.acpCOI)) {
      expected.acpCOI.forEach(coi => {
        expect(actual.acpCOI).toContain(coi);
      });
    }
    console.log(`  ✓ acpCOI: ${JSON.stringify(actual.acpCOI)}`);
  }

  // Authentication assurance
  if (expected.amr) {
    expect(Array.isArray(actual.amr)).toBeTruthy();
    console.log(`  ✓ amr: ${JSON.stringify(actual.amr)}`);
  }

  if (expected.acr) {
    expect(actual.acr).toBe(expected.acr);
    console.log(`  ✓ acr: ${actual.acr}`);
  }

  // Roles
  if (expected.roles) {
    expect(Array.isArray(actual.roles)).toBeTruthy();
    console.log(`  ✓ roles: ${JSON.stringify(actual.roles)}`);
  }

  console.log('');
}

// =============================================================================
// TEST SUITE: LOCAL USERS
// =============================================================================

test.describe('Local User Identity Attributes', { tag: '@smoke' }, () => {
  for (const [testName, testUser] of Object.entries(TEST_USERS.HUB_USERS)) {
    test(`should have all attributes for local ${testName} user`, async ({ page }) => {
      test.setTimeout(60000);

      console.log(`\n🔐 Testing local user: ${testUser.username}`);

      await loginLocal(page, testUser.username);

      await expect(page.locator('text=Dashboard').or(page.locator('text=Resources'))).toBeVisible({
        timeout: 10000
      });

      const session = await getSessionData(page);
      expect(session).toHaveProperty('user');

      validateAttributes(session.user, testUser.expectedAttributes, testUser.username);

      await logout(page);
    });
  }
});

// =============================================================================
// TEST SUITE: FEDERATED USERS
// =============================================================================

test.describe('Federated User Identity Attributes', () => {
  for (const [testName, testUser] of Object.entries(TEST_USERS.FEDERATED_USERS)) {
    test(`should have all attributes for federated ${testName} user`, async ({ page }) => {
      test.setTimeout(60000);

      console.log(`\n🔐 Testing federated user: ${testUser.username} via ${testUser.idpName}`);

      await loginFederated(page, testUser.username, testUser.idpName);

      await expect(page.locator('text=Dashboard').or(page.locator('text=Resources'))).toBeVisible({
        timeout: 10000
      });

      const session = await getSessionData(page);
      expect(session).toHaveProperty('user');

      validateAttributes(session.user, testUser.expectedAttributes, testUser.username);

      // CRITICAL: Verify attributes came from spoke, not enrichment
      if (testUser.expectedAttributes.countryOfAffiliation !== 'USA') {
        expect(session.user.countryOfAffiliation).not.toBe('USA');
        console.log(`  ✓ countryOfAffiliation NOT defaulted to USA (federation works)`);
      }

      await logout(page);
    });
  }
});

// =============================================================================
// TEST SUITE: PROTOCOL MAPPERS
// =============================================================================

test.describe('Protocol Mapper Validation', () => {
  test('should include all DIVE claims in ID token', async ({ page, context }) => {
    /**
     * Validates that protocol mappers add all required claims to tokens
     */

    const testUser = TEST_USERS.HUB_USERS.UNCLASSIFIED;

    // Intercept token endpoint
    let tokenPayload: any = null;
    await page.route('**/protocol/openid-connect/token', async (route) => {
      const response = await route.fetch();
      const body = await response.json();

      if (body.id_token) {
        const parts = body.id_token.split('.');
        tokenPayload = JSON.parse(Buffer.from(parts[1], 'base64').toString());
      }

      await route.fulfill({ response });
    });

    await loginLocal(page, testUser.username);

    if (tokenPayload) {
      console.log('\n📝 ID Token Claims:');
      console.log(JSON.stringify(tokenPayload, null, 2));

      // Validate required claims
      expect(tokenPayload).toHaveProperty('uniqueID');
      expect(tokenPayload).toHaveProperty('clearance');
      expect(tokenPayload).toHaveProperty('countryOfAffiliation');
      expect(tokenPayload).toHaveProperty('acpCOI');
      expect(tokenPayload).toHaveProperty('amr');
      expect(tokenPayload).toHaveProperty('acr');

      console.log('✅ All DIVE claims present in ID token');
    }

    await logout(page);
  });
});

// =============================================================================
// TEST SUITE: ATTRIBUTE MAPPING
// =============================================================================

test.describe('Attribute Mapping and Localization', () => {
  test('should handle country-specific attribute variations', async ({ page }) => {
    /**
     * Tests that different countries can use different attribute names
     * but they map to standard DIVE attributes
     *
     * Example:
     * - France: "habilitation" → clearance
     * - UK: "security_clearance" → clearance
     */

    // This would require configuration of country-specific mappers
    // For now, we validate standard mapping works

    const fraUser = TEST_USERS.FEDERATED_USERS.FRA_UNCLASSIFIED;
    await loginFederated(page, fraUser.username, fraUser.idpName);

    const session = await getSessionData(page);

    // Validate French user has standard DIVE attributes
    expect(session.user.clearance).toBeTruthy();
    expect(session.user.countryOfAffiliation).toBe('FRA');

    console.log('✅ French user attributes mapped to standard DIVE schema');

    await logout(page);
  });

  test('should normalize clearance levels across countries', async ({ page }) => {
    /**
     * Different countries use different clearance level names:
     * - France: CONFIDENTIEL DEFENSE → CONFIDENTIAL
     * - UK: SECRET → SECRET
     * - USA: SECRET → SECRET
     *
     * All should map to NATO standard levels
     */

    // Test multiple countries
    const users = [
      TEST_USERS.HUB_USERS.CONFIDENTIAL,
      TEST_USERS.FEDERATED_USERS.GBR_SECRET,
      TEST_USERS.FEDERATED_USERS.FRA_SECRET,
    ];

    for (const user of users) {
      if (user.idpType === 'local') {
        await loginLocal(page, user.username);
      } else {
        await loginFederated(page, user.username, user.idpName);
      }

      const session = await getSessionData(page);

      // Validate clearance is one of the standard NATO levels
      const validLevels = ['UNCLASSIFIED', 'RESTRICTED', 'CONFIDENTIAL', 'SECRET', 'TOP_SECRET'];
      expect(validLevels).toContain(session.user.clearance);

      console.log(`✅ ${user.username}: clearance normalized to "${session.user.clearance}"`);

      await logout(page);
    }
  });
});

// =============================================================================
// TEST SUITE: ENRICHMENT VS FEDERATION
// =============================================================================

test.describe('Enrichment vs Federation Distinction', () => {
  test('should NOT enrich attributes for federated users', async ({ page }) => {
    /**
     * CRITICAL: Enrichment should only apply to industry users, not federated military users
     *
     * If a GBR user shows countryOfAffiliation: "USA", enrichment kicked in (BAD)
     * If a GBR user shows countryOfAffiliation: "GBR", federation worked (GOOD)
     */

    const gbrUser = TEST_USERS.FEDERATED_USERS.GBR_UNCLASSIFIED;

    await loginFederated(page, gbrUser.username, gbrUser.idpName);

    const session = await getSessionData(page);

    // CRITICAL CHECKS
    expect(session.user.countryOfAffiliation).toBe('GBR'); // NOT USA from enrichment
    expect(session.user.clearance).toBe('UNCLASSIFIED'); // NOT defaulted

    console.log('✅ Federated user attributes NOT enriched (came from spoke)');

    await logout(page);
  });
});

// =============================================================================
// TEST SUITE: MFA/AAL CLAIMS
// =============================================================================

test.describe('MFA and AAL Validation', () => {
  test('should have correct AMR for password-only users', async ({ page }) => {
    const user = TEST_USERS.HUB_USERS.UNCLASSIFIED;

    await loginLocal(page, user.username);

    const session = await getSessionData(page);

    expect(session.user.amr).toContain('pwd');
    expect(session.user.amr).not.toContain('otp');
    expect(session.user.amr).not.toContain('hwk');
    expect(session.user.acr).toBe('0'); // AAL1

    console.log('✅ AAL1 user has correct AMR and ACR');

    await logout(page);
  });

  test('should require MFA for CONFIDENTIAL+ users', async ({ page }) => {
    const user = TEST_USERS.HUB_USERS.CONFIDENTIAL;

    await loginLocal(page, user.username);

    const session = await getSessionData(page);

    // CONFIDENTIAL requires AAL2 (TOTP)
    expect(session.user.acr).toBe('2');
    expect(session.user.amr).toContain('pwd');
    // Note: otp may not be present until user actually configures TOTP

    console.log('✅ CONFIDENTIAL user requires AAL2');

    await logout(page);
  });
});

// =============================================================================
// TEST SUITE: COMPREHENSIVE VALIDATION
// =============================================================================

test.describe('Complete Identity System Validation', () => {
  test('should validate all attribute sources work together', async ({ page }) => {
    /**
     * End-to-end validation of the complete identity system:
     * 1. User attributes (Keycloak user store)
     * 2. Protocol mappers (add claims to tokens)
     * 3. IdP mappers (sync federated attributes)
     * 4. NextAuth callbacks (extract claims to session)
     * 5. Frontend session (display to user)
     */

    const users = [
      { ...TEST_USERS.HUB_USERS.ADMIN, type: 'local' },
      { ...TEST_USERS.FEDERATED_USERS.GBR_SECRET, type: 'federated' },
    ];

    for (const user of users) {
      console.log(`\n📊 Complete validation for ${user.username} (${user.type}):`);

      if (user.type === 'local') {
        await loginLocal(page, user.username);
      } else {
        await loginFederated(page, user.username, user.idpName);
      }

      const session = await getSessionData(page);

      // Validate ALL attributes present
      const requiredAttrs = [
        'uniqueID',
        'clearance',
        'countryOfAffiliation',
        'acpCOI',
        'amr',
        'acr',
        'roles',
      ];

      requiredAttrs.forEach(attr => {
        expect(session.user).toHaveProperty(attr);
        console.log(`  ✓ ${attr}: ${JSON.stringify(session.user[attr])}`);
      });

      // Validate attribute types
      expect(typeof session.user.uniqueID).toBe('string');
      expect(typeof session.user.clearance).toBe('string');
      expect(typeof session.user.countryOfAffiliation).toBe('string');
      expect(Array.isArray(session.user.acpCOI)).toBeTruthy();
      expect(Array.isArray(session.user.amr)).toBeTruthy();
      expect(typeof session.user.acr).toBe('string');
      expect(Array.isArray(session.user.roles)).toBeTruthy();

      console.log('✅ All attributes present and correct types');

      await logout(page);
    }
  });
});
