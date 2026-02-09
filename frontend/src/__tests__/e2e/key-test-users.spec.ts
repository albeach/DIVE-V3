/**
 * Key Test Users Validation
 *
 * Tests the most important test users across different countries and clearance levels.
 * Uses dynamic IdP discovery to skip tests for non-deployed instances.
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { loginAs, expectLoggedIn, getDiscoveredIdPs } from './helpers/auth';
import { isIdPAvailable, type DiscoveredIdPs } from './helpers/idp-discovery';

// Global discovery cache
let discoveredIdPs: DiscoveredIdPs | null = null;

test.describe('Key Test Users - Multi-Country Authentication', () => {

  // Discover available IdPs before running tests
  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    discoveredIdPs = await getDiscoveredIdPs(page);
    await page.close();
    
    console.log('[KEY USERS] IdP Discovery Complete:');
    console.log(`  Hub: ${discoveredIdPs.hub?.code} available`);
    console.log(`  Spokes: ${discoveredIdPs.count} deployed`);
    for (const [code, idp] of discoveredIdPs.spokes.entries()) {
      console.log(`    ${code}: ${idp.displayName}`);
    }
  });

  test.describe('🇺🇸 USA Users (Known Working)', () => {
    test('USA UNCLASSIFIED - Basic auth', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.UNCLASS);
      await expectLoggedIn(page, TEST_USERS.USA.UNCLASS);
      console.log('✅ USA UNCLASSIFIED authenticated');
    });

    test('USA SECRET - OTP required', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);
      console.log('✅ USA SECRET with OTP authenticated');
    });
  });

  test.describe('🇫🇷 FRA Users (France)', () => {
    test('FRA UNCLASSIFIED - NATO ally', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'FRA'), 'FRA spoke not deployed');
      await loginAs(page, TEST_USERS.FRA.UNCLASS);
      await expectLoggedIn(page, TEST_USERS.FRA.UNCLASS);
      console.log('✅ FRA UNCLASSIFIED authenticated');
    });

    test('FRA SECRET - NATO COI', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'FRA'), 'FRA spoke not deployed');
      await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.FRA.SECRET);
      console.log('✅ FRA SECRET with NATO COI authenticated');
    });
  });

  test.describe('🇩🇪 DEU Users (Germany)', () => {
    test('DEU UNCLASSIFIED - EU member', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'DEU'), 'DEU spoke not deployed');
      await loginAs(page, TEST_USERS.DEU.UNCLASS);
      await expectLoggedIn(page, TEST_USERS.DEU.UNCLASS);
      console.log('✅ DEU UNCLASSIFIED authenticated');
    });

    test('DEU SECRET - NATO COI', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'DEU'), 'DEU spoke not deployed');
      await loginAs(page, TEST_USERS.DEU.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.DEU.SECRET);
      console.log('✅ DEU SECRET with NATO COI authenticated');
    });
  });

  test.describe('🇬🇧 GBR Users (United Kingdom)', () => {
    test('GBR UNCLASSIFIED - FVEY member', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'GBR'), 'GBR spoke not deployed');
      await loginAs(page, TEST_USERS.GBR.UNCLASS);
      await expectLoggedIn(page, TEST_USERS.GBR.UNCLASS);
      console.log('✅ GBR UNCLASSIFIED authenticated');
    });

    test('GBR SECRET - NATO + FVEY COI', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'GBR'), 'GBR spoke not deployed');
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.GBR.SECRET);
      console.log('✅ GBR SECRET with NATO+FVEY COI authenticated');
    });

    test('GBR TOP_SECRET - Full FVEY access', async ({ page }) => {
      test.skip(!discoveredIdPs || !await isIdPAvailable(discoveredIdPs, 'GBR'), 'GBR spoke not deployed');
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await expectLoggedIn(page, TEST_USERS.GBR.TOP_SECRET);
      console.log('✅ GBR TOP_SECRET with FVEY+NATO-COSMIC authenticated');
    });
  });

  test.describe('🏢 Industry Users', () => {
    test('INDUSTRY BAH - Contractor access', async ({ page }) => {
      await loginAs(page, TEST_USERS.INDUSTRY.BAH);
      await expectLoggedIn(page, TEST_USERS.INDUSTRY.BAH);
      console.log('✅ INDUSTRY BAH contractor authenticated');
    });
  });

  test.describe('🔐 Clearance Hierarchy Validation', () => {
    test('UNCLASSIFIED users across countries', async ({ page }) => {
      const unclassUsers = [
        TEST_USERS.USA.UNCLASS,
        TEST_USERS.FRA.UNCLASS,
        TEST_USERS.DEU.UNCLASS,
        TEST_USERS.GBR.UNCLASS
      ];

      for (const user of unclassUsers) {
        expect(user.clearance).toBe('UNCLASSIFIED');
        expect(user.mfaRequired).toBe(false);
        expect(user.coi).toEqual([]);
        console.log(`✅ ${user.countryCode} UNCLASSIFIED: No MFA, No COI`);
      }
    });

    test('SECRET NATO users across countries', async ({ page }) => {
      const secretUsers = [
        TEST_USERS.USA.SECRET,
        TEST_USERS.FRA.SECRET,
        TEST_USERS.DEU.SECRET,
        TEST_USERS.GBR.SECRET
      ];

      for (const user of secretUsers) {
        expect(user.clearance).toBe('SECRET');
        expect(user.mfaRequired).toBe(true);
        expect(user.mfaType).toBe('otp');
        expect(user.coi).toContain('NATO');
        console.log(`✅ ${user.countryCode} SECRET: OTP required, NATO COI`);
      }
    });

    test('TOP_SECRET special access users', async ({ page }) => {
      const topSecretUsers = [
        TEST_USERS.USA.TOP_SECRET,
        TEST_USERS.FRA.TOP_SECRET,
        TEST_USERS.DEU.TOP_SECRET,
        TEST_USERS.GBR.TOP_SECRET
      ];

      for (const user of topSecretUsers) {
        expect(user.clearance).toBe('TOP_SECRET');
        expect(user.mfaRequired).toBe(true);
        console.log(`✅ ${user.countryCode} TOP_SECRET: MFA required, special access`);
      }

      // GBR should have FVEY + NATO-COSMIC
      expect(TEST_USERS.GBR.TOP_SECRET.coi).toEqual(['FVEY', 'NATO-COSMIC']);
      console.log('✅ GBR TOP_SECRET has FVEY + NATO-COSMIC COI');
    });
  });

  test.describe('🌍 Country-Specific Validation', () => {
    test('All countries have consistent user patterns', async ({ page }) => {
      const countries = ['USA', 'FRA', 'DEU', 'GBR'];

      for (const country of countries) {
        const unclass = TEST_USERS[country].UNCLASS;
        const secret = TEST_USERS[country].SECRET;

        // Username patterns
        expect(unclass.username).toBe(`testuser-${country.toLowerCase()}-1`);
        expect(secret.username).toBe(`testuser-${country.toLowerCase()}-3`);

        // Country information
        expect(unclass.countryCode).toBe(country);
        expect(secret.countryCode).toBe(country);

        console.log(`✅ ${country}: Consistent user patterns validated`);
      }
    });

    test('FVEY vs NATO access patterns', async ({ page }) => {
      // NATO-only countries (FRA, DEU)
      const natoOnly = [TEST_USERS.FRA.SECRET, TEST_USERS.DEU.SECRET];
      for (const user of natoOnly) {
        expect(user.coi).toEqual(['NATO']);
        expect(user.coi).not.toContain('FVEY');
        console.log(`✅ ${user.countryCode} SECRET: NATO-only access`);
      }

      // FVEY countries (USA, GBR)
      expect(TEST_USERS.USA.SECRET.coi).toEqual(['NATO']);
      expect(TEST_USERS.GBR.SECRET.coi).toEqual(['NATO']);

      // But GBR TOP_SECRET has FVEY
      expect(TEST_USERS.GBR.TOP_SECRET.coi).toEqual(['FVEY', 'NATO-COSMIC']);

      console.log('✅ FVEY vs NATO access patterns validated');
    });
  });
});

