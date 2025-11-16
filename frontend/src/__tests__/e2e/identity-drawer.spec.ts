/**
 * Identity Drawer E2E Test (REFACTORED - Modern Patterns)
 * 
 * Tests the global Cmd+I/Ctrl+I keyboard shortcut for opening the identity drawer.
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Uses Page Object Model (pages/DashboardPage.ts)
 * - ✅ Uses test.step() for clarity
 * - ✅ Proper cleanup (logout)
 * - ✅ Explicit waits (no arbitrary timeouts)
 * - ✅ Tests with multiple user types
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';

test.describe('Identity Drawer - Global Shortcut (Refactored)', () => {
    test.afterEach(async ({ page }) => {
        // Cleanup: logout after each test
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed (may already be logged out):', error);
        }
    });

    test('Cmd+I opens the identity drawer for USA SECRET user', async ({ page }) => {
        test.step('Login as USA SECRET user', async () => {
            await loginAs(page, TEST_USERS.USA.SECRET);
        });

        test.step('Navigate to dashboard', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goto();
            await dashboard.verifyLoggedIn();
        });

        test.step('Open identity drawer with Cmd+I', async () => {
            const dashboard = new DashboardPage(page);
            
            // Press Cmd+I (Meta+I on Mac, Control+I on Windows/Linux)
            await page.keyboard.press('Meta+I').catch(async () => {
                await page.keyboard.press('Control+I');
            });

            // Drawer should appear
            await expect(dashboard.identityDrawer).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify drawer shows user attributes', async () => {
            // Should show clearance
            const clearance = page.getByText(/SECRET/);
            await expect(clearance).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

            // Should show country
            const country = page.getByText(/USA|United States/);
            await expect(country).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

            // Should show COI (SECRET user has NATO-COSMIC)
            const coi = page.getByText(/NATO-COSMIC/);
            await expect(coi).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

            // Should show AAL/ACR if present
            const aal = page.locator('text=AAL').or(page.locator('text=acr')).first();
            // AAL is optional, just check if visible (don't fail if not present)
            await aal.isVisible().catch(() => false);
        });

        test.step('Close drawer with Escape', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.closeIdentityDrawer();

            // Verify drawer is hidden
            await expect(dashboard.identityDrawer).not.toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Cmd+I works for UNCLASSIFIED user (no MFA)', async ({ page }) => {
        test.step('Login as USA UNCLASSIFIED user', async () => {
            await loginAs(page, TEST_USERS.USA.UNCLASS);
        });

        test.step('Navigate to dashboard', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goto();
            await dashboard.verifyLoggedIn();
        });

        test.step('Open identity drawer', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.openIdentityDrawer();

            await expect(dashboard.identityDrawer).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify drawer shows UNCLASSIFIED clearance', async () => {
            const clearance = page.getByText(/UNCLASSIFIED/);
            await expect(clearance).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
        });
    });

    test('Cmd+I works for France SECRET user', async ({ page }) => {
        test.step('Login as France SECRET user', async () => {
            await loginAs(page, TEST_USERS.FRA.SECRET);
        });

        test.step('Navigate to dashboard', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goto();
            await dashboard.verifyLoggedIn();
        });

        test.step('Open identity drawer', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.openIdentityDrawer();

            await expect(dashboard.identityDrawer).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify drawer shows France attributes', async () => {
            // Should show SECRET clearance
            const clearance = page.getByText(/SECRET/);
            await expect(clearance).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

            // Should show France/FRA
            const country = page.getByText(/FRA|France/);
            await expect(country).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

            // France SECRET user has NATO-COSMIC COI
            const coi = page.getByText(/NATO-COSMIC/);
            await expect(coi).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
        });
    });

    test('Identity drawer shows correct COI badges', async ({ page }) => {
        test.step('Login as USA TOP_SECRET user', async () => {
            // TOP_SECRET user has multiple COIs: NATO-COSMIC, FVEY, CAN-US
            await loginAs(page, TEST_USERS.USA.TOP_SECRET);
        });

        test.step('Open identity drawer', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goto();
            await dashboard.openIdentityDrawer();
        });

        test.step('Verify all COI badges are displayed', async () => {
            const expectedCOIs = TEST_USERS.USA.TOP_SECRET.coi; // ["NATO-COSMIC", "FVEY", "CAN-US"]

            for (const coi of expectedCOIs) {
                const badge = page.getByText(new RegExp(coi, 'i'));
                await expect(badge).toBeVisible({
                    timeout: TEST_CONFIG.TIMEOUTS.ACTION,
                });
            }
        });
    });
});
