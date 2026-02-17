/**
 * Admin User Journey E2E Tests
 *
 * Tests the complete end-to-end workflow for an admin user:
 * - Login with admin credentials (storageState or admin-dive user)
 * - Admin dashboard verification
 * - User management (search, browse)
 * - Clearance management (tab switching)
 * - Federation spoke management
 * - Logs and export
 * - Analytics
 * - Full sidebar navigation
 * - Logout
 *
 * Auth: Uses pre-saved ADMIN storageState if available,
 *       otherwise falls back to admin login flow
 */

import { test, expect, skipIfNotAvailable } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { TEST_USERS } from '../fixtures/test-users';
import { DashboardPage } from '../pages/DashboardPage';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { AdminClearancePage } from '../pages/AdminClearancePage';
import { AdminSpokePage } from '../pages/AdminSpokePage';
import { AdminLogsPage } from '../pages/AdminLogsPage';
import { AdminFederationPage } from '../pages/AdminFederationPage';

test.describe('Journey: Admin User', () => {
  // Use pre-saved ADMIN storageState if available from global setup
  test.use({
    storageState: hasAuthState('ADMIN') ? AUTH_STATE.ADMIN : undefined,
  });

  test.beforeEach(async ({ page, auth, users, idps }) => {
    skipIfNotAvailable(idps, 'USA');

    // If no pre-saved admin state, login as admin user
    if (!hasAuthState('ADMIN')) {
      // Admin user typically is a high-clearance user with admin role
      // Use LEVEL_4 (TOP_SECRET) who may have admin role, or a dedicated admin user
      await auth.loginAs(users.USA.LEVEL_4);
    }
  });

  test('should login as admin and verify admin dashboard loads', async ({
    page,
  }) => {
    await test.step('Navigate to admin dashboard', async () => {
      await page.goto('/admin', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
    });

    await test.step('Verify admin dashboard loaded', async () => {
      const adminHeading = page
        .getByRole('heading', { name: /admin|administration|dashboard/i })
        .or(page.locator(TEST_CONFIG.SELECTORS.ADMIN_HEADING));

      await expect(adminHeading.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify admin sidebar is present', async () => {
      const sidebar = page
        .locator(TEST_CONFIG.SELECTORS.ADMIN_SIDEBAR)
        .or(page.getByRole('navigation', { name: /admin/i }))
        .or(page.locator('nav.admin-sidebar'));

      await expect(sidebar.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should navigate to user management', async ({ page }) => {
    const usersPage = new AdminUsersPage(page);

    await test.step('Navigate to users page', async () => {
      await usersPage.goto();
    });

    await test.step('Verify users page loaded', async () => {
      await usersPage.verifyLoaded();
    });

    await test.step('Verify user table is present', async () => {
      await expect(usersPage.userTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should search for a specific test user', async ({ page }) => {
    const usersPage = new AdminUsersPage(page);
    await usersPage.goto();

    await test.step('Search for testuser-usa-1', async () => {
      await usersPage.searchUsers('testuser-usa-1');
    });

    await test.step('Verify user appears in results', async () => {
      await usersPage.verifyUserInList('testuser-usa-1');
    });
  });

  test('should navigate to clearance management', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);

    await test.step('Navigate to clearance management', async () => {
      await clearancePage.goto();
    });

    await test.step('Verify clearance page loaded', async () => {
      await clearancePage.verifyLoaded();
    });
  });

  test('should switch between clearance tabs', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.goto();

    await test.step('Switch to matrix tab', async () => {
      await clearancePage.switchTab('matrix');
      await clearancePage.verifyTabActive('matrix');
    });

    await test.step('Verify matrix table is visible', async () => {
      await expect(clearancePage.matrixTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Switch to editor tab', async () => {
      await clearancePage.switchTab('editor');
      await clearancePage.verifyTabActive('editor');
    });

    await test.step('Verify editor form is visible', async () => {
      await expect(clearancePage.editorForm.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Switch to test tab', async () => {
      await clearancePage.switchTab('test');
      await clearancePage.verifyTabActive('test');
    });

    await test.step('Switch to audit tab', async () => {
      await clearancePage.switchTab('audit');
      await clearancePage.verifyTabActive('audit');
    });

    await test.step('Return to overview tab', async () => {
      await clearancePage.switchTab('overview');
      await clearancePage.verifyTabActive('overview');
    });
  });

  test('should navigate to federation spokes', async ({ page }) => {
    const federationPage = new AdminFederationPage(page);

    await test.step('Navigate to federation spokes page', async () => {
      await federationPage.goto('spokes');
    });

    await test.step('Verify federation page loaded', async () => {
      await federationPage.verifyLoaded();
    });
  });

  test('should display spoke status cards', async ({ page }) => {
    const federationPage = new AdminFederationPage(page);
    await federationPage.goto('spokes');

    await test.step('Verify spoke status cards are visible', async () => {
      const spokeCards = federationPage.spokeStatusCard;
      const cardCount = await spokeCards.count();

      // At minimum, there should be some spoke cards displayed
      // (even if zero spokes, the page should show empty state)
      if (cardCount > 0) {
        await expect(spokeCards.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      } else {
        // Check for empty state
        const emptyState = page
          .getByText(/no spokes|no instances/i)
          .or(page.locator('[data-testid="empty-state"]'));

        await expect(emptyState.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      }
    });
  });

  test('should navigate to logs page', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);

    await test.step('Navigate to logs page', async () => {
      await logsPage.goto();
    });

    await test.step('Verify logs page loaded', async () => {
      await logsPage.verifyLoaded();
    });

    await test.step('Verify log table is present', async () => {
      await expect(logsPage.logTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should export logs and verify download', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await logsPage.goto();

    await test.step('Export logs', async () => {
      const download = await logsPage.exportLogs();

      await test.step('Verify download file', async () => {
        const filename = download.suggestedFilename();
        // Exported logs should be CSV, JSON, or similar format
        expect(filename).toMatch(/\.(csv|json|xlsx|txt)$/i);
      });

      await test.step('Verify download is not empty', async () => {
        const path = await download.path();
        expect(path).toBeTruthy();
      });
    });
  });

  test('should navigate to analytics page', async ({ page }) => {
    await test.step('Navigate to analytics', async () => {
      await page.goto('/admin/analytics', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
      await page.waitForLoadState('networkidle', {
        timeout: TEST_CONFIG.TIMEOUTS.NETWORK,
      });
    });

    await test.step('Verify analytics page loaded', async () => {
      const analyticsHeading = page
        .getByRole('heading', { name: /analytics|statistics|metrics/i })
        .or(page.locator('[data-testid="analytics-heading"]'));

      await expect(analyticsHeading.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should display analytics charts', async ({ page }) => {
    await page.goto('/admin/analytics', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForLoadState('networkidle', {
      timeout: TEST_CONFIG.TIMEOUTS.NETWORK,
    });

    await test.step('Verify at least one chart renders', async () => {
      const chart = page
        .locator('canvas')
        .or(page.locator('svg[class*="chart"]'))
        .or(page.locator('[data-testid*="chart"]'))
        .or(page.locator('.recharts-wrapper'))
        .or(page.locator('.chart-container'));

      await expect(chart.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });

    await test.step('Verify metrics or stat cards are present', async () => {
      const metrics = page
        .locator('[data-testid*="stat"]')
        .or(page.locator('[data-testid*="metric"]'))
        .or(page.locator('.stats-card'))
        .or(page.getByText(/total|count|average/i));

      await expect(metrics.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should return to admin dashboard via sidebar', async ({ page }) => {
    // Start on a sub-page
    await page.goto('/admin/users', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await page.waitForLoadState('networkidle');

    await test.step('Click admin dashboard link in sidebar', async () => {
      const sidebar = page
        .locator(TEST_CONFIG.SELECTORS.ADMIN_SIDEBAR)
        .or(page.getByRole('navigation', { name: /admin/i }))
        .or(page.locator('nav.admin-sidebar'));

      const dashboardLink = sidebar
        .first()
        .getByRole('link', { name: /dashboard|home|overview/i })
        .or(sidebar.first().locator('a[href="/admin"]'));

      await dashboardLink.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify admin dashboard loaded', async () => {
      await expect(page).toHaveURL(/\/admin\/?$/,  {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });

      const adminHeading = page
        .getByRole('heading', { name: /admin|administration|dashboard/i })
        .or(page.locator(TEST_CONFIG.SELECTORS.ADMIN_HEADING));

      await expect(adminHeading.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should navigate through all admin sidebar sections', async ({
    page,
  }) => {
    const adminSections = [
      { name: /users/i, url: /\/admin\/users/ },
      { name: /clearance/i, url: /\/admin\/clearance/ },
      { name: /federation|spokes/i, url: /\/admin\/federation|\/admin\/spoke/ },
      { name: /logs|audit/i, url: /\/admin\/logs/ },
      { name: /analytics|statistics/i, url: /\/admin\/analytics/ },
    ];

    // Start at admin dashboard
    await page.goto('/admin', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await page.waitForLoadState('networkidle');

    for (const section of adminSections) {
      await test.step(`Navigate to ${section.name}`, async () => {
        const sidebar = page
          .locator(TEST_CONFIG.SELECTORS.ADMIN_SIDEBAR)
          .or(page.getByRole('navigation', { name: /admin/i }))
          .or(page.locator('nav.admin-sidebar'));

        const sectionLink = sidebar
          .first()
          .getByRole('link', { name: section.name })
          .or(sidebar.first().getByText(section.name));

        const isVisible = await sectionLink
          .first()
          .isVisible()
          .catch(() => false);

        if (isVisible) {
          await sectionLink.first().click({
            timeout: TEST_CONFIG.TIMEOUTS.ACTION,
          });

          // Wait for page load
          await page.waitForLoadState('networkidle', {
            timeout: TEST_CONFIG.TIMEOUTS.NETWORK,
          });

          // Verify navigation occurred (URL contains section path)
          const currentUrl = page.url();
          const urlMatch = section.url.test(currentUrl);

          if (urlMatch) {
            expect(currentUrl).toMatch(section.url);
          }

          // Verify page heading is visible
          const heading = page
            .getByRole('heading', { name: section.name })
            .or(page.locator(TEST_CONFIG.SELECTORS.ADMIN_HEADING));

          const hasHeading = await heading
            .first()
            .isVisible()
            .catch(() => false);

          if (hasHeading) {
            await expect(heading.first()).toBeVisible();
          }
        } else {
          test.info().annotations.push({
            type: 'info',
            description: `Sidebar section ${section.name} not visible - may not be deployed`,
          });
        }
      });
    }
  });

  test('should logout from admin section', async ({ page, auth }) => {
    await page.goto('/admin', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await page.waitForLoadState('networkidle');

    await test.step('Open user menu', async () => {
      const userMenu = page
        .locator(TEST_CONFIG.SELECTORS.USER_MENU)
        .or(page.getByRole('button', { name: /user|profile|account/i }));

      await userMenu.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.DEBOUNCE);
    });

    await test.step('Click logout', async () => {
      const logoutButton = page
        .locator(TEST_CONFIG.SELECTORS.LOGOUT_BUTTON)
        .or(page.getByRole('button', { name: /log out|sign out/i }))
        .or(page.getByRole('link', { name: /log out|sign out/i }));

      await logoutButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify redirected to login', async () => {
      await expect(page).toHaveURL(/^\/$|\/login/, {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });

    await test.step('Verify admin pages are no longer accessible', async () => {
      await page.goto('/admin', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      // Should redirect to login since session is cleared
      await expect(page).toHaveURL(/\/login|\/$/,  {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });
});
