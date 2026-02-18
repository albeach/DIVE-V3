/**
 * Global Auth Setup for Playwright
 *
 * Authenticates key test users and saves session state to disk.
 * Subsequent tests load storageState instead of re-authenticating,
 * reducing per-test overhead by ~5-10 seconds.
 *
 * Usage in spec files:
 * ```typescript
 * import { test } from './fixtures/base-test';
 *
 * // Tests in this file reuse the AAL1 session
 * test.use({ storageState: '.auth/aal1.json' });
 * ```
 *
 * The setup project runs before 'chromium' in playwright.config.ts.
 */

import { chromium, FullConfig } from '@playwright/test';
import { TEST_USERS } from './test-users';
import { loginAs } from '../helpers/auth';
import { TEST_CONFIG } from './test-config';
import * as fs from 'fs';
import * as path from 'path';

const AUTH_DIR = path.join(__dirname, '../../../../.auth');

async function globalSetup(config: FullConfig) {
  const baseURL = config.projects[0]?.use?.baseURL || TEST_CONFIG.URLS.BASE;

  // Ensure .auth directory exists
  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
  }

  const browser = await chromium.launch({
    args: [
      '--ignore-certificate-errors',
      '--allow-insecure-localhost',
      '--disable-features=CookiesWithoutSameSiteMustBeSecure',
      '--disable-features=SameSiteByDefaultCookies',
    ],
  });

  try {
    // === AAL1 session (UNCLASSIFIED — no MFA) ===
    await setupSession(browser, baseURL, TEST_USERS.USA.LEVEL_1, 'aal1.json');

    // === AAL2 session (SECRET — OTP via speakeasy or demo mode) ===
    // Only attempt if MFA tests are enabled and infrastructure supports it
    if (TEST_CONFIG.FEATURES.MFA_TESTS) {
      try {
        await setupSession(browser, baseURL, TEST_USERS.USA.LEVEL_3, 'aal2.json', {
          expectMFASetup: true,
        });
      } catch (error) {
        console.warn('[AUTH-SETUP] AAL2 session setup failed (MFA may not be configured):', error);
        console.warn('[AUTH-SETUP] Tests requiring AAL2 will authenticate individually');
      }
    }

    // === Admin session (admin-usa user — uses storageState if available) ===
    // Admin user is only available in CI with specific setup
    if (process.env.CI) {
      try {
        await setupSession(browser, baseURL, {
          username: 'admin-usa',
          password: process.env.ADMIN_PASSWORD || 'Admin123!',
          email: 'admin-usa@dive-ci.test',
          clearance: 'TOP_SECRET',
          clearanceLevel: 4 as const,
          country: 'United States',
          countryCode: 'USA',
          coi: ['FVEY', 'NATO'],
          dutyOrg: 'DIVE Administration',
          mfaRequired: false,
          idp: 'United States',
          realmName: 'dive-v3-broker-usa',
        }, 'admin.json');
      } catch (error) {
        console.warn('[AUTH-SETUP] Admin session setup failed:', error);
        // Clean up partial/invalid admin.json to prevent false-positive hasAuthState checks
        const adminJsonPath = path.join(AUTH_DIR, 'admin.json');
        if (fs.existsSync(adminJsonPath)) {
          fs.unlinkSync(adminJsonPath);
          console.warn('[AUTH-SETUP] Removed partial admin.json');
        }
      }
    }
  } finally {
    await browser.close();
  }

  console.log('[AUTH-SETUP] Global auth setup complete');
}

async function setupSession(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  baseURL: string,
  user: Parameters<typeof loginAs>[1],
  filename: string,
  options?: Parameters<typeof loginAs>[2],
) {
  const context = await browser.newContext({
    baseURL,
    ignoreHTTPSErrors: true,
  });
  const page = await context.newPage();

  try {
    console.log(`[AUTH-SETUP] Setting up ${filename} session for ${user.username}...`);
    await loginAs(page, user, options);

    // Validate session has expected data before saving
    if (filename === 'admin.json') {
      try {
        const session = await page.evaluate(() =>
          fetch('/api/auth/session', { credentials: 'include' }).then(r => r.json())
        );
        const roles = session?.user?.roles || [];
        console.log(`[AUTH-SETUP] Admin session roles:`, roles);
        if (roles.length === 0 || (!roles.includes('admin') && !roles.includes('dive-admin') && !roles.includes('super_admin'))) {
          console.error(`[AUTH-SETUP] ⚠️ Admin session has no admin roles: [${roles.join(', ')}]`);
          console.error('[AUTH-SETUP] This means realm_access.roles is missing from the ID token.');
          console.error('[AUTH-SETUP] Check Keycloak realm roles mapper (id.token.claim must be true).');
          // Do NOT save admin.json — let hasAuthState('ADMIN') return false
          // so admin tests skip cleanly instead of failing with redirect loops
          throw new Error(`Admin session missing admin roles (got: [${roles.join(', ')}])`);
        }
        console.log(`[AUTH-SETUP] ✅ Admin session validated with roles: [${roles.join(', ')}]`);
      } catch (sessionError) {
        // If we can't fetch session or roles are missing, still fail the admin setup
        if (sessionError instanceof Error && sessionError.message.includes('Admin session missing')) {
          throw sessionError;
        }
        console.warn('[AUTH-SETUP] Could not validate admin session:', sessionError);
        // Continue — save the state anyway as a fallback
      }
    }

    await context.storageState({ path: path.join(AUTH_DIR, filename) });
    console.log(`[AUTH-SETUP] ✅ ${filename} saved`);
  } catch (error) {
    console.error(`[AUTH-SETUP] ❌ Failed to setup ${filename}:`, error);
    throw error;
  } finally {
    await page.close();
    await context.close();
  }
}

export default globalSetup;
