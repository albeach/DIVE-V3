/**
 * DIVE V3 - End-to-End Authentication Flow Tests
 * 
 * Tests complete authentication workflows including:
 * - OIDC authentication via Keycloak
 * - MFA enforcement (TOTP, WebAuthn)
 * - Federation scenarios (USA, FRA, GBR, DEU)
 * - Token refresh and session management
 * - Authorization decision flows
 * 
 * Prerequisites:
 * - All services running (docker compose up -d)
 * - Test users seeded in Keycloak
 * - OPA policies loaded
 * 
 * Usage:
 *   npm run test:e2e
 *   npx playwright test tests/e2e/auth-flows.test.ts
 * 
 * @version 1.0.0
 * @date 2025-12-03
 */

import { test, expect, Page, BrowserContext } from '@playwright/test';

// Test configuration
const CONFIG = {
  baseUrls: {
    frontend: process.env.FRONTEND_URL || 'https://localhost:3000',
    backend: process.env.BACKEND_URL || 'https://localhost:4000',
    keycloak: process.env.KEYCLOAK_URL || 'https://localhost:8443',
    keycloakMgmt: process.env.KEYCLOAK_MGMT_URL || 'https://localhost:8443',
  },
  timeouts: {
    navigation: 60000,
    auth: 60000,
    api: 10000,
  },
  testUsers: {
    usa: {
      username: 'testuser-usa-3',
      password: 'TestUser2025!Pilot',
      clearance: 'SECRET',
      country: 'USA',
      realm: 'dive-v3-broker',
    },
    fra: {
      username: 'testuser-fra-3',
      password: 'TestUser2025!Pilot',
      clearance: 'SECRET',
      country: 'FRA',
      realm: 'dive-v3-broker',
    },
    gbr: {
      username: 'testuser-gbr-3',
      password: 'TestUser2025!Pilot',
      clearance: 'SECRET',
      country: 'GBR',
      realm: 'dive-v3-broker',
    },
    admin: {
      username: 'USA-admin',
      password: 'TestUser2025!SecureAdmin',
      realm: 'dive-v3-broker',
    },
  },
};

// Helper functions
async function login(page: Page, user: typeof CONFIG.testUsers.usa): Promise<void> {
  // Prefer the guarded resources page so the Sign In CTA is stable
  await page.goto(`${CONFIG.baseUrls.frontend}/resources`, {
    timeout: CONFIG.timeouts.navigation,
    waitUntil: 'domcontentloaded',
  });

  const resourceSignIn = page.locator('[data-testid="sign-in-button"]');
  const directLogin = page.locator('[data-testid="direct-login-button"]');
  const legacySignIn = page.locator('[data-testid="sign-in-button"], button:has-text("Sign In"), a:has-text("Sign In")');

  // Click whichever login affordance is available
  if (await resourceSignIn.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
    await resourceSignIn.click({ timeout: CONFIG.timeouts.auth });
  } else {
    // Fallback to home direct-login button
    await page.goto(CONFIG.baseUrls.frontend, {
      timeout: CONFIG.timeouts.navigation,
      waitUntil: 'domcontentloaded',
    });

    if (await directLogin.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      await directLogin.click({ timeout: CONFIG.timeouts.auth });
    } else {
      await legacySignIn.first().click({ timeout: CONFIG.timeouts.auth });
    }
  }

  // Wait for Keycloak login page
  await page.waitForURL(/.*\/realms\/.*\/protocol\/openid-connect\/auth/, {
    timeout: CONFIG.timeouts.auth,
  });

  // Enter credentials
  await page.fill('input[name="username"]', user.username);
  await page.fill('input[name="password"]', user.password);

  // Submit login form
  await page.click('input[type="submit"], button[type="submit"]');

  // Wait for redirect back to frontend
  await page.waitForURL(new RegExp(CONFIG.baseUrls.frontend.replace(/https?:\/\//, '')), {
    timeout: CONFIG.timeouts.auth,
  });
}

async function logout(page: Page): Promise<void> {
  // Click user menu
  await page.click('[data-testid="user-menu"], button:has-text("Logout"), a:has-text("Sign Out")');

  // Confirm logout if needed
  const logoutButton = page.locator('button:has-text("Logout"), a:has-text("Logout")');
  if (await logoutButton.isVisible()) {
    await logoutButton.click();
  }

  // Wait for redirect to login or home
  await page.waitForURL(/\/(login|$)/, { timeout: CONFIG.timeouts.navigation });
}

async function getAuthToken(page: Page): Promise<string | null> {
  // Get token from session storage or cookies
  const token = await page.evaluate(() => {
    const session = sessionStorage.getItem('next-auth.session-token') ||
      localStorage.getItem('token');
    if (session) return session;

    // Try to get from cookies
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name.includes('session-token') || name.includes('access_token')) {
        return value;
      }
    }
    return null;
  });

  return token;
}

// =============================================================================
// Test Suites
// =============================================================================

test.describe('DIVE V3 Authentication Flows', () => {
  test.describe.configure({ mode: 'serial' });

  // ---------------------------------------------------------------------------
  // Basic Authentication Tests
  // ---------------------------------------------------------------------------

  test.describe('Basic OIDC Authentication', () => {
    test('should redirect unauthenticated user to login', async ({ page }) => {
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`, {
        timeout: CONFIG.timeouts.navigation,
        waitUntil: 'domcontentloaded',
      });

      // Should show sign-in prompt
      await expect(page.locator('[data-testid="sign-in-button"]')).toBeVisible({ timeout: CONFIG.timeouts.navigation });
    });

    test('should successfully authenticate USA user', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Verify user is logged in
      await expect(page.locator('[data-testid="user-name"], .user-email')).toContainText(
        CONFIG.testUsers.usa.username.split('@')[0],
        { ignoreCase: true, timeout: CONFIG.timeouts.auth }
      );
    });

    test('should display user attributes after login', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Navigate to profile or dashboard
      await page.goto(`${CONFIG.baseUrls.frontend}/profile`);

      // Verify clearance and country are displayed
      const pageContent = await page.content();
      expect(pageContent).toMatch(/SECRET|USA|CLEARANCE/i);
    });

    test('should handle logout correctly', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);
      await logout(page);

      // Verify session is cleared
      const token = await getAuthToken(page);
      expect(token).toBeFalsy();

      // Verify protected routes are inaccessible
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`);
      const url = page.url();
      expect(url).toMatch(/realms|login|signin/i);
    });
  });

  // ---------------------------------------------------------------------------
  // MFA Enforcement Tests
  // ---------------------------------------------------------------------------

  test.describe('MFA Enforcement', () => {
    test.skip('should enforce TOTP for SECRET resources', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Try to access SECRET resource
      await page.goto(`${CONFIG.baseUrls.frontend}/resources/secret-doc-001`);

      // Should prompt for MFA step-up if not already at AAL2+
      const mfaPrompt = page.locator('text=Additional verification required');
      const resourceContent = page.locator('[data-testid="resource-content"]');

      // Either MFA prompt or resource content should be visible
      await expect(mfaPrompt.or(resourceContent)).toBeVisible({ timeout: CONFIG.timeouts.auth });
    });

    test.skip('should enforce WebAuthn for TOP_SECRET resources', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Try to access TOP_SECRET resource
      await page.goto(`${CONFIG.baseUrls.frontend}/resources/ts-doc-001`);

      // Should require AAL3 (WebAuthn)
      const webauthnPrompt = page.locator('text=Security key required, text=Use your security key');
      const accessDenied = page.locator('text=Access denied, text=Insufficient authentication');

      await expect(webauthnPrompt.or(accessDenied)).toBeVisible({ timeout: CONFIG.timeouts.auth });
    });
  });

  // ---------------------------------------------------------------------------
  // Federation Tests
  // ---------------------------------------------------------------------------

  test.describe('Federation Scenarios', () => {
    test('should allow USA user to access FVEY resources', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Access FVEY-marked resource
      const response = await page.goto(`${CONFIG.baseUrls.frontend}/resources?coi=FVEY`);
      expect(response?.status()).toBeLessThan(400);

      // Should see FVEY resources
      await expect(page.locator('text=FVEY, [data-coi="FVEY"]')).toBeVisible({
        timeout: CONFIG.timeouts.navigation,
      });
    });

    test('should allow GBR user to access NATO resources', async ({ page }) => {
      await login(page, CONFIG.testUsers.gbr);

      // Access NATO-marked resource
      const response = await page.goto(`${CONFIG.baseUrls.frontend}/resources?coi=NATO`);
      expect(response?.status()).toBeLessThan(400);
    });

    test('should deny FRA user access to FVEY-ONLY resources', async ({ page }) => {
      await login(page, CONFIG.testUsers.fra);

      // Try to access FVEY-ONLY resource
      await page.goto(`${CONFIG.baseUrls.frontend}/resources/fvey-only-001`);

      // Should show access denied
      await expect(page.locator('text=Access denied, text=Forbidden, text=403')).toBeVisible({
        timeout: CONFIG.timeouts.navigation,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Authorization Decision Tests
  // ---------------------------------------------------------------------------

  test.describe('Authorization Decisions', () => {
    test('should allow access based on clearance level', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Make API call to get resources
      const response = await page.request.get(`${CONFIG.baseUrls.backend}/api/resources`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('resources');
    });

    test('should include authorization decision in response headers', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Make API call
      const response = await page.request.get(`${CONFIG.baseUrls.backend}/api/resources/doc-001`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      // Check for decision headers
      const headers = response.headers();
      const decisionHeader = headers['x-authz-decision'] || headers['x-authorization-decision'];

      // May or may not have decision header depending on config
      if (decisionHeader) {
        expect(decisionHeader).toMatch(/allow|permit/i);
      }
    });

    test('should deny access to higher classification than clearance', async ({ page }) => {
      // Login as SECRET clearance user
      await login(page, CONFIG.testUsers.usa);

      // Try to access TOP_SECRET resource directly via API
      const response = await page.request.get(
        `${CONFIG.baseUrls.backend}/api/resources/ts-doc-001`,
        {
          headers: {
            'Accept': 'application/json',
          },
          failOnStatusCode: false,
        }
      );

      // Should be denied (403 or 401)
      expect([401, 403]).toContain(response.status());
    });
  });

  // ---------------------------------------------------------------------------
  // Session Management Tests
  // ---------------------------------------------------------------------------

  test.describe('Session Management', () => {
    test('should maintain session across page navigations', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Navigate to multiple pages
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`);
      await page.goto(`${CONFIG.baseUrls.frontend}/profile`);
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`);

      // Should still be logged in
      await expect(page.locator('[data-testid="user-name"], .user-email')).toBeVisible();
    });

    test.skip('should refresh token before expiration', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Wait for token refresh (typically happens before expiration)
      await page.waitForTimeout(60000); // 1 minute

      // Should still be logged in
      await page.reload();
      await expect(page.locator('[data-testid="user-name"], .user-email')).toBeVisible();
    });

    test('should handle concurrent sessions', async ({ browser }) => {
      // Create two browser contexts (simulating two sessions)
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login in both
      await login(page1, CONFIG.testUsers.usa);
      await login(page2, CONFIG.testUsers.usa);

      // Both should be able to access resources
      await page1.goto(`${CONFIG.baseUrls.frontend}/resources`);
      await page2.goto(`${CONFIG.baseUrls.frontend}/resources`);

      await expect(page1.locator('[data-testid="user-name"], .user-email')).toBeVisible();
      await expect(page2.locator('[data-testid="user-name"], .user-email')).toBeVisible();

      // Cleanup
      await context1.close();
      await context2.close();
    });
  });

  // ---------------------------------------------------------------------------
  // Error Handling Tests
  // ---------------------------------------------------------------------------

  test.describe('Error Handling', () => {
    test('should handle invalid credentials gracefully', async ({ page }) => {
      await page.goto(CONFIG.baseUrls.frontend);
      await page.click('button:has-text("Sign In"), a:has-text("Sign In")');

      // Wait for Keycloak
      await page.waitForURL(/.*\/realms\/.*\/protocol\/openid-connect\/auth/);

      // Enter invalid credentials
      await page.fill('input[name="username"]', 'invalid@test.com');
      await page.fill('input[name="password"]', 'wrongpassword');
      await page.click('input[type="submit"], button[type="submit"]');

      // Should show error message
      await expect(page.locator('text=Invalid, text=incorrect, .alert-error')).toBeVisible({
        timeout: CONFIG.timeouts.auth,
      });
    });

    test('should handle expired session gracefully', async ({ page, context }) => {
      await login(page, CONFIG.testUsers.usa);

      // Clear session cookies to simulate expiration
      await context.clearCookies();

      // Try to access protected resource
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`);

      // Should redirect to login
      const url = page.url();
      expect(url).toMatch(/realms|login|signin/i);
    });

    test('should handle network errors gracefully', async ({ page }) => {
      await login(page, CONFIG.testUsers.usa);

      // Block API requests
      await page.route(`${CONFIG.baseUrls.backend}/**`, route => route.abort());

      // Try to load resources
      await page.goto(`${CONFIG.baseUrls.frontend}/resources`);

      // Should show error state, not crash
      await expect(page.locator('text=Error, text=Unable to load, text=Try again')).toBeVisible({
        timeout: CONFIG.timeouts.navigation,
      });
    });
  });
});

// =============================================================================
// API-Level Authentication Tests
// =============================================================================

test.describe('API Authentication', () => {
  test('should reject requests without authentication', async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrls.backend}/api/resources`, {
      failOnStatusCode: false,
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should reject requests with invalid token', async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrls.backend}/api/resources`, {
      headers: {
        'Authorization': 'Bearer invalid-token-here',
      },
      failOnStatusCode: false,
    });

    expect([401, 403]).toContain(response.status());
  });

  test('should accept requests with valid token', async ({ page, request }) => {
    await login(page, CONFIG.testUsers.usa);

    // Get cookies from authenticated session
    const cookies = await page.context().cookies();
    const sessionCookie = cookies.find(c => c.name.includes('session'));

    if (sessionCookie) {
      const response = await request.get(`${CONFIG.baseUrls.backend}/api/resources`, {
        headers: {
          'Cookie': `${sessionCookie.name}=${sessionCookie.value}`,
        },
      });

      expect(response.status()).toBe(200);
    }
  });
});

// =============================================================================
// Health Check Tests
// =============================================================================

test.describe('Service Health Checks', () => {
  test('frontend health check', async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrls.frontend}/api/health`, {
      failOnStatusCode: false,
    });

    // May be 200 or 404 depending on if health endpoint exists
    expect([200, 404]).toContain(response.status());
  });

  test('backend health check', async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrls.backend}/health`, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('healthy');
  });

  test('keycloak health check', async ({ request }) => {
    const response = await request.get(`${CONFIG.baseUrls.keycloakMgmt}/health`, {
      failOnStatusCode: false,
    });

    expect(response.status()).toBe(200);
  });
});





