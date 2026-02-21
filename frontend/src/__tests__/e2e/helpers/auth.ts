/**
 * Authentication Helpers for E2E Tests
 *
 * Handles NextAuth v5 + Keycloak authentication flows
 * Supports:
 * - Dynamic IdP discovery (adapts to deployed spokes)
 * - Basic login (UNCLASSIFIED - no MFA)
 * - OTP login (CONFIDENTIAL/SECRET - TOTP required)
 * - WebAuthn login (TOP_SECRET - passkey required)
 *
 * Usage:
 * ```typescript
 * import { loginAs, logout } from '../helpers/auth';
 * import { TEST_USERS } from '../fixtures/test-users';
 *
 * await loginAs(page, TEST_USERS.USA.SECRET);
 * // ... run tests
 * await logout(page);
 * ```
 */

import { Page, expect } from '@playwright/test';
import speakeasy from 'speakeasy';
import { TestUser } from '../fixtures/test-users';
import { TEST_CONFIG } from '../fixtures/test-config';
import { discoverAvailableIdPs, isIdPAvailable, getIdPDisplayName, type DiscoveredIdPs } from './idp-discovery';

/**
 * Global IdP discovery cache
 * Populated on first use to avoid repeated discovery overhead
 */
let globalIdPs: DiscoveredIdPs | null = null;

/**
 * TOTP secret cache — maps username to base32-encoded secret
 * Populated during first-time OTP setup, reused for subsequent logins
 */
const otpSecretCache = new Map<string, string>();

/**
 * Generate a TOTP code from a cached or provided secret
 */
function generateTOTP(secret: string): string {
  return speakeasy.totp({
    secret,
    encoding: 'base32',
    algorithm: 'sha256', // Must match Keycloak OTP policy (HmacSHA256)
  });
}

/**
 * Get stored OTP secret for a user (for tests that need direct access)
 */
export function getStoredOTPSecret(username: string): string | undefined {
  return otpSecretCache.get(username);
}

/**
 * Ensure IdPs have been discovered (lazy initialization)
 * 
 * @param page Playwright page object
 * @returns Discovered IdPs
 */
async function ensureDiscovery(page: Page): Promise<DiscoveredIdPs> {
  if (!globalIdPs) {
    console.log('[AUTH] Performing IdP discovery...');
    globalIdPs = await discoverAvailableIdPs(page);
    console.log(`[AUTH] ✅ Discovery complete: Hub + ${globalIdPs.count} spokes`);
  }
  return globalIdPs;
}

/**
 * Get discovered IdPs (for tests that need to check availability)
 * 
 * @param page Playwright page object
 * @returns Discovered IdPs
 */
export async function getDiscoveredIdPs(page: Page): Promise<DiscoveredIdPs> {
  return await ensureDiscovery(page);
}

/**
 * Reset IdP discovery cache (for testing or when environment changes)
 */
export function resetIdPDiscovery(): void {
  globalIdPs = null;
  console.log('[AUTH] IdP discovery cache cleared');
}

/**
 * Login as a test user
 *
 * Handles the complete authentication flow:
 * 1. Navigate to home page
 * 2. Click IdP selector button
 * 3. Wait for Keycloak redirect
 * 4. Fill Keycloak login form
 * 5. Handle MFA if required (OTP/WebAuthn)
 * 6. Wait for redirect back to app
 * 7. Verify session established
 *
 * @param page Playwright page object
 * @param user Test user from TEST_USERS fixture
 * @param otpCode Optional OTP code (if user requires OTP)
 * @throws Error if login fails
 */
export async function loginAs(
  page: Page,
  user: TestUser,
  options?: {
    otpCode?: string;
    skipMFA?: boolean; // For testing MFA setup scenarios
    expectMFASetup?: boolean; // Expect first-time OTP setup
  }
): Promise<void> {
  const { otpCode, skipMFA = false, expectMFASetup = false } = options || {};

  console.log(`[AUTH] Logging in as ${user.username} (${user.clearance}, ${user.countryCode})`);

  try {
    // Step 0: Ensure IdPs are discovered
    const idps = await ensureDiscovery(page);
    
    // Check if IdP is available
    if (!await isIdPAvailable(idps, user.countryCode)) {
      throw new Error(`IdP not available: ${user.countryCode} spoke not deployed`);
    }

    // Step 1: Navigate to home page
    console.log('[AUTH] Step 1: Navigating to home page');
    await page.goto('/', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded' // More reliable than 'load' for SPAs
    });

    // Step 2: Select IdP using discovered displayName
    const displayName = getIdPDisplayName(idps, user.countryCode);
    console.log(`[AUTH] Step 2: Selecting IdP for ${user.countryCode} (discovered: "${displayName}")`);

    // Use discovered displayName with flexible matching as fallback
    const idpButton = page.getByRole('button', { name: new RegExp(displayName!, 'i') })
      .or(page.getByRole('button', { name: new RegExp(user.countryCode, 'i') }))
      .or(page.getByRole('link', { name: new RegExp(user.countryCode, 'i') }))
      .or(page.locator(`button:has-text("${user.countryCode}")`))
      .first();

    try {
      await idpButton.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await idpButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    } catch (error) {
      // Enhanced error with available IdPs for debugging
      const availableButtons = await page.locator('button').allTextContents();
      console.error(`[AUTH] ❌ IdP button not found. Available buttons: ${availableButtons.slice(0, 10).join(', ')}`);
      throw new Error(`IdP button not found for ${user.countryCode} (expected: "${displayName}")`);
    }

    // Step 3: Wait for Keycloak redirect
    console.log('[AUTH] Step 3: Waiting for Keycloak redirect');
    await page.waitForURL(/.*keycloak.*|.*\/realms\/.*/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });

    // Step 4: Fill Keycloak login form
    console.log('[AUTH] Step 4: Filling Keycloak credentials');
    await fillKeycloakLogin(page, user);

    // Step 5: Handle MFA if required
    if (user.mfaRequired && !skipMFA) {
      console.log(`[AUTH] Step 5: Handling MFA (${user.mfaType})`);

      if (expectMFASetup) {
        // First-time MFA setup
        await handleMFASetup(page, user, otpCode);
      } else {
        // Existing MFA credentials
        await handleMFALogin(page, user, otpCode);
      }
    } else {
      console.log('[AUTH] Step 5: No MFA required');
    }

    // Step 6: Wait for redirect back to app (dashboard or home)
    console.log('[AUTH] Step 6: Waiting for redirect to app');
    await page.waitForURL(/\/(dashboard|$)/, {
      timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW,
    });

    // Step 7: Verify session established
    console.log('[AUTH] Step 7: Verifying session');
    await verifySession(page, user);

    console.log(`[AUTH] ✅ Successfully logged in as ${user.username}`);
  } catch (error) {
    console.error(`[AUTH] ❌ Login failed for ${user.username}:`, error);

    // Take screenshot for debugging
    await page.screenshot({
      path: `test-results/auth-failure-${user.username}-${Date.now()}.png`,
      fullPage: true,
    });

    throw new Error(`Login failed for ${user.username} at ${page.url()}: ${error}`);
  }
}

/**
 * Fill Keycloak login form
 *
 * @param page Playwright page object
 * @param user Test user
 */
async function fillKeycloakLogin(page: Page, user: TestUser): Promise<void> {
  // Wait for login form to be visible
  const usernameInput = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.USERNAME_INPUT)
    .or(page.getByLabel(/username|email/i));

  await usernameInput.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });

  // Fill username
  await usernameInput.fill(user.username);

  // Fill password - use input[type="password"] to avoid matching toggle button
  const passwordInput = page.locator('input[type="password"]')
    .or(page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.PASSWORD_INPUT))
    .or(page.getByLabel(/password/i).filter({ has: page.locator('input[type="password"]') }))
    .first();

  await passwordInput.fill(user.password);

  // Click sign in button
  const loginButton = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.LOGIN_BUTTON)
    .or(page.getByRole('button', { name: /sign in|log in/i }));

  await loginButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

  // Small wait for processing
  await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
}

/**
 * Handle first-time MFA setup
 *
 * @param page Playwright page object
 * @param user Test user
 * @param otpCode Optional OTP code (for OTP setup)
 */
async function handleMFASetup(page: Page, user: TestUser, otpCode?: string): Promise<void> {
  if (user.mfaType === 'otp') {
    console.log('[AUTH] Setting up OTP for first time');

    // Wait for OTP setup page
    await page.waitForSelector(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_QR_CODE, {
      timeout: TEST_CONFIG.TIMEOUTS.MFA_SETUP,
    });

    // Extract secret from manual entry (alternative to QR code)
    const secretElement = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_SECRET).first();
    const secret = await secretElement.textContent();

    // Cache the secret for subsequent logins and generate a real TOTP code
    let codeToUse: string;
    if (secret) {
      const cleanSecret = secret.replace(/\s/g, '');
      otpSecretCache.set(user.username, cleanSecret);
      codeToUse = otpCode || generateTOTP(cleanSecret);
      console.log(`[AUTH] OTP secret cached for ${user.username}, generated TOTP code`);
    } else {
      codeToUse = otpCode || '123456'; // Fallback for DEMO_MODE environments
      console.warn('[AUTH] Could not extract OTP secret — using fallback code');
    }

    // Enter OTP code
    const otpInput = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_INPUT);
    await otpInput.fill(codeToUse);

    // Submit OTP setup
    const submitButton = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_SUBMIT)
      .or(page.getByRole('button', { name: /submit|continue/i }));

    await submitButton.click();
  } else if (user.mfaType === 'webauthn') {
    console.log('[AUTH] Setting up WebAuthn/passkey for first time');

    // Create virtual authenticator for testing
    await setupVirtualAuthenticator(page);

    // Wait for WebAuthn registration page
    await page.waitForSelector(TEST_CONFIG.KEYCLOAK_SELECTORS.WEBAUTHN_REGISTER, {
      timeout: TEST_CONFIG.TIMEOUTS.MFA_SETUP,
    });

    // Click register button to trigger WebAuthn ceremony
    const registerButton = page.getByRole('button', { name: /register|add passkey|create passkey/i });
    await registerButton.click();

    // Wait for WebAuthn registration to complete
    await page.waitForTimeout(2000); // Allow time for WebAuthn ceremony

    // Look for success indication or next step
    const continueButton = page.getByRole('button', { name: /continue|next|finish/i });
    if (await continueButton.isVisible({ timeout: 5000 })) {
      await continueButton.click();
    }

    console.log('[AUTH] ✅ WebAuthn setup completed');
  }
}

/**
 * Handle MFA login (existing credentials)
 *
 * @param page Playwright page object
 * @param user Test user
 * @param otpCode Optional OTP code
 */
async function handleMFALogin(page: Page, user: TestUser, otpCode?: string): Promise<void> {
  if (user.mfaType === 'otp') {
    console.log('[AUTH] Entering OTP code');

    // Wait for one of: OTP challenge, first-time OTP setup, or direct redirect back to app
    const otpInput = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_INPUT)
      .or(page.locator('input[name="totp"], input[name="otp"], #otp, input[autocomplete="one-time-code"]'))
      .or(page.getByLabel(/one-time code|otp|authenticator/i));

    const otpSetupSignal = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_QR_CODE)
      .or(page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_SECRET))
      .first();

    const keycloakErrorSignal = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.ERROR_MESSAGE)
      .or(page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.ERROR_ALERT))
      .first();

    const mfaState = await Promise.race([
      otpInput.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW }).then(() => 'otp-login'),
      otpSetupSignal.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW }).then(() => 'otp-setup'),
      page.waitForURL(/\/(dashboard|$)/, { timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW }).then(() => 'app-redirect'),
      keycloakErrorSignal.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW }).then(() => 'keycloak-error'),
    ]).catch(() => 'unknown');

    if (mfaState === 'app-redirect') {
      console.log('[AUTH] OTP challenge not shown; login redirected directly to app');
      return;
    }

    if (mfaState === 'otp-setup') {
      console.log('[AUTH] OTP setup challenge detected during login; running setup flow');
      await handleMFASetup(page, user, otpCode);
      return;
    }

    if (mfaState === 'keycloak-error') {
      const errorText = (await keycloakErrorSignal.textContent())?.trim() || 'Unknown Keycloak login error';
      throw new Error(`Keycloak MFA challenge failed before OTP input: ${errorText}`);
    }

    if (mfaState !== 'otp-login') {
      throw new Error(`MFA state unresolved (url=${page.url()})`);
    }

    // Generate OTP code from cached secret, fall back to provided code or demo mode
    const cachedSecret = otpSecretCache.get(user.username);
    let codeToUse: string;
    if (otpCode) {
      codeToUse = otpCode;
    } else if (cachedSecret) {
      codeToUse = generateTOTP(cachedSecret);
      console.log(`[AUTH] Generated TOTP from cached secret for ${user.username}`);
    } else {
      codeToUse = '123456'; // Fallback for DEMO_MODE environments
      console.warn('[AUTH] No cached OTP secret — using fallback code');
    }
    await otpInput.fill(codeToUse);

    // Submit OTP
    const submitButton = page.getByRole('button', { name: /sign in|log in|continue/i });
    await submitButton.click();
  } else if (user.mfaType === 'webauthn') {
    console.log('[AUTH] WebAuthn authentication detected');

    // Create virtual authenticator for testing (if not already created)
    await setupVirtualAuthenticator(page);

    // Wait for WebAuthn authentication button
    await page.waitForSelector(TEST_CONFIG.KEYCLOAK_SELECTORS.WEBAUTHN_AUTHENTICATE, {
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    // Click authenticate button to trigger WebAuthn ceremony
    const authenticateButton = page.getByRole('button', { name: /authenticate|use passkey|sign in with passkey/i });
    await authenticateButton.click();

    // Wait for WebAuthn authentication to complete
    await page.waitForTimeout(2000); // Allow time for WebAuthn ceremony

    console.log('[AUTH] ✅ WebAuthn authentication completed');
  }
}

/**
 * Verify session is established
 *
 * @param page Playwright page object
 * @param user Test user
 */
async function verifySession(page: Page, user: TestUser): Promise<void> {
  // Wait for user menu or profile indicator to appear
  const userIndicator = page.locator(TEST_CONFIG.SELECTORS.USER_MENU)
    .or(page.getByTestId('user-menu'))
    .or(page.getByRole('button', { name: /profile|account|user/i }))
    .first();

  await userIndicator.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });

  // Verify we're not on a login or error page
  const currentUrl = page.url();
  expect(currentUrl).not.toMatch(/login|error|auth\/signin/i);

  console.log('[AUTH] Session verified - user menu visible');
}

/**
 * Logout and clear session
 *
 * @param page Playwright page object
 */
export async function logout(page: Page): Promise<void> {
  console.log('[AUTH] Logging out');

  // If auth failed and we are still on Keycloak/error page, do lightweight cleanup only
  const currentUrl = page.url();
  if (/keycloak|\/realms\//i.test(currentUrl)) {
    await page.context().clearCookies();
    await page.evaluate(() => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch {
        // ignore storage cleanup issues in cross-origin contexts
      }
    }).catch(() => undefined);
    console.log('[AUTH] Logout skipped (still on IdP page); local session cleared');
    return;
  }

  try {
    // Navigate to the NextAuth signout endpoint.
    // Some NextAuth configurations render a confirmation page; others
    // perform a direct POST + redirect (no visible button).
    await page.goto('/api/auth/signout', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // Check if there is a confirmation button (classic NextAuth behaviour)
    const signOutButton = page.getByRole('button', { name: /sign out/i })
      .or(page.getByRole('link', { name: /sign out/i }));

    const hasButton = await signOutButton.first().isVisible().catch(() => false);

    if (hasButton) {
      await signOutButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    } else {
      // No confirmation page — submit the CSRF form directly or just
      // clear cookies to end the session.
      const csrfForm = page.locator('form[action*="signout"]');
      const hasForm = await csrfForm.count() > 0;
      if (hasForm) {
        await csrfForm.locator('button, input[type="submit"]').first()
          .click({ timeout: 3000 }).catch(() => {});
      }
    }

    // Wait briefly for the redirect to complete
    await page.waitForURL(/\/($|\?)/, { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION }).catch(() => {});

    console.log('[AUTH] ✅ Successfully logged out');
  } catch (error) {
    console.error('[AUTH] ❌ Logout failed:', error);

    try {
      // Fallback: Clear cookies and session storage
      await page.context().clearCookies();
      await page.evaluate(() => {
        sessionStorage.clear();
        localStorage.clear();
      });

      // Navigate to home
      await page.goto('/');

      console.log('[AUTH] ⚠️ Logout completed with fallback (cleared cookies/storage)');
    } catch (fallbackError) {
      console.error('[AUTH] ❌ Fallback logout also failed:', fallbackError);
      // Last resort: Just navigate to home without clearing
      try {
        await page.goto('/');
        console.log('[AUTH] ⚠️ Basic navigation fallback used');
      } catch (navError) {
        console.error('[AUTH] ❌ Even basic navigation failed:', navError);
      }
    }
  }
}

/**
 * Check if user is logged in
 *
 * @param page Playwright page object
 * @returns True if logged in, false otherwise
 */
export async function isLoggedIn(page: Page): Promise<boolean> {
  try {
    const userMenu = page.locator(TEST_CONFIG.SELECTORS.USER_MENU).first();
    return await userMenu.isVisible({ timeout: 2000 });
  } catch {
    return false;
  }
}

/**
 * Login if not already logged in
 *
 * @param page Playwright page object
 * @param user Test user
 */
export async function loginIfNeeded(page: Page, user: TestUser): Promise<void> {
  const loggedIn = await isLoggedIn(page);

  if (loggedIn) {
    console.log('[AUTH] Already logged in - skipping login');
    return;
  }

  await loginAs(page, user);
}

/**
 * Wait for session to be established (after external redirect)
 *
 * @param page Playwright page object
 */
export async function waitForSession(page: Page): Promise<void> {
  const userMenu = page.locator(TEST_CONFIG.SELECTORS.USER_MENU).first();
  await userMenu.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.AUTH_FLOW });
}

/**
 * Setup virtual authenticator for WebAuthn testing
 *
 * Creates a virtual FIDO2 authenticator that can be used for testing
 * WebAuthn registration and authentication flows without requiring
 * physical hardware or user interaction.
 *
 * @param page Playwright page object
 */
async function setupVirtualAuthenticator(page: Page): Promise<void> {
  try {
    // Check if virtual authenticator already exists
    const cdpSession = await page.context().newCDPSession(page);

    // Enable WebAuthn domain
    await cdpSession.send('WebAuthn.enable');

    // Add virtual authenticator
    const { authenticatorId } = await cdpSession.send('WebAuthn.addVirtualAuthenticator', {
      options: {
        protocol: 'ctap2',
        ctap2Version: 'ctap2_1',
        transport: 'usb',
        hasResidentKey: true,
        hasUserVerification: true,
        hasLargeBlob: false,
        hasCredBlob: false,
        hasMinPinLength: false,
        hasPrf: false,
        automaticPresenceSimulation: true,
        isUserVerified: true,
      },
    });

    console.log(`[AUTH] ✅ Virtual authenticator created: ${authenticatorId}`);

    // Store authenticator ID for cleanup if needed
    (page as any)._virtualAuthenticatorId = authenticatorId;

  } catch (error) {
    console.warn('[AUTH] ⚠️ Failed to create virtual authenticator:', error);
    console.warn('[AUTH] WebAuthn tests may fail - ensure browser supports virtual authenticators');
  }
}

/**
 * Check if user is logged in
 */
export async function expectLoggedIn(page: Page, user: TestUser): Promise<void> {
  // Wait a moment for the page to fully load after authentication
  await page.waitForTimeout(2000);

  // Look for various indicators that user is logged in
  const possibleIndicators = [
    '[data-testid="user-info"]',
    '[data-testid="user-name"]',
    '[data-testid="user-menu"]',
    '.user-info',
    '.user-name',
    '.user-menu',
    '[data-testid*="user"]',
    '.navbar .user',
    'nav .user',
    '.header .user'
  ];

  let foundIndicator = false;
  for (const selector of possibleIndicators) {
    try {
      const element = page.locator(selector).first();
      if (await element.isVisible({ timeout: 1000 })) {
        console.log(`[AUTH] Found user indicator: ${selector}`);
        foundIndicator = true;
        break;
      }
    } catch (e) {
      // Continue checking other selectors
    }
  }

  // If we can't find specific user elements, check that we're not on a login page
  if (!foundIndicator) {
    const loginElements = page.locator('button, a').filter({
      hasText: /login|sign in|authenticate/i
    });

    const hasLoginElements = await loginElements.count() === 0;
    if (hasLoginElements) {
      console.log('[AUTH] No login elements found - assuming user is logged in');
      foundIndicator = true;
    }
  }

  // Check URL to ensure we're not redirected back to login
  const currentUrl = page.url();
  const isOnAppPage = !currentUrl.includes('login') && !currentUrl.includes('auth') &&
                     (currentUrl.includes('localhost:3000') || currentUrl.includes('dashboard') || currentUrl.includes('resources'));

  if (isOnAppPage) {
    console.log('[AUTH] User appears to be on application page - assuming logged in');
    foundIndicator = true;
  }

  if (!foundIndicator) {
    // Take a screenshot for debugging
    await page.screenshot({ path: 'debug-login-failed.png' });
    console.log('[AUTH] Taking debug screenshot: debug-login-failed.png');

    // Log what elements we can find
    const allButtons = await page.locator('button').allTextContents();
    console.log('[AUTH] All buttons on page:', allButtons.slice(0, 10));

    throw new Error('Could not verify user is logged in - no user indicators found and still on login page');
  }

  console.log(`[AUTH] ✅ User login verified for ${user.username}`);
}

/**
 * Check if user is logged out
 */
export async function expectLoggedOut(page: Page): Promise<void> {
  // Should not see user information
  const userInfo = page.locator('[data-testid="user-info"], [data-testid="user-name"], .user-info, .user-name');
  await expect(userInfo).not.toBeVisible();

  // Should see login options
  const loginElements = page.locator('button, a').filter({
    hasText: /login|sign|auth/i
  });
  await expect(loginElements.first()).toBeVisible();
}