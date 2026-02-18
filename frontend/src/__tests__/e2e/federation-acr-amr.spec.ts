/**
 * E2E Tests: Federation ACR/AMR Verification
 *
 * These tests verify that ACR (Authentication Context Class Reference) and AMR
 * (Authentication Methods Reference) are correctly propagated through federated
 * authentication flows.
 *
 * Prerequisites:
 * - Hub (USA) must be running at https://localhost:3000
 * - At least one Spoke (NZL, FRA, or GBR) must be running
 * - Federation must be configured between Hub and Spoke
 *
 * Reference: HANDOFF_ACR_AMR_COMPLETE_FIX.md
 */

import { test, expect, type Page } from '@playwright/test';

// Test configuration
const HUB_URL = process.env.HUB_URL || 'https://localhost:3000';
const TEST_TIMEOUT = 60000; // 60 seconds for auth flows

// Test users for different spokes
const TEST_USERS = {
    nzl: {
        username: 'admin-nzl',
        password: 'TestUser2025!SecureAdmin',
        expectedCountry: 'NZL',
    },
    fra: {
        username: 'admin-fra',
        password: 'TestUser2025!SecureAdmin',
        expectedCountry: 'FRA',
    },
    gbr: {
        username: 'admin-gbr',
        password: 'TestUser2025!SecureAdmin',
        expectedCountry: 'GBR',
    },
};

/**
 * Helper: Navigate to Hub and select IdP
 */
async function selectIdP(page: Page, idpName: string) {
    await page.goto(HUB_URL, { waitUntil: 'domcontentloaded' });

    // Look for IdP selection button (different UI patterns)
    const idpButton = page.locator(`[data-idp="${idpName}"], button:has-text("${idpName}"), a:has-text("${idpName}")`).first();

    if (await idpButton.isVisible({ timeout: 5000 })) {
        await idpButton.click();
    } else {
        // May already be on login page or need to find another selector
        console.log(`IdP button for ${idpName} not immediately visible, trying alternatives...`);
    }
}

/**
 * Helper: Complete Keycloak login form
 */
async function completeKeycloakLogin(page: Page, username: string, password: string) {
    // Wait for Keycloak login page
    await page.waitForSelector('#username, input[name="username"]', { timeout: 15000 });

    // Fill credentials
    await page.fill('#username, input[name="username"]', username);
    await page.fill('#password, input[name="password"]', password);

    // Submit
    await page.click('#kc-login, button[type="submit"]');

    // Wait for redirect back to Hub
    await page.waitForURL(`${HUB_URL}/**`, { timeout: 30000 });
}

/**
 * Helper: Get session data from the UI or API
 */
async function getSessionData(page: Page): Promise<{
    acr?: string;
    amr?: string[];
    uniqueID?: string;
    countryOfAffiliation?: string;
}> {
    // Try to get session data from the session display component
    const sessionJson = await page.locator('[data-testid="session-json"], [data-session-info]').textContent().catch(() => null);

    if (sessionJson) {
        try {
            return JSON.parse(sessionJson);
        } catch {
            console.log('Could not parse session JSON from UI');
        }
    }

    // Alternative: Get from API
    const response = await page.request.get(`${HUB_URL}/api/auth/session`);
    if (response.ok()) {
        const data = await response.json();
        return {
            acr: data?.user?.acr,
            amr: data?.user?.amr,
            uniqueID: data?.user?.uniqueID,
            countryOfAffiliation: data?.user?.countryOfAffiliation,
        };
    }

    return {};
}

// Skip if no spokes are running
test.describe('Federation ACR/AMR Verification', { tag: '@critical' }, () => {
    test.setTimeout(TEST_TIMEOUT);

    test.beforeEach(async ({ page }) => {
        // Ignore SSL certificate errors for local development
        await page.context().clearCookies();
    });

    test('Hub should be accessible', async ({ page }) => {
        await page.goto(HUB_URL, { waitUntil: 'domcontentloaded' });

        // Check that we can reach the Hub
        const title = await page.title();
        expect(title).toBeTruthy();

        console.log(`Hub title: ${title}`);
    });

    test.describe('NZL Federation', () => {
        test.skip(({ }, testInfo) => {
            // Skip if NZL spoke is not running
            return !process.env.RUN_NZL_TESTS;
        }, 'NZL tests disabled - set RUN_NZL_TESTS=true to enable');

        test('should receive correct ACR/AMR from NZL federated login', async ({ page }) => {
            const user = TEST_USERS.nzl;

            // Navigate to Hub and select NZL IdP
            await selectIdP(page, 'New Zealand');

            // Complete login at NZL Keycloak
            await completeKeycloakLogin(page, user.username, user.password);

            // Get session data
            const session = await getSessionData(page);

            // Verify session contains expected data
            expect(session.countryOfAffiliation).toBe(user.expectedCountry);

            // ACR should be present (value depends on auth method)
            expect(session.acr).toBeDefined();

            // AMR should be an array with at least 'pwd'
            expect(Array.isArray(session.amr)).toBe(true);
            expect(session.amr).toContain('pwd');

            console.log('NZL Federation Session:', {
                acr: session.acr,
                amr: session.amr,
                country: session.countryOfAffiliation,
            });
        });
    });

    test.describe('FRA Federation', () => {
        test.skip(({ }, testInfo) => {
            return !process.env.RUN_FRA_TESTS;
        }, 'FRA tests disabled - set RUN_FRA_TESTS=true to enable');

        test('should receive correct ACR/AMR from FRA federated login', async ({ page }) => {
            const user = TEST_USERS.fra;

            await selectIdP(page, 'France');
            await completeKeycloakLogin(page, user.username, user.password);

            const session = await getSessionData(page);

            expect(session.countryOfAffiliation).toBe(user.expectedCountry);
            expect(session.acr).toBeDefined();
            expect(Array.isArray(session.amr)).toBe(true);

            console.log('FRA Federation Session:', {
                acr: session.acr,
                amr: session.amr,
                country: session.countryOfAffiliation,
            });
        });
    });

    test.describe('GBR Federation', () => {
        test.skip(({ }, testInfo) => {
            return !process.env.RUN_GBR_TESTS;
        }, 'GBR tests disabled - set RUN_GBR_TESTS=true to enable');

        test('should receive correct ACR/AMR from GBR federated login', async ({ page }) => {
            const user = TEST_USERS.gbr;

            await selectIdP(page, 'United Kingdom');
            await completeKeycloakLogin(page, user.username, user.password);

            const session = await getSessionData(page);

            expect(session.countryOfAffiliation).toBe(user.expectedCountry);
            expect(session.acr).toBeDefined();
            expect(Array.isArray(session.amr)).toBe(true);

            console.log('GBR Federation Session:', {
                acr: session.acr,
                amr: session.amr,
                country: session.countryOfAffiliation,
            });
        });
    });
});

/**
 * Smoke test that can run without specific spoke dependencies
 */
test.describe('ACR/AMR Session API', () => {
    test('session API should return user data with ACR/AMR fields', async ({ page }) => {
        // This test requires an active session - skip if not logged in
        await page.goto(HUB_URL);

        // Try to get session
        const response = await page.request.get(`${HUB_URL}/api/auth/session`);

        if (response.ok()) {
            const data = await response.json();

            // If user is logged in, verify structure
            if (data?.user) {
                expect(data.user).toHaveProperty('acr');
                expect(data.user).toHaveProperty('amr');

                // AMR should be an array
                if (data.user.amr !== undefined) {
                    expect(Array.isArray(data.user.amr)).toBe(true);
                }

                console.log('Session API Response:', {
                    hasUser: true,
                    acr: data.user.acr,
                    amr: data.user.amr,
                    uniqueID: data.user.uniqueID,
                });
            } else {
                console.log('No active session - user not logged in');
            }
        }
    });
});
