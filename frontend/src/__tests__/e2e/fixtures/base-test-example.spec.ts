/**
 * Example: How to Use Base Test Fixture (Prevents Drift)
 * 
 * This example shows the unified approach that prevents:
 * - Hardcoded IdP names
 * - Inline user objects
 * - Missing discovery logic
 * - Inconsistent cleanup
 */

import { test, expect, skipIfNotAvailable } from './fixtures/base-test';

test.describe('Example: Unified Testing Pattern', () => {
  
  // ✅ CORRECT: Use base test with fixtures
  test('USA user authentication', async ({ page, auth, users, idps }) => {
    // IdPs are already discovered (no manual setup needed)
    // Users come from centralized fixture (no drift)
    // Auth helper handles discovery automatically (no manual checks)
    
    await auth.loginAs(users.USA.SECRET, { otpCode: '123456' });
    await expect(page).toHaveURL(/dashboard/);
  });
  
  // ✅ CORRECT: Automatic skip for non-deployed IdPs
  test('FRA user authentication', async ({ page, auth, users, idps }) => {
    skipIfNotAvailable(idps, 'FRA'); // Skips if not deployed
    
    await auth.loginAs(users.FRA.SECRET, { otpCode: '123456' });
    await expect(page).toHaveURL(/dashboard/);
  });
  
  // ✅ CORRECT: Check availability before conditional logic
  test('Multi-country test', async ({ page, auth, users, idps }) => {
    // Test USA (always available)
    await auth.loginAs(users.USA.UNCLASS);
    await expect(page.getByTestId('user-country')).toHaveText('USA');
    await auth.logout();
    
    // Test DEU only if deployed
    if (await auth.isAvailable('DEU')) {
      await auth.loginAs(users.DEU.UNCLASS);
      await expect(page.getByTestId('user-country')).toHaveText('DEU');
      await auth.logout();
    }
    
    // Automatic cleanup happens after test
  });
});

test.describe('Anti-Patterns (DO NOT USE)', () => {
  
  // ❌ WRONG: Don't use raw Playwright test
  // import { test } from '@playwright/test'; // DON'T DO THIS
  
  // ❌ WRONG: Don't create inline user objects
  /*
  test('Wrong pattern', async ({ page }) => {
    const user = {
      username: 'testuser-usa-1',
      password: 'TestUser2025!Pilot',
      idp: 'United States'
      // Missing countryCode! This causes drift!
    };
    await loginAs(page, user); // Will fail
  });
  */
  
  // ❌ WRONG: Don't hardcode IdP names
  /*
  test('Wrong pattern', async ({ page }) => {
    await page.goto('/');
    await page.click('button:has-text("United States")'); // Hardcoded!
    // Breaks if displayName changes
  });
  */
  
  // ❌ WRONG: Don't manually implement discovery
  /*
  test('Wrong pattern', async ({ page }) => {
    // Manual discovery = drift
    const idps = await discoverAvailableIdPs(page);
    if (!isIdPAvailable(idps, 'USA')) {
      test.skip();
    }
    // This should be automatic via fixture!
  });
  */
});

test.describe('Benefits of Unified Approach', () => {
  
  test('No drift - single source of truth', async ({ users }) => {
    // users.USA.SECRET always has correct structure
    expect(users.USA.SECRET).toHaveProperty('countryCode', 'USA');
    expect(users.USA.SECRET).toHaveProperty('clearance', 'SECRET');
    expect(users.USA.SECRET).toHaveProperty('mfaRequired', true);
  });
  
  test('No discovery boilerplate', async ({ idps }) => {
    // idps already discovered automatically
    expect(idps.hub).toBeDefined();
    expect(idps.hub?.code).toBe('USA');
  });
  
  test('Automatic cleanup', async ({ page, auth, users }) => {
    await auth.loginAs(users.USA.UNCLASS);
    // No need for afterEach - fixture handles cleanup
  });
  
  test('Type safety', async ({ users }) => {
    // TypeScript ensures correct user structure
    const user = users.USA.SECRET;
    
    // All fields are type-checked
    const username: string = user.username;
    const clearance: 'UNCLASSIFIED' | 'CONFIDENTIAL' | 'SECRET' | 'TOP_SECRET' = user.clearance;
    const countryCode: string = user.countryCode;
    
    // Prevents typos and missing fields at compile time
  });
});
