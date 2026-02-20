/**
 * NATO Multi-Nation E2E Tests (REFACTORED)
 * 
 * Tests login and authorization for 6 NATO nations:
 * DEU, GBR, ITA, ESP, POL, NLD
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Uses Page Object Model
 * - ✅ Removed duplicate login code
 * - ✅ Removed hardcoded BASE_URL
 * - ✅ Uses test.step() for clarity
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';

test.describe('NATO Expansion: Login Flows (Refactored)', { tag: '@smoke' }, () => {
    test.skip(process.env.CI === 'true', 'CI: multi-nation test users not provisioned');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('DEU (Germany) - User can log in', async ({ page }) => {
        await test.step('Login as German SECRET user', async () => {
            await loginAs(page, TEST_USERS.DEU.SECRET);
        });

        await test.step('Verify dashboard loaded', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.DEU.SECRET.username,
                TEST_USERS.DEU.SECRET.clearance,
                TEST_USERS.DEU.SECRET.countryCode
            );
        });

        await test.step('Verify NATO-COSMIC COI', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyCOIBadges(['NATO-COSMIC']);
        });
    });

    test('GBR (United Kingdom) - User can log in', async ({ page }) => {
        await test.step('Login as UK SECRET user', async () => {
            await loginAs(page, TEST_USERS.GBR.SECRET);
        });

        await test.step('Verify dashboard shows UK user info', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.GBR.SECRET.username,
                TEST_USERS.GBR.SECRET.clearance,
                TEST_USERS.GBR.SECRET.countryCode
            );
        });

        await test.step('Verify FVEY COI badge', async () => {
            // UK is in FVEY
            const dashboard = new DashboardPage(page);
            await dashboard.verifyCOIBadges(['NATO-COSMIC', 'FVEY']);
        });
    });

    test('ITA (Italy) - User can log in', async ({ page }) => {
        await test.step('Login as Italian SECRET user', async () => {
            await loginAs(page, TEST_USERS.ITA.SECRET);
        });

        await test.step('Verify dashboard loaded', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.ITA.SECRET.username,
                TEST_USERS.ITA.SECRET.clearance,
                TEST_USERS.ITA.SECRET.countryCode
            );
        });
    });

    test('ESP (Spain) - User can log in', async ({ page }) => {
        await test.step('Login as Spanish SECRET user', async () => {
            await loginAs(page, TEST_USERS.ESP.SECRET);
        });

        await test.step('Verify dashboard loaded', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.ESP.SECRET.username,
                TEST_USERS.ESP.SECRET.clearance,
                TEST_USERS.ESP.SECRET.countryCode
            );
        });
    });

    test('POL (Poland) - User can log in', async ({ page }) => {
        await test.step('Login as Polish SECRET user', async () => {
            await loginAs(page, TEST_USERS.POL.SECRET);
        });

        await test.step('Verify dashboard loaded', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.POL.SECRET.username,
                TEST_USERS.POL.SECRET.clearance,
                TEST_USERS.POL.SECRET.countryCode
            );
        });
    });

    test('NLD (Netherlands) - User can log in', async ({ page }) => {
        await test.step('Login as Dutch SECRET user', async () => {
            await loginAs(page, TEST_USERS.NLD.SECRET);
        });

        await test.step('Verify dashboard loaded', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.NLD.SECRET.username,
                TEST_USERS.NLD.SECRET.clearance,
                TEST_USERS.NLD.SECRET.countryCode
            );
        });
    });
});

test.describe('NATO Expansion: Cross-Nation Authorization (Refactored)', () => {
    test.skip(process.env.CI === 'true', 'CI: multi-nation test users not provisioned');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('German user can access NATO document', async ({ page }) => {
        await test.step('Login as German SECRET user', async () => {
            await loginAs(page, TEST_USERS.DEU.SECRET);
        });

        await test.step('Verify access to NATO document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        await test.step('Verify NATO document content visible', async () => {
            const content = page.getByText(TEST_RESOURCES.SECRET.NATO.content);
            await expect(content).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('UK user can access FVEY document', async ({ page }) => {
        await test.step('Login as UK SECRET user', async () => {
            await loginAs(page, TEST_USERS.GBR.SECRET);
        });

        await test.step('Verify access to FVEY document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });

    test('Italian user can access NATO but not FVEY', async ({ page }) => {
        await test.step('Login as Italian SECRET user', async () => {
            await loginAs(page, TEST_USERS.ITA.SECRET);
        });

        await test.step('Verify access to NATO document (ALLOW)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        await test.step('Verify FVEY document is denied (Italy not in FVEY)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });

    test('German user denied access to USA-only document', async ({ page }) => {
        await test.step('Login as German SECRET user', async () => {
            await loginAs(page, TEST_USERS.DEU.SECRET);
        });

        await test.step('Verify USA-only document is denied', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.USA_ONLY.resourceId);
            
            // Verify denial reason mentions country/releasability
            const denialReason = page.getByText(/country|releasability|not releasable/i);
            await expect(denialReason).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });
});

test.describe('NATO Expansion: Multi-Nation Scenarios (Refactored)', () => {
    test.skip(process.env.CI === 'true', 'CI: multi-nation test users not provisioned');

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('All 6 nations can access NATO coalition documents', async ({ page }) => {
        const natoUsers = [
            TEST_USERS.DEU.SECRET,
            TEST_USERS.GBR.SECRET,
            TEST_USERS.ITA.SECRET,
            TEST_USERS.ESP.SECRET,
            TEST_USERS.POL.SECRET,
            TEST_USERS.NLD.SECRET,
        ];

        for (const user of natoUsers) {
            await test.step(`${user.countryCode} user can access NATO document`, async () => {
                await loginAs(page, user);

                const resources = new ResourcesPage(page);
                await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);

                await logout(page);
            });
        }
    });

    test('NATO users see different resource counts based on clearance', async ({ page }) => {
        let unclassCount = 0;
        let secretCount = 0;

        await test.step('UNCLASSIFIED user resource count', async () => {
            await loginAs(page, TEST_USERS.DEU.UNCLASS);

            const resources = new ResourcesPage(page);
            await resources.goto();
            unclassCount = await resources.getResourceCount();

            await logout(page);
        });

        await test.step('SECRET user resource count', async () => {
            await loginAs(page, TEST_USERS.DEU.SECRET);

            const resources = new ResourcesPage(page);
            await resources.goto();
            secretCount = await resources.getResourceCount();

            await logout(page);
        });

        await test.step('Verify SECRET user sees more resources', async () => {
            expect(secretCount).toBeGreaterThan(unclassCount);
        });
    });

    test('UK and USA users both can access FVEY documents', async ({ page }) => {
        // Test FVEY COI intersection

        await test.step('UK user can access FVEY document', async () => {
            await loginAs(page, TEST_USERS.GBR.SECRET);

            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);

            await logout(page);
        });

        await test.step('USA user can access FVEY document', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);

            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);

            await logout(page);
        });

        await test.step('France (non-FVEY) user denied access', async () => {
            await loginAs(page, TEST_USERS.FRA.SECRET);

            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });

    test('Identity drawer shows correct country for each nation', async ({ page }) => {
        const testUsers = [
            { user: TEST_USERS.DEU.SECRET, country: 'DEU' },
            { user: TEST_USERS.GBR.SECRET, country: 'GBR' },
            { user: TEST_USERS.ITA.SECRET, country: 'ITA' },
        ];

        for (const { user, country } of testUsers) {
            await test.step(`${country} user identity drawer`, async () => {
                await loginAs(page, user);

                const dashboard = new DashboardPage(page);
                await dashboard.openIdentityDrawer();

                // Verify country is displayed
                const countryElement = page.getByText(new RegExp(country, 'i'));
                await expect(countryElement).toBeVisible({
                    timeout: TEST_CONFIG.TIMEOUTS.ACTION,
                });

                await dashboard.closeIdentityDrawer();
                await logout(page);
            });
        }
    });
});
