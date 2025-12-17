/**
 * Adaptive Authentication Helpers for DIVE Instances
 *
 * Handles different authentication patterns across hub-spoke deployments:
 * - Direct IdP selection (hub-like)
 * - Federation redirects (spoke-to-hub)
 * - Local authentication (spoke-specific)
 * - Auto-detection of available auth methods
 */

import { Page, expect } from '@playwright/test';
import { TestUser } from '../fixtures/test-users';
import { TEST_CONFIG } from '../fixtures/test-config';

/**
 * Adaptive login that tries multiple authentication approaches
 */
export async function adaptiveLoginAs(
  page: Page,
  user: TestUser,
  options?: {
    otpCode?: string;
    skipMFA?: boolean;
    expectMFASetup?: boolean;
    instanceCode?: string; // 'alb', 'dnk', 'gbr', 'rou', 'hub'
  }
): Promise<void> {
  const { otpCode, skipMFA = false, expectMFASetup = false, instanceCode } = options || {};

  console.log(`[ADAPTIVE-AUTH] Attempting login for ${user.username} on ${instanceCode || 'unknown'} instance`);

  try {
    // Step 1: Navigate to home page
    console.log('[ADAPTIVE-AUTH] Step 1: Navigating to home page');
    await page.goto('/', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded'
    });

    // Step 2: Try different authentication approaches
    const authResult = await tryAuthenticationMethods(page, user, instanceCode);

    if (!authResult.success) {
      throw new Error(`All authentication methods failed: ${authResult.errors.join(', ')}`);
    }

    // Step 3: Handle MFA if required
    if (user.mfaRequired && !skipMFA && authResult.needsMFA) {
      console.log(`[ADAPTIVE-AUTH] Step 3: Handling MFA (${user.mfaType})`);

      if (expectMFASetup) {
        await handleMFASetup(page, user, otpCode);
      } else {
        await handleMFALogin(page, user, otpCode);
      }
    } else {
      console.log('[ADAPTIVE-AUTH] Step 3: No MFA required');
    }

    // Step 4: Verify successful authentication
    console.log('[ADAPTIVE-AUTH] Step 4: Verifying authentication');
    await verifyAuthentication(page, user);

  } catch (error) {
    console.error(`[ADAPTIVE-AUTH] Login failed for ${user.username}:`, error);
    throw error;
  }
}

/**
 * Try multiple authentication methods in order of preference
 */
async function tryAuthenticationMethods(page: Page, user: TestUser, instanceCode?: string): Promise<{
  success: boolean;
  method?: string;
  needsMFA?: boolean;
  errors: string[];
}> {
  const errors: string[] = [];

  // Method 1: Try direct IdP selection (works on hub and some spokes)
  try {
    console.log('[ADAPTIVE-AUTH] Trying direct IdP selection...');
    const result = await tryDirectIdP(page, user);
    if (result.success) {
      return { success: true, method: 'direct-idp', needsMFA: result.needsMFA, errors };
    }
    errors.push('direct-idp failed');
  } catch (error) {
    errors.push(`direct-idp error: ${error.message}`);
  }

  // Method 2: Try federation approach (spoke-to-hub)
  if (instanceCode && instanceCode !== 'hub') {
    try {
      console.log('[ADAPTIVE-AUTH] Trying federation approach...');
      const result = await tryFederationAuth(page, user, instanceCode);
      if (result.success) {
        return { success: true, method: 'federation', needsMFA: result.needsMFA, errors };
      }
      errors.push('federation failed');
    } catch (error) {
      errors.push(`federation error: ${error.message}`);
    }
  }

  // Method 3: Try local authentication (instance-specific)
  try {
    console.log('[ADAPTIVE-AUTH] Trying local authentication...');
    const result = await tryLocalAuth(page, user, instanceCode);
    if (result.success) {
      return { success: true, method: 'local', needsMFA: result.needsMFA, errors };
    }
    errors.push('local-auth failed');
  } catch (error) {
    errors.push(`local-auth error: ${error.message}`);
  }

  // Method 4: Try generic login form
  try {
    console.log('[ADAPTIVE-AUTH] Trying generic login form...');
    const result = await tryGenericLogin(page, user);
    if (result.success) {
      return { success: true, method: 'generic', needsMFA: result.needsMFA, errors };
    }
    errors.push('generic-login failed');
  } catch (error) {
    errors.push(`generic-login error: ${error.message}`);
  }

  return { success: false, errors };
}

/**
 * Try direct IdP button selection
 */
async function tryDirectIdP(page: Page, user: TestUser): Promise<{ success: boolean; needsMFA?: boolean }> {
  // Look for IdP selector button (various patterns)
  const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
    .or(page.getByRole('link', { name: new RegExp(user.idp, 'i') }))
    .or(page.locator(`button:has-text("${user.idp}")`))
    .first();

  const buttonExists = await idpButton.count() > 0;
  if (!buttonExists) {
    throw new Error(`IdP button "${user.idp}" not found`);
  }

  await idpButton.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  await idpButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

  // Wait for Keycloak redirect
  await page.waitForURL(/.*keycloak.*|.*\/realms\/.*/, {
    timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
  });

  // Fill Keycloak login form
  await fillKeycloakLogin(page, user);

  return { success: true, needsMFA: user.mfaRequired };
}

/**
 * Try federation-based authentication
 */
async function tryFederationAuth(page: Page, user: TestUser, instanceCode: string): Promise<{ success: boolean; needsMFA?: boolean }> {
  // Look for federation or hub redirect options
  const federationButton = page.getByRole('button', { name: /federat|hub|central/i })
    .or(page.getByRole('link', { name: /federat|hub|central/i }))
    .or(page.locator('button, a').filter({ hasText: /federat|hub|central/i }))
    .first();

  const buttonExists = await federationButton.count() > 0;
  if (!buttonExists) {
    throw new Error('No federation options found');
  }

  await federationButton.click();

  // Wait for redirect to hub or federation endpoint
  await page.waitForURL(/.*localhost:3000.*|.*federat.*/, {
    timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
  });

  // Now try direct IdP on the hub/federation page
  return await tryDirectIdP(page, user);
}

/**
 * Try local instance-specific authentication
 */
async function tryLocalAuth(page: Page, user: TestUser, instanceCode?: string): Promise<{ success: boolean; needsMFA?: boolean }> {
  // Try instance-specific IdP names
  const localIdPs = getLocalIdPs(instanceCode);

  for (const idp of localIdPs) {
    try {
      const idpButton = page.getByRole('button', { name: new RegExp(idp, 'i') })
        .or(page.locator(`button:has-text("${idp}")`))
        .first();

      if (await idpButton.count() > 0) {
        await idpButton.click();
        await page.waitForURL(/.*keycloak.*|.*\/realms\/.*/, {
          timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
        });
        await fillKeycloakLogin(page, user);
        return { success: true, needsMFA: user.mfaRequired };
      }
    } catch (error) {
      // Try next IdP
      continue;
    }
  }

  throw new Error('No local IdPs found');
}

/**
 * Get local IdP names for an instance
 */
function getLocalIdPs(instanceCode?: string): string[] {
  switch (instanceCode) {
    case 'alb':
      return ['Albania', 'Albanian', 'Tirane', 'Albania DoD'];
    case 'dnk':
      return ['Denmark', 'Danish', 'Copenhagen', 'Denmark DoD'];
    case 'gbr':
      return ['United Kingdom', 'UK', 'Britain', 'London', 'UK DoD'];
    case 'rou':
      return ['Romania', 'Romanian', 'Bucharest', 'Romania DoD'];
    case 'hub':
    default:
      return ['United States', 'France', 'Germany', 'United Kingdom', 'Industry'];
  }
}

/**
 * Try generic login form (fallback)
 */
async function tryGenericLogin(page: Page, user: TestUser): Promise<{ success: boolean; needsMFA?: boolean }> {
  // Look for any login form
  const loginForm = page.locator('form').filter({ hasText: /login|sign|auth/i }).first();

  if (await loginForm.count() === 0) {
    throw new Error('No login form found');
  }

  // Try to fill username/password fields
  const usernameField = page.locator('input[type="email"], input[name*="user"], input[id*="user"]').first();
  const passwordField = page.locator('input[type="password"], input[name*="pass"], input[id*="pass"]').first();

  if (await usernameField.count() > 0 && await passwordField.count() > 0) {
    await usernameField.fill(user.username);
    await passwordField.fill(user.password);

    const submitButton = page.locator('button[type="submit"], input[type="submit"], button:has-text("Login")').first();
    await submitButton.click();

    return { success: true, needsMFA: user.mfaRequired };
  }

  throw new Error('Login form fields not found');
}

/**
 * Fill Keycloak login form
 */
async function fillKeycloakLogin(page: Page, user: TestUser): Promise<void> {
  await page.fill('#username', user.username);
  await page.fill('#password', user.password);
  await page.click('#kc-login');
}

/**
 * Handle MFA setup
 */
async function handleMFASetup(page: Page, user: TestUser, otpCode?: string): Promise<void> {
  // Implementation for MFA setup flow
  console.log('[ADAPTIVE-AUTH] MFA setup not implemented yet');
}

/**
 * Handle MFA login
 */
async function handleMFALogin(page: Page, user: TestUser, otpCode?: string): Promise<void> {
  if (user.mfaType === 'otp') {
    // Wait for OTP page and fill code
    await page.waitForURL(/.*totp.*/, { timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW });
    await page.fill('#totp', otpCode || '123456');
    await page.click('#kc-login');
  } else if (user.mfaType === 'webauthn') {
    // WebAuthn would require browser automation - skip for now
    console.log('[ADAPTIVE-AUTH] WebAuthn MFA not automated yet');
  }
}

/**
 * Verify successful authentication
 */
async function verifyAuthentication(page: Page, user: TestUser): Promise<void> {
  // Wait for redirect back to app
  await page.waitForURL(/.*localhost.*/, {
    timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
  });

  // Check for authenticated state
  const userIndicator = page.locator('[data-testid*="user"], [data-testid*="profile"], text=/welcome|logged|user/i');
  await expect(userIndicator.first()).toBeVisible();
}

/**
 * Logout function
 */
export async function adaptiveLogout(page: Page): Promise<void> {
  console.log('[ADAPTIVE-AUTH] Logging out...');

  try {
    // Try various logout patterns
    const logoutButton = page.getByRole('button', { name: /logout|sign out/i })
      .or(page.getByRole('link', { name: /logout|sign out/i }))
      .or(page.locator('button, a').filter({ hasText: /logout|sign out/i }))
      .first();

    if (await logoutButton.count() > 0) {
      await logoutButton.click();
      await page.waitForURL(/.*login.*/, { timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    } else {
      // Try direct navigation to logout endpoint
      await page.goto('/api/auth/signout');
    }

    // Verify logged out state
    await expect(page.getByRole('button', { name: /login|sign|auth/i }).first()).toBeVisible();

  } catch (error) {
    console.error('[ADAPTIVE-AUTH] Logout failed:', error);
    throw error;
  }
}
