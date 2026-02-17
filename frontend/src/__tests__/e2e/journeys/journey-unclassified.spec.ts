/**
 * UNCLASSIFIED User Journey E2E Tests (AAL1 - No MFA)
 *
 * Tests the complete end-to-end workflow for an UNCLASSIFIED user:
 * - Login without MFA (AAL1)
 * - Dashboard verification
 * - Resource browsing and search
 * - Classification markings
 * - Identity drawer
 * - Access restrictions for higher-classification content
 * - Logout and session cleanup
 *
 * User: testuser-usa-1 (UNCLASSIFIED, no COI, no MFA)
 */

import { test, expect, skipIfNotAvailable } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { TEST_USERS } from '../fixtures/test-users';
import { TEST_RESOURCES } from '../fixtures/test-resources';
import { DashboardPage } from '../pages/DashboardPage';
import { ResourcesPage } from '../pages/ResourcesPage';
import { LoginPage } from '../pages/LoginPage';

test.describe('Journey: UNCLASSIFIED User (AAL1, No MFA)', () => {
  // Use pre-saved AAL1 storageState if available from global setup
  test.use({
    storageState: hasAuthState('AAL1') ? AUTH_STATE.AAL1 : undefined,
  });

  test.beforeEach(async ({ page, auth, users, idps }) => {
    skipIfNotAvailable(idps, 'USA');

    // If no pre-saved state, perform login
    if (!hasAuthState('AAL1')) {
      await auth.loginAs(users.USA.LEVEL_1);
    }
  });

  test('should login as USA LEVEL_1 without MFA', async ({ page, auth, users }) => {
    await test.step('Navigate to dashboard and verify login', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      await dashboard.verifyLoggedIn();
    });
  });

  test('should display correct user info on dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Verify user clearance and country', async () => {
      await dashboard.verifyUserInfo(
        TEST_USERS.USA.LEVEL_1.username,
        'UNCLASSIFIED',
        'USA'
      );
    });

    await test.step('Verify user menu is accessible', async () => {
      await expect(dashboard.userMenu).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should navigate from dashboard to resources page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Click resources link', async () => {
      await dashboard.goToResources();
    });

    await test.step('Verify resources page loaded', async () => {
      const resources = new ResourcesPage(page);
      await expect(resources.heading).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
      await expect(page).toHaveURL(/\/resources/);
    });
  });

  test('should search for resources on resources page', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.goto();

    await test.step('Enter search query', async () => {
      await resources.searchFor('unclassified');
    });

    await test.step('Verify search input contains query', async () => {
      await expect(resources.searchInput).toHaveValue('unclassified');
    });

    await test.step('Verify page did not navigate away', async () => {
      await expect(page).toHaveURL(/\/resources/);
    });
  });

  test('should view resource details', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Navigate to unclassified resource detail', async () => {
      await resources.gotoResourceDetail(
        TEST_RESOURCES.UNCLASSIFIED.BASIC.resourceId
      );
    });

    await test.step('Verify resource detail page loaded', async () => {
      await expect(page).toHaveURL(
        new RegExp(`/resources/${TEST_RESOURCES.UNCLASSIFIED.BASIC.resourceId}`)
      );
      // Verify content or description is visible
      const content = page.getByText(/content|description|classification/i);
      await expect(content).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should display classification markings on resource', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.gotoResourceDetail(
      TEST_RESOURCES.UNCLASSIFIED.BASIC.resourceId
    );

    await test.step('Verify UNCLASSIFIED marking is shown', async () => {
      const classificationBanner = page.getByText(/UNCLASSIFIED/i);
      await expect(classificationBanner).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify releasability info is shown', async () => {
      // The unclassified doc is releasable to USA, GBR, CAN, FRA, DEU
      const releasability = page.getByText(/releasab|REL TO/i);
      await expect(releasability).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should navigate back to resources list from detail', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.gotoResourceDetail(
      TEST_RESOURCES.UNCLASSIFIED.BASIC.resourceId
    );

    await test.step('Navigate back to resources list', async () => {
      // Use browser back or breadcrumb link
      const backLink = page
        .getByRole('link', { name: /back|resources/i })
        .or(page.locator('[data-testid="back-to-resources"]'))
        .or(page.getByRole('navigation').getByText(/resources/i));

      const hasBackLink = await backLink.first().isVisible().catch(() => false);
      if (hasBackLink) {
        await backLink.first().click();
      } else {
        await page.goBack();
      }
    });

    await test.step('Verify resources list is shown', async () => {
      await expect(page).toHaveURL(/\/resources/);
      await expect(
        page.getByRole('heading', { name: /resources|documents/i })
      ).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });

  test('should logout successfully', async ({ page, auth }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Perform logout via dashboard', async () => {
      await dashboard.logout();
    });

    await test.step('Verify redirected to login or home', async () => {
      await expect(page).toHaveURL(/^\/$|\/login/, {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });

  test('should clear session data after logout', async ({ page, auth, users }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.logout();

    await test.step('Verify session cookies are cleared', async () => {
      const cookies = await page.context().cookies();
      const sessionCookie = cookies.find(
        (c) =>
          c.name.includes('session') ||
          c.name.includes('token') ||
          c.name.includes('auth')
      );
      // Session cookie should be absent or expired
      if (sessionCookie) {
        expect(sessionCookie.expires).toBeLessThanOrEqual(Date.now() / 1000);
      }
    });

    await test.step('Verify protected page redirects to login', async () => {
      await page.goto('/dashboard', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      // Should redirect to login since session is cleared
      await expect(page).toHaveURL(/\/login|\/$/,  {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });

  test('should NOT access SECRET-level content', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Attempt to view SECRET resource', async () => {
      await resources.gotoResourceDetail(
        TEST_RESOURCES.SECRET.USA_ONLY.resourceId
      );
    });

    await test.step('Verify access denied or filtered', async () => {
      const deniedMessage = page.getByText(
        /access denied|forbidden|not authorized|insufficient clearance/i
      );
      const filteredOut = page.getByText(/no.*found|not available/i);

      // Either explicitly denied or resource not shown
      const isDenied = await deniedMessage.isVisible().catch(() => false);
      const isFiltered = await filteredOut.isVisible().catch(() => false);

      expect(isDenied || isFiltered).toBe(true);
    });
  });

  test('should NOT access TOP_SECRET-level content', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Attempt to view TOP_SECRET resource', async () => {
      await resources.gotoResourceDetail(
        TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED.resourceId
      );
    });

    await test.step('Verify access denied or filtered', async () => {
      const deniedMessage = page.getByText(
        /access denied|forbidden|not authorized|insufficient clearance/i
      );
      const filteredOut = page.getByText(/no.*found|not available/i);

      const isDenied = await deniedMessage.isVisible().catch(() => false);
      const isFiltered = await filteredOut.isVisible().catch(() => false);

      expect(isDenied || isFiltered).toBe(true);
    });
  });

  test('should open identity drawer and verify UNCLASSIFIED clearance', async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Open identity drawer with Cmd+I', async () => {
      await dashboard.openIdentityDrawer();
    });

    await test.step('Verify clearance shows UNCLASSIFIED', async () => {
      const clearanceText = dashboard.identityDrawer.getByText(/UNCLASSIFIED/i);
      await expect(clearanceText).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify country shows USA', async () => {
      const countryText = dashboard.identityDrawer.getByText(
        /USA|United States/i
      );
      await expect(countryText).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify no COI badges (UNCLASSIFIED has none)', async () => {
      const coiBadge = dashboard.identityDrawer.getByText(
        /FVEY|NATO|NATO-COSMIC/i
      );
      await expect(coiBadge).not.toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.SHORT,
      });
    });

    await test.step('Close identity drawer', async () => {
      await dashboard.closeIdentityDrawer();
    });
  });

  test('should navigate to help page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Find and click help link', async () => {
      const helpLink = page
        .getByRole('link', { name: /help|support|documentation/i })
        .or(page.locator('[data-testid="help-link"]'))
        .or(page.getByRole('button', { name: /help|\?/i }));

      await helpLink.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    await test.step('Verify help page or panel is visible', async () => {
      const helpContent = page
        .getByRole('heading', { name: /help|support|documentation/i })
        .or(page.getByRole('dialog', { name: /help/i }))
        .or(page.locator('[data-testid="help-content"]'));

      await expect(helpContent.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should display notification bell on dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Verify notification bell is visible', async () => {
      const notificationBell = page
        .getByRole('button', { name: /notifications?/i })
        .or(page.locator('[data-testid="notification-bell"]'))
        .or(page.locator('[aria-label="Notifications"]'));

      await expect(notificationBell.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should access UNCLASSIFIED resource without restriction', async ({
    page,
  }) => {
    const resources = new ResourcesPage(page);

    await test.step('Navigate to unclassified resource', async () => {
      await resources.verifyResourceAccessible(
        TEST_RESOURCES.UNCLASSIFIED.BASIC.resourceId
      );
    });

    await test.step('Verify resource content is visible', async () => {
      const resourceTitle = page.getByText(
        new RegExp(TEST_RESOURCES.UNCLASSIFIED.BASIC.title, 'i')
      );
      await expect(resourceTitle).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should complete full browse-search-view-return cycle', async ({
    page,
  }) => {
    const startTime = Date.now();
    const dashboard = new DashboardPage(page);
    const resources = new ResourcesPage(page);

    await test.step('Start on dashboard', async () => {
      await dashboard.goto();
      await dashboard.verifyLoggedIn();
    });

    await test.step('Navigate to resources', async () => {
      await dashboard.goToResources();
      await resources.verifyResourcesDisplayed();
    });

    await test.step('Search for resources', async () => {
      await resources.searchFor('test');
    });

    await test.step('View first resource', async () => {
      await resources.clickResource(0);
      await expect(page).toHaveURL(/\/resources\/.+/);
    });

    await test.step('Return to resources list', async () => {
      await page.goBack();
      await expect(page).toHaveURL(/\/resources/);
    });

    await test.step('Return to dashboard', async () => {
      await dashboard.goto();
      await dashboard.verifyLoggedIn();
    });

    const duration = Date.now() - startTime;
    // Full browse cycle should complete within reasonable time
    expect(duration).toBeLessThan(30000);
  });
});
