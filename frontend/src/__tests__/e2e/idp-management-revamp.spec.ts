/**
 * IdP Management E2E Tests (REFACTORED)
 * 
 * Tests admin functionality for IdP management
 * 
 * REFACTORED: November 16, 2025
 * - ✅ Uses centralized test users (fixtures/test-users.ts)
 * - ✅ Uses authentication helper (helpers/auth.ts)
 * - ✅ Removed hardcoded BASE_URL
 * - ✅ Removed defensive catches
 * - ✅ Uses test.step() properly
 * - ✅ Explicit waits instead of arbitrary timeouts
 * 
 * NOTE: Admin tests may require special admin user credentials
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';

test.describe('IdP Management - Admin Features (Refactored)', { tag: '@smoke' }, () => {
    test.beforeEach(async ({ page }) => {
        // Login as USA user (may need admin role verification)
        await loginAs(page, TEST_USERS.USA.SECRET);
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Admin can navigate to IdP management page', async ({ page }) => {
        test.step('Navigate to admin IdP page', async () => {
            await page.goto('/admin/idp', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify IdP management page loaded', async () => {
            // Look for page heading or IdP cards
            const heading = page.getByRole('heading', { name: /identity provider|idp/i });
            await expect(heading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify stats bar or summary visible', async () => {
            const stats = page.getByText(/total|active|configured/i).first();
            await expect(stats).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin can view IdP list', async ({ page }) => {
        test.step('Navigate to IdP management', async () => {
            await page.goto('/admin/idp', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify at least one IdP card visible', async () => {
            const idpCard = page.getByTestId('idp-card')
                .or(page.getByText(/USA|United States|France|Canada/i))
                .first();
            
            await expect(idpCard).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify multiple IdPs listed', async () => {
            // Should show USA, France, Canada, etc.
            const usaIdp = page.getByText(/USA|United States/i);
            const fraIdp = page.getByText(/France|FRA/i);
            
            await expect(usaIdp).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
            await expect(fraIdp).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin can navigate to analytics page', async ({ page }) => {
        test.step('Navigate to admin analytics', async () => {
            await page.goto('/admin/analytics', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify analytics page loaded', async () => {
            const heading = page.getByRole('heading', { name: /analytics|metrics|statistics/i });
            await expect(heading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin can navigate to logs page', async ({ page }) => {
        test.step('Navigate to admin logs', async () => {
            await page.goto('/admin/logs', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify logs page loaded', async () => {
            const heading = page.getByRole('heading', { name: /logs|audit|activity/i });
            await expect(heading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin can navigate to approvals page', async ({ page }) => {
        test.step('Navigate to admin approvals', async () => {
            await page.goto('/admin/approvals', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify approvals page loaded', async () => {
            const heading = page.getByRole('heading', { name: /approvals|pending|requests/i });
            await expect(heading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin navigation links work correctly', async ({ page }) => {
        test.step('Start from dashboard', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goto();
            await dashboard.verifyLoggedIn();
        });

        test.step('Navigate to admin section', async () => {
            const dashboard = new DashboardPage(page);
            await dashboard.goToAdmin();
            
            // Should be on some admin page
            await page.waitForURL(/\/admin/, {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify admin navigation menu exists', async () => {
            const adminNav = page.getByRole('navigation')
                .or(page.getByRole('list'))
                .first();
            
            await expect(adminNav).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('Admin can view dashboard with metrics', async ({ page }) => {
        test.step('Navigate to admin dashboard', async () => {
            await page.goto('/admin/dashboard', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify dashboard loaded with metrics', async () => {
            // Look for common dashboard elements
            const metrics = page.getByText(/users|sessions|resources|total/i).first();
            await expect(metrics).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });
});

test.describe('IdP Management - Create/Update Operations (Refactored)', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET);
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Admin can navigate to create new IdP page', async ({ page }) => {
        test.step('Navigate to IdP management', async () => {
            await page.goto('/admin/idp', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Click create/add new IdP button', async () => {
            const createButton = page.getByRole('button', { name: /add|create|new idp/i });
            await expect(createButton).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
            await createButton.click();
        });

        test.step('Verify new IdP form/page loaded', async () => {
            // Should navigate to /admin/idp/new or show modal
            const formHeading = page.getByRole('heading', { name: /add|create|new.*idp/i });
            await expect(formHeading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('New IdP page loads with form fields', async ({ page }) => {
        test.step('Navigate directly to new IdP page', async () => {
            await page.goto('/admin/idp/new', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify form fields exist', async () => {
            // Common IdP form fields
            const aliasField = page.getByLabel(/alias|identifier/i);
            const nameField = page.getByLabel(/name|display name/i);
            
            await expect(aliasField.or(nameField)).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });

        test.step('Verify protocol selection available', async () => {
            // OIDC/SAML selection
            const protocolSelect = page.getByLabel(/protocol|type/i);
            await expect(protocolSelect).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });
});

test.describe('IdP Management - SP Registry (Refactored)', () => {
    test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET);
    });

    test.afterEach(async ({ page }) => {
        try {
            await logout(page);
        } catch (error) {
            console.log('⚠️ Logout failed:', error);
        }
    });

    test('Admin can navigate to SP registry', async ({ page }) => {
        test.step('Navigate to SP registry page', async () => {
            await page.goto('/admin/sp-registry', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify SP registry page loaded', async () => {
            const heading = page.getByRole('heading', { name: /service provider|sp.*registry/i });
            await expect(heading).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });

    test('SP registry shows list of service providers', async ({ page }) => {
        test.step('Navigate to SP registry', async () => {
            await page.goto('/admin/sp-registry', {
                timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
            });
        });

        test.step('Verify SP list or table visible', async () => {
            const spList = page.getByRole('table')
                .or(page.getByRole('list'))
                .or(page.getByTestId('sp-list'));
            
            await expect(spList).toBeVisible({
                timeout: TEST_CONFIG.TIMEOUTS.ACTION,
            });
        });
    });
});
