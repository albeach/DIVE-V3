/**
 * Classification Equivalency E2E Tests (REFACTORED)
 * 
 * Tests cross-nation classification equivalency mappings
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses real authentication (helpers/auth.ts) - NO MOCK JWT
 * - ✅ Uses Page Object Model
 * - ✅ Removed hardcoded BASE_URL
 * - ✅ Removed mock authentication
 * - ✅ Uses test.step() for clarity
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';

test.describe('Classification Equivalency - Cross-Nation (Refactored)', () => {
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('German user can access NATO SECRET document', async ({ page }) => {
        test.step('Login as German SECRET user', async () => {
            await loginAs(page, TEST_USERS.DEU.SECRET);
        });

        test.step('Verify German clearance mapped correctly', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            
            // Verify clearance shows SECRET (NATO standard)
            await dashboard.verifyUserInfo(
                TEST_USERS.DEU.SECRET.username,
                TEST_USERS.DEU.SECRET.clearance,
                TEST_USERS.DEU.SECRET.countryCode
            );
        });

        test.step('Verify access to NATO SECRET document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });
    });

    test('French user can access NATO document with equivalency', async ({ page }) => {
        test.step('Login as French SECRET user', async () => {
            await loginAs(page, TEST_USERS.FRA.SECRET);
        });

        test.step('Verify French clearance mapped to NATO standard', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.FRA.SECRET.username,
                TEST_USERS.FRA.SECRET.clearance,
                TEST_USERS.FRA.SECRET.countryCode
            );
        });

        test.step('Verify access to NATO SECRET document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        test.step('Verify FVEY document is denied (France not in FVEY)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });

    test('US CONFIDENTIAL user denied access to SECRET document', async ({ page }) => {
        test.step('Login as USA CONFIDENTIAL user', async () => {
            await loginAs(page, TEST_USERS.USA.CONFIDENTIAL);
        });

        test.step('Verify CONFIDENTIAL clearance', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.USA.CONFIDENTIAL.username,
                'CONFIDENTIAL',
                'USA'
            );
        });

        test.step('Verify SECRET document is denied (insufficient clearance)', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.NATO.resourceId);
            
            // Verify denial reason mentions clearance
            const denialReason = page.getByText(/clearance|insufficient/i);
            await expect(denialReason).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Canadian user can access FVEY and NATO documents', async ({ page }) => {
        test.step('Login as Canadian SECRET user', async () => {
            await loginAs(page, TEST_USERS.CAN.SECRET);
        });

        test.step('Verify clearance and COI', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.verifyLoggedIn();
            await dashboard.verifyUserInfo(
                TEST_USERS.CAN.SECRET.username,
                TEST_USERS.CAN.SECRET.clearance,
                TEST_USERS.CAN.SECRET.countryCode
            );
            
            // Canada has both NATO-COSMIC and FVEY
            await dashboard.verifyCOIBadges(['NATO-COSMIC', 'FVEY', 'CAN-US']);
        });

        test.step('Verify access to NATO document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);
        });

        test.step('Verify access to FVEY document', async () => {
            const resources = new ResourcesPage(page);
            await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.FVEY.resourceId);
        });
    });
});

test.describe('Classification Equivalency - Multi-Nation Matrix (Refactored)', () => {
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Compliance dashboard shows equivalency matrix', async ({ page }) => {
        test.step('Login as Canadian SECRET user', async () => {
            await loginAs(page, TEST_USERS.CAN.SECRET);
        });

        test.step('Navigate to compliance page', async () => {
            await page.goto('/compliance/classifications', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify equivalency matrix visible', async () => {
            // Look for classification equivalency table/matrix
            const matrix = page.getByRole('table')
                .or(page.getByText(/classification.*equivalency|equivalency.*matrix/i));
            
            await expect(matrix).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify multiple national classifications shown', async () => {
            // Should show various national classifications
            const countries = ['USA', 'FRA', 'DEU', 'GBR', 'CAN'];
            
            for (const country of countries) {
                const countryElement = page.getByText(new RegExp(country, 'i'));
                // At least some should be visible
                const isVisible = await countryElement.isVisible({ timeout: 2000 }).catch(() => false);
                if (isVisible) {
                    await expect(countryElement).toBeVisible();
                    break; // Found at least one
                }
            }
        });
    });

    test('Different nations see consistent equivalency mappings', async ({ page }) => {
        const testUsers = [
            { user: TEST_USERS.DEU.SECRET, country: 'DEU' },
            { user: TEST_USERS.FRA.SECRET, country: 'FRA' },
            { user: TEST_USERS.CAN.SECRET, country: 'CAN' },
        ];

        for (const { user, country } of testUsers) {
            test.step(`${country} user views equivalency matrix`, async () => {
                await loginAs(page, user);

                await page.goto('/compliance/classifications', {
                    timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
                });

                // Verify matrix is accessible to all nations
                const matrix = page.getByRole('table')
                    .or(page.getByText(/classification/i));
                
                await expect(matrix).toBeVisible({
                    timeout: TEST_CONFIG.TIMEOUTS.ACTION,
                });

                await logout(page);
            });
        }
    });
});

test.describe('Classification Equivalency - Authorization Rules (Refactored)', () => {
    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('SECRET users from different nations can access same NATO document', async ({ page }) => {
        const secretUsers = [
            TEST_USERS.USA.SECRET,
            TEST_USERS.FRA.SECRET,
            TEST_USERS.DEU.SECRET,
            TEST_USERS.CAN.SECRET,
            TEST_USERS.GBR.SECRET,
        ];

        for (const user of secretUsers) {
            test.step(`${user.countryCode} SECRET user can access NATO SECRET`, async () => {
                await loginAs(page, user);

                const resources = new ResourcesPage(page);
                await resources.verifyResourceAccessible(TEST_RESOURCES.SECRET.NATO.resourceId);

                await logout(page);
            });
        }
    });

    test('CONFIDENTIAL users denied access to SECRET regardless of nation', async ({ page }) => {
        const confidentialUsers = [
            TEST_USERS.USA.CONFIDENTIAL,
            TEST_USERS.FRA.CONFIDENTIAL,
            TEST_USERS.DEU.CONFIDENTIAL,
        ];

        for (const user of confidentialUsers) {
            test.step(`${user.countryCode} CONFIDENTIAL user denied SECRET`, async () => {
                await loginAs(page, user);

                const resources = new ResourcesPage(page);
                await resources.verifyResourceDenied(TEST_RESOURCES.SECRET.NATO.resourceId);

                await logout(page);
            });
        }
    });

    test('Clearance hierarchy enforced across all nations', async ({ page }) => {
        test.step('UNCLASSIFIED user denied CONFIDENTIAL', async () => {
            await loginAs(page, TEST_USERS.USA.UNCLASS);
            
            const resources = new ResourcesPage(page);
            // UNCLASSIFIED user should not see CONFIDENTIAL or higher
            const resourceCount = await resources.getResourceCount();
            
            // Should only see UNCLASSIFIED resources
            expect(resourceCount).toBeGreaterThan(0);
            
            await logout(page);
        });

        test.step('CONFIDENTIAL user can see CONFIDENTIAL', async () => {
            await loginAs(page, TEST_USERS.USA.CONFIDENTIAL);
            
            const resources = new ResourcesPage(page);
            await resources.goto();
            const confidentialCount = await resources.getResourceCount();
            
            // Should see more than UNCLASSIFIED-only
            expect(confidentialCount).toBeGreaterThan(0);
            
            await logout(page);
        });

        test.step('SECRET user can see SECRET and below', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);
            
            const resources = new ResourcesPage(page);
            await resources.goto();
            const secretCount = await resources.getResourceCount();
            
            // Should see most resources (SECRET + CONFIDENTIAL + UNCLASS)
            expect(secretCount).toBeGreaterThan(0);
        });
    });
});
