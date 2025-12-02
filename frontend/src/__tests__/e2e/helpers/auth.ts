/**
 * Authentication Helpers for E2E Tests
 * 
 * Handles NextAuth v5 + Keycloak authentication flows
 * Supports:
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
import { TestUser } from '../fixtures/test-users';
import { TEST_CONFIG } from '../fixtures/test-config';

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
    // Step 1: Navigate to home page
    console.log('[AUTH] Step 1: Navigating to home page');
    await page.goto('/', { 
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded' // More reliable than 'load' for SPAs
    });
    
    // Step 2: Select IdP
    console.log(`[AUTH] Step 2: Selecting IdP "${user.idp}"`);
    
    // Look for IdP selector button (various patterns)
    const idpButton = page.getByRole('button', { name: new RegExp(user.idp, 'i') })
      .or(page.getByRole('link', { name: new RegExp(user.idp, 'i') }))
      .or(page.locator(`button:has-text("${user.idp}")`))
      .first();
    
    await idpButton.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await idpButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
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
    
    throw new Error(`Login failed for ${user.username}: ${error}`);
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
    
    console.log('[AUTH] OTP secret extracted (store this for future tests)');
    
    // Generate OTP code (requires external library or manual input)
    // For E2E tests, we assume otpCode is provided or use a fixed test secret
    const codeToUse = otpCode || '123456'; // Default test code (INSECURE - for testing only)
    
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
    
    // Wait for OTP input field
    const otpInput = page.locator(TEST_CONFIG.KEYCLOAK_SELECTORS.OTP_INPUT)
      .or(page.getByLabel(/one-time code|otp|authenticator/i));
    
    await otpInput.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Enter OTP code
    const codeToUse = otpCode || '123456'; // Default test code (INSECURE - for testing only)
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
  
  try {
    // Option 1: Use NextAuth signout endpoint
    await page.goto('/api/auth/signout', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    
    // Click sign out button (NextAuth signout page has a confirmation button)
    const signOutButton = page.getByRole('button', { name: /sign out/i })
      .or(page.getByRole('link', { name: /sign out/i }));
    
    await signOutButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
    // Wait for redirect to home page
    await page.waitForURL('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    
    // Verify logout by checking for IdP selector (not user menu)
    const idpSelector = page.getByRole('button', { name: /United States|France|Canada|Germany|Industry/i }).first();
    await idpSelector.waitFor({ state: 'visible', timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    
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

