/**
 * Base Test Fixture with Unified Discovery & Auth
 * 
 * Prevents drift by providing:
 * - Auto-discovery of available IdPs before each test suite
 * - Pre-configured auth helpers with discovered IdPs
 * - Type-safe test users from centralized fixture
 * - Automatic cleanup between tests
 * 
 * Usage:
 * ```typescript
 * import { test, expect } from './fixtures/base-test';
 * 
 * test('My test', async ({ page, auth, users, idps }) => {
 *   // idps are already discovered
 *   if (!idps.spokes.has('FRA')) {
 *     test.skip('FRA not deployed');
 *   }
 *   
 *   // Use centralized auth
 *   await auth.loginAs(users.USA.SECRET);
 *   
 *   // Your test code
 *   await expect(page).toHaveURL(/dashboard/);
 *   
 *   // Cleanup is automatic
 * });
 * ```
 */

import { test as base, expect } from '@playwright/test';
import * as path from 'path';
import * as fs from 'fs';
import { TEST_USERS, type TestUser } from './test-users';
import {
  loginAs as _loginAs,
  logout as _logout,
  expectLoggedIn as _expectLoggedIn,
  getDiscoveredIdPs
} from '../helpers/auth';
import {
  discoverAvailableIdPs,
  isIdPAvailable,
  getIdPDisplayName,
  type DiscoveredIdPs
} from '../helpers/idp-discovery';
import type { Page } from '@playwright/test';

/** Paths to saved storageState files from auth-setup.ts global setup */
const AUTH_DIR = path.join(__dirname, '../../../../.auth');
export const AUTH_STATE = {
  AAL1: path.join(AUTH_DIR, 'aal1.json'),
  AAL2: path.join(AUTH_DIR, 'aal2.json'),
  ADMIN: path.join(AUTH_DIR, 'admin.json'),
} as const;

/** Check if a storageState file exists (created by global setup) */
export function hasAuthState(level: keyof typeof AUTH_STATE): boolean {
  return fs.existsSync(AUTH_STATE[level]);
}

/**
 * Extended test context with discovery and auth helpers
 */
type TestFixtures = {
  /**
   * Discovered IdPs (hub + spokes)
   * Auto-discovered before each worker starts
   */
  idps: DiscoveredIdPs;
  
  /**
   * Centralized test users (prevents inline user objects)
   */
  users: typeof TEST_USERS;
  
  /**
   * Auth helper with automatic discovery integration
   */
  auth: {
    loginAs: (user: TestUser, options?: { otpCode?: string; skipMFA?: boolean }) => Promise<void>;
    logout: () => Promise<void>;
    expectLoggedIn: (user: TestUser) => Promise<void>;
    isAvailable: (countryCode: string) => Promise<boolean>;
  };
};

type WorkerFixtures = {
  /**
   * Worker-scoped IdP discovery (shared across all tests in worker)
   */
  workerIdPs: DiscoveredIdPs;
};

/**
 * Extended Playwright test with DIVE-specific fixtures
 * 
 * Automatically provides:
 * - idps: Discovered IdPs (auto-detected)
 * - users: TEST_USERS fixture (prevents drift)
 * - auth: Integrated auth helpers (no manual discovery needed)
 */
export const test = base.extend<TestFixtures, WorkerFixtures>({
  /**
   * Worker-scoped discovery (runs once per worker, shared across tests)
   * This is more efficient than discovering per-test
   */
  workerIdPs: [async ({ browser }, use) => {
    console.log('[BASE TEST] Performing worker-scoped IdP discovery...');
    const page = await browser.newPage();
    const idps = await discoverAvailableIdPs(page);
    await page.close();
    
    console.log(`[BASE TEST] ✅ Discovered: Hub (${idps.hub?.code}) + ${idps.count} spokes`);
    for (const [code, idp] of idps.spokes.entries()) {
      console.log(`  ${code}: ${idp.displayName}`);
    }
    
    await use(idps);
  }, { scope: 'worker' }],
  
  /**
   * Test-scoped idps (references worker-scoped discovery)
   */
  idps: async ({ workerIdPs }, use) => {
    await use(workerIdPs);
  },
  
  /**
   * Test-scoped users fixture (always use centralized TEST_USERS)
   */
  users: async ({}, use) => {
    await use(TEST_USERS);
  },
  
  /**
   * Test-scoped auth helper with automatic discovery integration
   */
  auth: async ({ page, workerIdPs }, use) => {
    const authHelper = {
      loginAs: async (user: TestUser, options?: { otpCode?: string; skipMFA?: boolean }) => {
        // Check if IdP is available before attempting login
        if (!await isIdPAvailable(workerIdPs, user.countryCode)) {
          throw new Error(
            `Cannot login as ${user.username}: ${user.countryCode} IdP not deployed. ` +
            `Available: ${workerIdPs.hub?.code} + ${Array.from(workerIdPs.spokes.keys()).join(', ')}`
          );
        }
        
        await _loginAs(page, user, options);
      },
      
      logout: async () => {
        await _logout(page);
      },
      
      expectLoggedIn: async (user: TestUser) => {
        await _expectLoggedIn(page, user);
      },
      
      isAvailable: async (countryCode: string) => {
        return await isIdPAvailable(workerIdPs, countryCode);
      },
    };
    
    await use(authHelper);
    
    // Automatic cleanup after each test
    try {
      await _logout(page);
      console.log('[BASE TEST] ✅ Auto-cleanup: logged out');
    } catch (error) {
      console.log('[BASE TEST] ⚠️ Auto-cleanup failed (user may already be logged out)');
    }
  },
});

/**
 * Re-export expect for convenience
 */
export { expect };

/**
 * Helper: Skip test if IdP not available
 * 
 * Usage:
 * ```typescript
 * test('FRA test', async ({ idps }) => {
 *   skipIfNotAvailable(idps, 'FRA');
 *   // Test code only runs if FRA is deployed
 * });
 * ```
 */
export function skipIfNotAvailable(idps: DiscoveredIdPs, countryCode: string, message?: string): void {
  const available = countryCode === 'USA' 
    ? idps.hub?.available 
    : idps.spokes.has(countryCode);
    
  if (!available) {
    const msg = message || `${countryCode} spoke not deployed`;
    console.log(`[BASE TEST] ⏭️ Skipping test: ${msg}`);
    test.skip(true, msg);
  }
}

/**
 * Helper: Get display name for discovered IdP
 */
export function getDisplayName(idps: DiscoveredIdPs, countryCode: string): string | null {
  return getIdPDisplayName(idps, countryCode);
}
