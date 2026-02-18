/**
 * External IdP Federation Flow E2E Tests (REFACTORED)
 * 
 * Tests federation flow with multiple IdPs and protocols
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Uses Page Object Model
 * - ✅ Removed hardcoded URLs
 * - ✅ Removed custom login helpers
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';

// ESP (Spain) users not yet in centralized test-users.ts — safe fallback prevents crash at module load
const ESP_SECRET = ((TEST_USERS as Record<string, any>).ESP?.SECRET ?? {
  username: 'testuser-esp-3', password: 'TestUser2025!Pilot',
  email: 'testuser-esp-3@dive-demo.example', clearance: 'SECRET', clearanceLevel: 3,
  country: 'Spain', countryCode: 'ESP', coi: ['NATO-COSMIC'], dutyOrg: 'Spain Defense',
  mfaRequired: true, mfaType: 'otp', idp: 'Spain', realmName: 'dive-v3-broker-usa',
}) as import('./fixtures/test-users').TestUser;

test.describe('External IdP Federation - Spain (Refactored)', { tag: ['@critical', '@flaky'] }, () => {
    test.beforeEach(() => {
        test.skip(process.env.CI === 'true', 'External IdP federation requires multi-instance infrastructure');
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Spain SECRET user can log in', async ({ page }) => {
        test.step('Login via Spain IdP', async () => {
            await loginAs(page, ESP_SECRET);
        });

        test.step('Verify dashboard shows Spanish user info', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                ESP_SECRET.username,
                ESP_SECRET.clearance,
                ESP_SECRET.countryCode
            );
        });

        test.step('Verify NATO-COSMIC COI', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyCOIBadges(['NATO-COSMIC']);
        });
    });

    test('Spain user can access NATO-COSMIC resource', async ({ page }) => {
        test.step('Login as Spanish SECRET user', async () => {
            await loginAs(page, ESP_SECRET);
        });

        test.step('Verify access to NATO document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        test.step('Verify resource content visible', async () => {
            const content = page.getByText(TEST_RESOURCES.SECRET.NATO.content);
            await expect(content).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Spain user denied access to US-ONLY resource', async ({ page }) => {
        test.step('Login as Spanish SECRET user', async () => {
            await loginAs(page, ESP_SECRET);
        });

        test.step('Verify US-ONLY document is denied', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.USA_ONLY.resourceId);
        });

        test.step('Verify denial reason mentions country/releasability', async () => {
            const denialReason = page.getByText(/country|releasability|not releasable to/i);
            await expect(denialReason).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Spain user denied access to FVEY resource', async ({ page }) => {
        test.step('Login as Spanish SECRET user', async () => {
            await loginAs(page, ESP_SECRET);
        });

        test.step('Verify FVEY document is denied (Spain not in FVEY)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });
});

test.describe('External IdP Federation - USA (Refactored)', () => {
    test.beforeEach(() => {
        test.skip(process.env.CI === 'true', 'External IdP federation requires multi-instance infrastructure');
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('USA SECRET user can log in', async ({ page }) => {
        test.step('Login via USA IdP', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);
        });

        test.step('Verify dashboard shows USA user info', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.USA.SECRET.username,
                TEST_USERS.USA.SECRET.clearance,
                TEST_USERS.USA.SECRET.countryCode
            );
        });

        test.step('Verify COI badges', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyCOIBadges(['NATO-COSMIC']);
        });
    });

    test('USA user can access FVEY resource', async ({ page }) => {
        test.step('Login as USA SECRET user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);
        });

        test.step('Verify access to FVEY document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });

        test.step('Verify FVEY resource content visible', async () => {
            const content = page.getByText(TEST_RESOURCES.SECRET.FVEY.content);
            await expect(content).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('USA user can access US-ONLY resource', async ({ page }) => {
        test.step('Login as USA SECRET user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);
        });

        test.step('Verify access to US-ONLY document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.USA_ONLY.resourceId);
        });
    });
});

test.describe('External IdP Federation - France (Refactored)', () => {
    test.beforeEach(() => {
        test.skip(process.env.CI === 'true', 'External IdP federation requires multi-instance infrastructure');
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('France SECRET user can log in', async ({ page }) => {
        test.step('Login via France IdP', async () => {
            await loginAs(page, TEST_USERS.FRA.SECRET);
        });

        test.step('Verify dashboard shows French user info', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.FRA.SECRET.username,
                TEST_USERS.FRA.SECRET.clearance,
                TEST_USERS.FRA.SECRET.countryCode
            );
        });
    });

    test('France user can access NATO but not FVEY', async ({ page }) => {
        test.step('Login as French SECRET user', async () => {
            await loginAs(page, TEST_USERS.FRA.SECRET);
        });

        test.step('Verify access to NATO document (ALLOW)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        test.step('Verify FVEY document is denied (France not in FVEY)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });
});

test.describe('External IdP Federation - Cross-Nation (Refactored)', () => {
    test.beforeEach(() => {
        test.skip(process.env.CI === 'true', 'External IdP federation requires multi-instance infrastructure');
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Multiple nations can access same NATO document', async ({ page }) => {
        const natoUsers = [
            TEST_USERS.USA.SECRET,
            TEST_USERS.FRA.SECRET,
            ESP_SECRET,
            TEST_USERS.DEU.SECRET,
        ];

        for (const user of natoUsers) {
            test.step(`${user.countryCode} user can access NATO document`, async () => {
                await loginAs(page, user);

                const resources = new ResourcesPage(page);
                await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);

                await logout(page);
            });
        }
    });

    test('Only FVEY nations can access FVEY documents', async ({ page }) => {
        // FVEY members
        const fveyUsers = [TEST_USERS.USA.SECRET, TEST_USERS.GBR.SECRET];
        
        // Non-FVEY members
        const nonFveyUsers = [TEST_USERS.FRA.SECRET, ESP_SECRET];

        test.step('FVEY members can access', async () => {
            for (const user of fveyUsers) {
                await loginAs(page, user);
                const resources = new ResourcesPage(page);
                await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
                await logout(page);
            }
        });

        test.step('Non-FVEY members denied', async () => {
            for (const user of nonFveyUsers) {
                await loginAs(page, user);
                const resources = new ResourcesPage(page);
                await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
                await logout(page);
            }
        });
    });

    test('Logout works correctly for all IdPs', async ({ page }) => {
        const testUsers = [
            TEST_USERS.USA.SECRET,
            TEST_USERS.FRA.SECRET,
            ESP_SECRET,
        ];

        for (const user of testUsers) {
            test.step(`${user.countryCode} user logout`, async () => {
                await loginAs(page, user);

                const dashboard = new DashboardPage(page);
                await dashboard.verifyLoggedIn();

                await logout(page);

                // Verify logged out - should see IdP selector
                const loginButton = page.getByRole('button', { name: /United States|France|Spain/i }).first();
                await expect(loginButton).toBeVisible({
                    timeout: TEST_CONFIG.TIMEOUTS.ACTION,
                });
            });
        }
    });
});
