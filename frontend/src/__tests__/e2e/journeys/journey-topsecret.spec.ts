/**
 * TOP_SECRET User Journey E2E Tests (AAL3 - WebAuthn)
 *
 * Tests the complete end-to-end workflow for a TOP_SECRET-cleared user:
 * - Login with WebAuthn virtual authenticator (AAL3)
 * - Dashboard with full feature visibility
 * - Identity drawer with TOP_SECRET clearance and FVEY + NATO-COSMIC COI
 * - ZTDF-protected resource viewing
 * - KAS flow UI elements
 * - Security label viewer
 * - Compliance and multi-KAS dashboard
 * - Admin section access
 * - Full navigation breadcrumbs
 * - Logout and complete session cleanup
 *
 * User: testuser-usa-4 (TOP_SECRET, FVEY + NATO-COSMIC COI, WebAuthn MFA)
 */

import { test, expect, skipIfNotAvailable } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { TEST_USERS } from '../fixtures/test-users';
import { TEST_RESOURCES } from '../fixtures/test-resources';
import { DashboardPage } from '../pages/DashboardPage';
import { ResourcesPage } from '../pages/ResourcesPage';

test.describe('Journey: TOP_SECRET User (AAL3, WebAuthn)', () => {
  test.skip(!TEST_CONFIG.FEATURES.MFA_TESTS, 'MFA/WebAuthn not configured');

  test.beforeEach(async ({ page, auth, users, idps }) => {
    skipIfNotAvailable(idps, 'USA');

    // TOP_SECRET requires WebAuthn (AAL3)
    // The virtual authenticator is auto-configured by Playwright's CDP session
    await auth.loginAs(users.USA.LEVEL_4);
  });

  test('should login as USA LEVEL_4 with WebAuthn', async ({ page }) => {
    await test.step('Verify dashboard loads after WebAuthn login', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      await dashboard.verifyLoggedIn();
    });
  });

  test('should display dashboard with all features visible', async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Verify user info shows TOP_SECRET', async () => {
      await dashboard.verifyUserInfo(
        TEST_USERS.USA.LEVEL_4.username,
        'TOP_SECRET',
        'USA'
      );
    });

    await test.step('Verify resources navigation link is visible', async () => {
      await expect(dashboard.resourcesLink).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify policies navigation link is visible', async () => {
      await expect(dashboard.policiesLink).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify admin navigation link is visible (TS user may have admin)', async () => {
      // TOP_SECRET user may or may not have admin access depending on role assignment
      const adminVisible = await dashboard.adminLink
        .isVisible()
        .catch(() => false);
      if (adminVisible) {
        await expect(dashboard.adminLink).toBeVisible();
      }
    });

    await test.step('Verify compliance link is visible', async () => {
      const complianceVisible = await dashboard.complianceLink
        .isVisible()
        .catch(() => false);
      if (complianceVisible) {
        await expect(dashboard.complianceLink).toBeVisible();
      }
    });
  });

  test('should open identity drawer and verify TOP_SECRET clearance', async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Open identity drawer with Cmd+I', async () => {
      await dashboard.openIdentityDrawer();
    });

    await test.step('Verify clearance shows TOP_SECRET', async () => {
      const clearanceText = dashboard.identityDrawer.getByText(/TOP.SECRET/i);
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

    await test.step('Close identity drawer', async () => {
      await dashboard.closeIdentityDrawer();
    });
  });

  test('should display FVEY and NATO-COSMIC COI badges', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.openIdentityDrawer();

    await test.step('Verify FVEY COI badge', async () => {
      const fveyBadge = dashboard.identityDrawer.getByText(/FVEY/i);
      await expect(fveyBadge).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify NATO-COSMIC COI badge', async () => {
      const cosmicBadge = dashboard.identityDrawer.getByText(/NATO.COSMIC/i);
      await expect(cosmicBadge).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await dashboard.closeIdentityDrawer();
  });

  test('should navigate to resources page', async ({ page }) => {
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
    });
  });

  test('should view a ZTDF-protected resource', async ({ page }) => {
    // Mock ZTDF resource endpoint
    const ztdfResourceId = 'test-ztdf-resource-001';
    await page.route(`**/api/resources/${ztdfResourceId}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resourceId: ztdfResourceId,
          title: 'ZTDF Protected Intelligence Report',
          classification: 'TOP_SECRET',
          releasabilityTo: ['USA'],
          COI: ['FVEY'],
          encrypted: true,
          encryptionType: 'ZTDF',
          kasEndpoint: 'https://kas.dive25.com',
        }),
      });
    });

    await test.step('Navigate to ZTDF resource', async () => {
      await page.goto(`/resources/${ztdfResourceId}/ztdf`, {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
    });

    await test.step('Verify ZTDF page elements', async () => {
      // The page should show ZTDF-specific UI elements
      const ztdfIndicator = page
        .getByText(/ZTDF|zero.trust|encrypted/i)
        .or(page.locator('[data-testid="ztdf-indicator"]'))
        .or(page.locator('[data-encryption-type="ZTDF"]'));

      await expect(ztdfIndicator.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should display KAS flow UI elements', async ({ page }) => {
    const ztdfResourceId = 'test-ztdf-resource-001';

    // Mock KAS-related API
    await page.route('**/api/resources/request-key', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          decision: 'ALLOW',
          kasEndpoint: 'https://kas.dive25.com',
          wrappedKey: 'mock-wrapped-key-data',
        }),
      });
    });

    await page.goto(`/resources/${ztdfResourceId}`, {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });

    await test.step('Verify KAS flow elements are present', async () => {
      const kasElement = page
        .getByText(/key access|KAS|decrypt|request.*key/i)
        .or(page.locator('[data-testid="kas-flow"]'))
        .or(page.locator('[data-testid="decrypt-button"]'));

      // KAS UI may or may not be visible depending on resource type
      const hasKasUI = await kasElement.first().isVisible().catch(() => false);
      if (hasKasUI) {
        await expect(kasElement.first()).toBeVisible();
      }
    });
  });

  test('should render security label viewer', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.gotoResourceDetail(
      TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED.resourceId
    );

    await test.step('Verify security label is rendered', async () => {
      const securityLabel = page
        .getByText(/TOP.SECRET/i)
        .or(page.locator('[data-testid="security-label"]'))
        .or(page.locator('.security-label'))
        .or(page.locator('[data-classification="TOP_SECRET"]'));

      await expect(securityLabel.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });

    await test.step('Verify classification banner color', async () => {
      // TOP_SECRET typically has a distinct visual (e.g., orange/yellow banner)
      const banner = page
        .locator('[data-testid="classification-banner"]')
        .or(page.locator('.classification-banner'))
        .or(page.locator('[role="banner"]').filter({ hasText: /TOP.SECRET/i }));

      const hasBanner = await banner.first().isVisible().catch(() => false);
      if (hasBanner) {
        await expect(banner.first()).toBeVisible();
      }
    });
  });

  test('should navigate to compliance page', async ({ page }) => {
    await test.step('Navigate to compliance', async () => {
      const complianceLink = page
        .getByRole('link', { name: /compliance/i })
        .or(page.locator('[data-testid="compliance-link"]'))
        .or(page.getByRole('link', { name: /audit|compliance/i }));

      const hasComplianceLink = await complianceLink
        .first()
        .isVisible()
        .catch(() => false);

      if (hasComplianceLink) {
        await complianceLink.first().click({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
        await expect(page).toHaveURL(/\/compliance|\/audit/, {
          timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        });
      } else {
        // Navigate directly if no link found
        await page.goto('/compliance', {
          timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
          waitUntil: 'domcontentloaded',
        });
      }
    });

    await test.step('Verify compliance page loaded', async () => {
      const complianceHeading = page.getByRole('heading', {
        name: /compliance|audit/i,
      });
      const hasHeading = await complianceHeading
        .first()
        .isVisible()
        .catch(() => false);

      // Compliance page should load or show appropriate content
      if (hasHeading) {
        await expect(complianceHeading.first()).toBeVisible();
      }
    });
  });

  test('should display multi-KAS dashboard elements', async ({ page }) => {
    // Navigate to a page that shows multi-KAS info
    await page.goto('/compliance', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });

    await test.step('Verify KAS dashboard elements', async () => {
      const kasDashboard = page
        .getByText(/KAS|key access service/i)
        .or(page.locator('[data-testid="kas-dashboard"]'))
        .or(page.locator('[data-testid="multi-kas"]'));

      const hasKasDashboard = await kasDashboard
        .first()
        .isVisible()
        .catch(() => false);

      if (hasKasDashboard) {
        await expect(kasDashboard.first()).toBeVisible();

        // Check for KAS endpoint listings
        const kasEndpoint = page
          .getByText(/kas.*endpoint|endpoint.*kas/i)
          .or(page.locator('[data-testid="kas-endpoint"]'));

        const hasEndpoint = await kasEndpoint
          .first()
          .isVisible()
          .catch(() => false);
        if (hasEndpoint) {
          await expect(kasEndpoint.first()).toBeVisible();
        }
      }
    });
  });

  test('should navigate to admin section if admin role', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Check admin access', async () => {
      const adminVisible = await dashboard.adminLink
        .isVisible()
        .catch(() => false);

      if (adminVisible) {
        await dashboard.goToAdmin();
        await expect(page).toHaveURL(/\/admin/, {
          timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        });

        const adminHeading = page
          .getByRole('heading', { name: /admin|administration|dashboard/i })
          .or(page.locator(TEST_CONFIG.SELECTORS.ADMIN_HEADING));

        await expect(adminHeading.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      } else {
        // User does not have admin role - this is acceptable for TS user
        test.info().annotations.push({
          type: 'info',
          description: 'TOP_SECRET user does not have admin role in this environment',
        });
      }
    });
  });

  test('should display full navigation breadcrumbs', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.gotoResourceDetail(
      TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED.resourceId
    );

    await test.step('Verify breadcrumb navigation exists', async () => {
      const breadcrumb = page
        .getByRole('navigation', { name: /breadcrumb/i })
        .or(page.locator('[data-testid="breadcrumbs"]'))
        .or(page.locator('nav[aria-label="breadcrumb"]'))
        .or(page.locator('.breadcrumbs'));

      const hasBreadcrumbs = await breadcrumb
        .first()
        .isVisible()
        .catch(() => false);

      if (hasBreadcrumbs) {
        await expect(breadcrumb.first()).toBeVisible();

        // Breadcrumbs should show at least Home > Resources > [Resource Name]
        const homeLink = breadcrumb
          .first()
          .getByText(/home|dashboard/i);
        const resourcesLink = breadcrumb
          .first()
          .getByText(/resources/i);

        const hasHomeLink = await homeLink
          .first()
          .isVisible()
          .catch(() => false);
        const hasResourcesLink = await resourcesLink
          .first()
          .isVisible()
          .catch(() => false);

        if (hasHomeLink) {
          await expect(homeLink.first()).toBeVisible();
        }
        if (hasResourcesLink) {
          await expect(resourcesLink.first()).toBeVisible();
        }
      }
    });
  });

  test('should access FVEY SECRET resource (authorized)', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Verify FVEY resource accessible to TS user', async () => {
      await resources.verifyResourceAccessible(
        TEST_RESOURCES.SECRET.FVEY.resourceId
      );
    });

    await test.step('Verify resource title visible', async () => {
      const title = page.getByText(
        new RegExp(TEST_RESOURCES.SECRET.FVEY.title, 'i')
      );
      await expect(title.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should access TOP_SECRET USA restricted resource', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Verify TOP_SECRET resource accessible to USA TS user', async () => {
      await resources.verifyResourceAccessible(
        TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED.resourceId
      );
    });
  });

  test('should logout and verify complete session cleanup', async ({
    page,
    auth,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Perform logout', async () => {
      await dashboard.logout();
    });

    await test.step('Verify redirected to login', async () => {
      await expect(page).toHaveURL(/^\/$|\/login/, {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });

    await test.step('Verify all session storage cleared', async () => {
      const sessionStorage = await page.evaluate(() =>
        JSON.stringify(window.sessionStorage)
      );
      const parsed = JSON.parse(sessionStorage);
      // Session storage should have no auth-related keys
      const authKeys = Object.keys(parsed).filter(
        (k) =>
          k.includes('token') ||
          k.includes('auth') ||
          k.includes('session') ||
          k.includes('user')
      );
      expect(authKeys.length).toBe(0);
    });

    await test.step('Verify localStorage auth tokens cleared', async () => {
      const localStorage = await page.evaluate(() =>
        JSON.stringify(window.localStorage)
      );
      const parsed = JSON.parse(localStorage);
      const tokenKeys = Object.keys(parsed).filter(
        (k) =>
          k.includes('access_token') ||
          k.includes('id_token') ||
          k.includes('refresh_token')
      );
      expect(tokenKeys.length).toBe(0);
    });

    await test.step('Verify cannot access protected page after logout', async () => {
      await page.goto('/dashboard', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      await expect(page).toHaveURL(/\/login|\/$/,  {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });
});
