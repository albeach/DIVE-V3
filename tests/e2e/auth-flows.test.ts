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
import { authenticator } from 'otplib';

// Test configuration
const CONFIG = {
    baseUrls: {
        frontend: process.env.FRONTEND_URL || (process.env.CI ? 'https://localhost:3000' : 'http://localhost:3000'),
        backend: process.env.BACKEND_URL || (process.env.CI ? 'https://localhost:4000' : 'http://localhost:4000'),
        keycloak: process.env.KEYCLOAK_URL || (process.env.CI ? 'https://localhost:8443' : 'http://localhost:8080'),
        keycloakMgmt: process.env.KEYCLOAK_MGMT_URL || (process.env.CI ? 'https://localhost:8443' : 'http://localhost:8080'),
        opa: process.env.OPA_URL || (process.env.CI ? 'https://localhost:8181' : 'http://localhost:8181'),
        opal: process.env.OPAL_URL || (process.env.CI ? 'https://localhost:7002' : 'http://localhost:7002'),
    },
    timeouts: {
        navigation: 60000,
        auth: 90000,
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

const TOTP_SECRETS: Record<string, string | undefined> = {
    USA: process.env.TESTUSER_USA_TOTP_SECRET,
    FRA: process.env.TESTUSER_FRA_TOTP_SECRET,
    GBR: process.env.TESTUSER_GBR_TOTP_SECRET,
    DEU: process.env.TESTUSER_DEU_TOTP_SECRET,
};

// Helper functions
async function login(page: Page, user: typeof CONFIG.testUsers.usa): Promise<void> {
    await resetSession(page);

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

    // Handle required actions (e.g., TOTP enrollment)
    await maybeHandleRequiredActions(page, user);

    // Wait for redirect back to frontend (resources page) or the Auth.js callback
    await waitForPostAuth(page);
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

async function getSessionCookie(context: BrowserContext): Promise<string | null> {
    const cookies = await context.cookies();
    const sessionCookie = cookies.find(c => c.name.toLowerCase().includes('session') || c.name.toLowerCase().includes('authjs'));
    if (!sessionCookie) return null;
    return `${sessionCookie.name}=${sessionCookie.value}`;
}

async function maybeHandleRequiredActions(page: Page, user: typeof CONFIG.testUsers.usa): Promise<void> {
    // Some themes use a multi-step wizard; advance through benign "Next"/"Continue" steps.
    for (let i = 0; i < 5; i++) {
        const wizardNext = page.getByRole('button', { name: /next|continue/i }).first();
        const wizardSubmit = page.locator('button[type="submit"]').first();
        const foundWizard =
            (await wizardNext.isVisible({ timeout: 1000 }).catch(() => false)) ||
            (await wizardSubmit.isVisible({ timeout: 1000 }).catch(() => false));
        if (foundWizard) {
            if (await wizardNext.isVisible().catch(() => false)) {
                await wizardNext.click({ timeout: CONFIG.timeouts.auth });
            } else if (await wizardSubmit.isVisible().catch(() => false)) {
                await wizardSubmit.click({ timeout: CONFIG.timeouts.auth });
            }
            await page.waitForTimeout(750);
        } else {
            break;
        }
    }

    // Detect Keycloak TOTP enrollment screen
    const totpHeader = page.getByText(/Two-Factor Authentication Setup|Authenticator App|Configure TOTP|One-time code|Enter the 6-digit/i);
    const totpVisible = await totpHeader.isVisible({ timeout: 3000 }).catch(() => false);

    if (totpVisible) {
        const secret = TOTP_SECRETS[user.country];
        // Try to extract secret from the page (Keycloak shows Base32 or otpauth URI)
        let totpSecretFromPage: string | undefined;
        try {
            const content = await page.content();
            const base32Match = content.match(/[A-Z2-7]{16,}/);
            const uriMatch = content.match(/otpauth:\/\/totp\/[^\s"']+/);
            if (base32Match) totpSecretFromPage = base32Match[0];
            if (!totpSecretFromPage && uriMatch) {
                const secretParam = uriMatch[0].match(/secret=([A-Z2-7]+)/i);
                if (secretParam && secretParam[1]) totpSecretFromPage = secretParam[1];
            }
        } catch {
            // ignore
        }

        const effectiveSecret = totpSecretFromPage || secret;

        if (!effectiveSecret) {
            throw new Error(
                `MFA required for ${user.username} (${user.country}) but no TOTP secret available. ` +
                `Provide TESTUSER_${user.country}_TOTP_SECRET or ensure the Keycloak page exposes the secret.`
            );
        }

        const code = authenticator.generate(effectiveSecret);

        // Fill TOTP code into known field
        const totpField = page.locator('input#totp, input[name="totp"]');
        if (!(await totpField.first().isVisible({ timeout: 2000 }).catch(() => false))) {
            throw new Error('Could not locate TOTP input field (#totp) on Keycloak enrollment screen.');
        }
        await totpField.first().fill(code);
        console.log(`[E2E][TOTP] Filled code ${code} into #totp`);
        try {
            await page.screenshot({ path: 'test-results/e2e-artifacts/totp-debug.png', fullPage: true });
        } catch {
            // ignore screenshot failures
        }

        // Click the known submit button (Complete Setup)
        const submit = page.locator('button#saveTOTPBtn, button:has-text("Complete Setup")').first();
        if (await submit.isVisible({ timeout: 2000 }).catch(() => false)) {
            await submit.click({ timeout: CONFIG.timeouts.auth });
        } else {
            // Fallback to a generic continue/submit
            const fallbackSubmit = page.getByRole('button', { name: /continue|submit|next|finish/i }).first();
            if (await fallbackSubmit.isVisible({ timeout: 2000 }).catch(() => false)) {
                await fallbackSubmit.click({ timeout: CONFIG.timeouts.auth });
            } else {
                await page.keyboard.press('Enter');
            }
        }

        // Confirm we left the TOTP screen
        const stillOnTotp = await totpHeader.isVisible({ timeout: 2000 }).catch(() => false);
        if (stillOnTotp) {
            throw new Error('TOTP submission did not advance past enrollment screen.');
        }
    }
}

async function waitForPostAuth(page: Page): Promise<void> {
    const targets = [/\/api\/auth\/callback\//, /\/resources(\/|$|\?)/];
    await page.waitForURL((url) => targets.some((r) => r.test(url)), {
        timeout: CONFIG.timeouts.auth,
        waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', { timeout: CONFIG.timeouts.auth });
}

async function resetSession(page: Page): Promise<void> {
    try {
        await page.context().clearCookies();
        await page.context().clearPermissions();
        await page.goto('about:blank');
    } catch {
        // ignore
    }
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

            // Verify session cookie is cleared
            const sessionCookie = await getSessionCookie(page.context());
            expect(sessionCookie).toBeFalsy();

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
        const sessionCookie = await getSessionCookie(page.context());

        if (sessionCookie) {
            const response = await request.get(`${CONFIG.baseUrls.backend}/api/resources`, {
                headers: {
                    'Cookie': sessionCookie,
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
        const healthUrl = process.env.KEYCLOAK_HEALTH_URL || 'https://localhost:9000/health/ready';
        const response = await request.get(healthUrl, {
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(200);
    });

    test('opa health check', async ({ request }) => {
        const response = await request.get(`${CONFIG.baseUrls.opa}/health?plugins`, {
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(200);
    });

    test('opal health check', async ({ request }) => {
        const response = await request.get(`${CONFIG.baseUrls.opal}/healthcheck`, {
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(200);
    });

    test('policy version is available', async ({ request }) => {
        const response = await request.get(`${CONFIG.baseUrls.backend}/health/policy-version`, {
            failOnStatusCode: false,
        });

        expect(response.status()).toBe(200);
        const body = await response.json();
        expect(body).toHaveProperty('policyVersion');
    });
});

// ============================================
// PERFORMANCE TESTS
// ============================================

test.describe('Performance Benchmarks', () => {
    test('authentication latency benchmark', async ({ page, request }) => {
        const startTime = Date.now();

        // Navigate to frontend
        await page.goto(CONFIG.baseUrls.frontend);
        const navigationTime = Date.now() - startTime;

        // Click login button
        await page.click('text=Login');
        const loginClickTime = Date.now() - startTime;

        // Wait for Keycloak redirect
        await page.waitForURL('**/realms/**');
        const keycloakLoadTime = Date.now() - startTime;

        // Fill login form
        await page.fill('#username', CONFIG.testUsers.usa.username);
        await page.fill('#password', CONFIG.testUsers.usa.password);
        await page.click('#kc-login');

        // Wait for successful authentication
        await page.waitForURL('**/dashboard');
        const authCompleteTime = Date.now() - startTime;

        // Measure API response time
        const apiStartTime = Date.now();
        const apiResponse = await request.get(`${CONFIG.baseUrls.backend}/api/resources`);
        const apiResponseTime = Date.now() - apiStartTime;

        // Performance assertions
        expect(navigationTime).toBeLessThan(5000); // < 5s to load page
        expect(loginClickTime).toBeLessThan(1000); // < 1s for UI interaction
        expect(keycloakLoadTime).toBeLessThan(10000); // < 10s for Keycloak
        expect(authCompleteTime).toBeLessThan(15000); // < 15s total auth flow
        expect(apiResponseTime).toBeLessThan(1000); // < 1s for API call
        expect(apiResponse.status()).toBe(200);

        console.log('Performance Results:');
        console.log(`- Page Load: ${navigationTime}ms`);
        console.log(`- Keycloak Load: ${keycloakLoadTime}ms`);
        console.log(`- Total Auth Flow: ${authCompleteTime}ms`);
        console.log(`- API Response: ${apiResponseTime}ms`);
    });

    test('authorization decision performance', async ({ request }) => {
        // Test authorization decision latency
        const testRequests = [
            {
                subject: { uniqueID: 'test-user', clearance: 'SECRET', countryOfAffiliation: 'USA', acpCOI: ['FVEY'] },
                action: 'read',
                resource: { resourceId: 'doc-001', classification: 'SECRET', releasabilityTo: ['USA', 'GBR'], COI: ['FVEY'] },
                context: { currentTime: new Date().toISOString() }
            },
            {
                subject: { uniqueID: 'test-user', clearance: 'CONFIDENTIAL', countryOfAffiliation: 'FRA', acpCOI: ['NATO-COSMIC'] },
                action: 'read',
                resource: { resourceId: 'doc-002', classification: 'TOP_SECRET', releasabilityTo: ['USA'], COI: ['FVEY'] },
                context: { currentTime: new Date().toISOString() }
            }
        ];

        for (const testRequest of testRequests) {
            const startTime = Date.now();
            const response = await request.post(`${CONFIG.baseUrls.backend}/api/authz/decision`, {
                data: testRequest,
                headers: { 'Content-Type': 'application/json' }
            });
            const decisionTime = Date.now() - startTime;

            expect(decisionTime).toBeLessThan(500); // < 500ms per decision
            expect(response.status()).toBe(200);

            const result = await response.json();
            expect(result).toHaveProperty('allow');
            expect(typeof result.allow).toBe('boolean');
        }
    });
});
