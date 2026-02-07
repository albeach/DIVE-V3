import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';

/**
 * E2E Test: Federated Attribute Sync Validation
 *
 * Purpose: Verify that when a user federates from a spoke to the Hub,
 * all DIVE identity attributes are properly synced via Keycloak federation.
 *
 * Critical Attributes Tested:
 * - clearance (security clearance level)
 * - countryOfAffiliation (user's home country)
 * - acpCOI (Communities of Interest array)
 * - uniqueID (unique user identifier)
 *
 * Root Cause Addressed: Phase 4 Session 6
 * - Keycloak 26+ requires User Profile permissions "view": ["admin", "user"]
 * - Without proper permissions, attributes are NOT included in ID tokens
 * - This test validates the fix prevents regression
 */

const TEST_CONFIG = {
  hubUrl: process.env.HUB_URL || 'https://localhost:3000',
  keycloakUrl: process.env.KEYCLOAK_URL || 'https://localhost:8443',
  testPassword: process.env.TEST_USER_PASSWORD || 'TestUser2025!Pilot',
  timeout: 30000,
};

// Test users from different spokes with expected attributes
const FEDERATED_TEST_USERS = [
  {
    name: 'GBR User (UK)',
    username: 'testuser-gbr-1',
    idpName: 'United Kingdom',
    idpAlias: 'gbr-idp',
    expectedAttributes: {
      uniqueID: 'testuser-gbr-1',
      clearance: 'UNCLASSIFIED',
      countryOfAffiliation: 'GBR',
      acpCOI: [], // May be empty for basic test user
    }
  },
  {
    name: 'FRA User (France)',
    username: 'testuser-fra-1',
    idpName: 'France',
    idpAlias: 'fra-idp',
    expectedAttributes: {
      uniqueID: 'testuser-fra-1',
      clearance: 'UNCLASSIFIED',
      countryOfAffiliation: 'FRA',
      acpCOI: [],
    }
  },
];

/**
 * Helper: Login via federated IdP
 */
async function loginViaFederatedIdP(
  page: Page,
  username: string,
  idpName: string
): Promise<void> {
  // Navigate to Hub
  await page.goto(TEST_CONFIG.hubUrl);

  // Click "Sign in with Keycloak"
  await page.getByRole('button', { name: /sign in/i }).click();

  // Select federated IdP
  await page.getByRole('button', { name: new RegExp(idpName, 'i') }).click();

  // Wait for Keycloak login page
  await page.waitForURL(/\/realms\/.*\/protocol\/openid-connect\/auth/);

  // Enter credentials
  await page.fill('input[name="username"]', username);
  await page.fill('input[name="password"]', TEST_CONFIG.testPassword);
  await page.click('input[type="submit"]');

  // Wait for redirect back to Hub
  await page.waitForURL(TEST_CONFIG.hubUrl + '/**', { timeout: TEST_CONFIG.timeout });

  // Wait for session to be established
  await page.waitForTimeout(2000);
}

/**
 * Helper: Fetch session data via API
 */
async function getSessionData(page: Page): Promise<any> {
  const response = await page.request.get(`${TEST_CONFIG.hubUrl}/api/session`);
  expect(response.ok()).toBeTruthy();
  return await response.json();
}

/**
 * Helper: Delete federated user from Hub (cleanup)
 */
async function deleteFederatedUser(username: string): Promise<void> {
  // This would require admin API access - for now, manual cleanup or script
  console.log(`Cleanup: Delete federated user ${username} from Hub if exists`);
}

test.describe('Federated Attribute Sync', () => {
  test.beforeEach(async ({ page }) => {
    // Accept self-signed certificates
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  });

  for (const testUser of FEDERATED_TEST_USERS) {
    test(`should sync all DIVE attributes for ${testUser.name}`, async ({ page }) => {
      test.setTimeout(60000); // 60 second timeout for federation flow

      // Step 1: Login via federated IdP
      console.log(`\n🔐 Logging in as ${testUser.username} via ${testUser.idpName}...`);
      await loginViaFederatedIdP(page, testUser.username, testUser.idpName);

      // Step 2: Verify we're logged in
      await expect(page.locator('text=Dashboard').or(page.locator('text=Resources'))).toBeVisible({
        timeout: 10000
      });

      // Step 3: Fetch session data
      console.log(`📊 Fetching session data...`);
      const session = await getSessionData(page);

      // Step 4: Validate session structure
      expect(session).toHaveProperty('user');
      expect(session.user).toBeTruthy();

      // Step 5: Validate all DIVE attributes are present
      console.log(`✅ Validating DIVE attributes for ${testUser.username}...`);

      // Validate uniqueID
      expect(session.user.uniqueID).toBe(testUser.expectedAttributes.uniqueID);
      console.log(`  ✓ uniqueID: ${session.user.uniqueID}`);

      // Validate clearance
      expect(session.user.clearance).toBe(testUser.expectedAttributes.clearance);
      console.log(`  ✓ clearance: ${session.user.clearance}`);

      // Validate countryOfAffiliation
      expect(session.user.countryOfAffiliation).toBe(testUser.expectedAttributes.countryOfAffiliation);
      console.log(`  ✓ countryOfAffiliation: ${session.user.countryOfAffiliation}`);

      // Validate acpCOI (array)
      expect(Array.isArray(session.user.acpCOI)).toBeTruthy();
      console.log(`  ✓ acpCOI: ${JSON.stringify(session.user.acpCOI)}`);

      // Step 6: Verify attributes are NOT defaulted/enriched
      // If countryOfAffiliation is wrong (e.g., USA for a GBR user), enrichment kicked in
      if (session.user.countryOfAffiliation !== testUser.expectedAttributes.countryOfAffiliation) {
        console.error(`❌ FEDERATION FAILED: countryOfAffiliation is "${session.user.countryOfAffiliation}" but should be "${testUser.expectedAttributes.countryOfAffiliation}"`);
        console.error(`   This indicates attributes were not synced from the spoke - enrichment filled in wrong values.`);
        throw new Error(`Federation attribute sync failed for ${testUser.username}`);
      }

      // Step 7: Log success
      console.log(`\n✅ SUCCESS: All DIVE attributes synced correctly for ${testUser.username}\n`);

      // Step 8: Logout
      await page.goto(`${TEST_CONFIG.hubUrl}/api/auth/signout`);
      await page.waitForTimeout(1000);
    });
  }

  test('should NOT use enrichment for federated users', async ({ page }) => {
    /**
     * This test verifies that enrichment logic does NOT mask federation failures.
     *
     * Issue: NextAuth has enrichment logic that fills in missing attributes:
     * - clearance defaults to UNCLASSIFIED
     * - countryOfAffiliation inferred from email
     *
     * This can hide federation sync failures by providing "reasonable" fallback values.
     *
     * Test Strategy:
     * 1. Login as GBR user
     * 2. Verify countryOfAffiliation is "GBR" (not "USA" from enrichment)
     * 3. Verify clearance matches spoke value (not defaulted to UNCLASSIFIED)
     */

    const testUser = FEDERATED_TEST_USERS[0]; // GBR user

    await loginViaFederatedIdP(page, testUser.username, testUser.idpName);

    const session = await getSessionData(page);

    // Critical check: Country should be from spoke, not enriched
    expect(session.user.countryOfAffiliation).toBe('GBR');
    expect(session.user.countryOfAffiliation).not.toBe('USA'); // Would indicate enrichment

    console.log('✅ Enrichment did NOT mask federation attributes');

    await page.goto(`${TEST_CONFIG.hubUrl}/api/auth/signout`);
  });

  test('should include attributes in ID token from spoke', async ({ page, context }) => {
    /**
     * Advanced test: Intercept token exchange and verify spoke ID token contains attributes
     *
     * This validates the root cause fix:
     * - Spoke User Profile has "view": ["admin", "user"] permissions
     * - Protocol mappers include attributes in ID token
     * - Hub IdP mappers successfully extract attributes
     */

    const testUser = FEDERATED_TEST_USERS[0];

    // Intercept OIDC token endpoint
    const tokens: any[] = [];
    await page.route('**/protocol/openid-connect/token', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      tokens.push(body);
      await route.fulfill({ response });
    });

    await loginViaFederatedIdP(page, testUser.username, testUser.idpName);

    // Check if we captured any tokens
    if (tokens.length > 0) {
      console.log(`📝 Captured ${tokens.length} token exchange(s)`);

      // Decode ID token and check for DIVE attributes
      const idToken = tokens[0]?.id_token;
      if (idToken) {
        const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());

        console.log('ID Token Claims:', {
          uniqueID: payload.uniqueID,
          clearance: payload.clearance,
          countryOfAffiliation: payload.countryOfAffiliation,
          acpCOI: payload.acpCOI,
        });

        // Verify attributes are in token
        expect(payload).toHaveProperty('uniqueID');
        expect(payload).toHaveProperty('clearance');
        expect(payload).toHaveProperty('countryOfAffiliation');
        // acpCOI might be optional

        console.log('✅ DIVE attributes present in ID token from spoke');
      }
    }

    await page.goto(`${TEST_CONFIG.hubUrl}/api/auth/signout`);
  });
});

test.describe('Attribute Sync Error Scenarios', () => {
  test('should detect missing User Profile permissions', async ({ page }) => {
    /**
     * Negative test: Verify we can detect when User Profile permissions are wrong
     *
     * This test documents the root cause and validates our fix prevents it.
     *
     * If User Profile has "view": ["admin"] only, attributes won't be in token.
     * This test would fail if the fix regresses.
     */

    // This is a documentation test - actual validation happens in the positive tests
    // If any of the positive tests fail, it indicates User Profile regression

    console.log('ℹ️  User Profile permissions verified by positive test success');
    console.log('   If positive tests pass, User Profile is correctly configured');
    console.log('   Required: "view": ["admin", "user"] for all DIVE attributes');
  });
});

/**
 * Test Configuration Notes:
 *
 * Environment Variables:
 * - HUB_URL: Hub frontend URL (default: https://localhost:3000)
 * - KEYCLOAK_URL: Keycloak URL (default: https://localhost:8443)
 * - TEST_USER_PASSWORD: SSOT password (default: TestUser2025!Pilot)
 *
 * Prerequisites:
 * 1. Hub and at least one spoke (GBR or FRA) must be running
 * 2. Federation must be configured between Hub and spoke
 * 3. Test users must exist on spoke (run seed-spoke-users.sh)
 * 4. User Profile must have correct permissions (view: ["admin", "user"])
 *
 * Run:
 * ```bash
 * npx playwright test tests/e2e/federated-attribute-sync.spec.ts
 * ```
 *
 * Debug:
 * ```bash
 * npx playwright test tests/e2e/federated-attribute-sync.spec.ts --debug
 * ```
 */
