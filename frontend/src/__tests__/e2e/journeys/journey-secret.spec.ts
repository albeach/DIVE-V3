/**
 * SECRET User Journey E2E Tests (AAL2 - OTP Required)
 *
 * Tests the complete end-to-end workflow for a SECRET-cleared user:
 * - Login with OTP (AAL2)
 * - Dashboard verification
 * - File upload with classification tagging
 * - Resource verification post-upload
 * - Releasability markings
 * - Identity drawer with SECRET clearance and NATO COI
 * - Policies page navigation
 * - Logout and session cleanup
 *
 * User: testuser-usa-3 (SECRET, NATO COI, OTP MFA)
 */

import { test, expect, skipIfNotAvailable } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { TEST_USERS } from '../fixtures/test-users';
import { TEST_RESOURCES } from '../fixtures/test-resources';
import { DashboardPage } from '../pages/DashboardPage';
import { ResourcesPage } from '../pages/ResourcesPage';

test.describe('Journey: SECRET User (AAL2, OTP)', () => {
  test.beforeEach(async ({ page, auth, users, idps }) => {
    skipIfNotAvailable(idps, 'USA');

    // SECRET requires OTP (AAL2) - speakeasy handles real TOTP,
    // falls back to '123456' in demo mode
    await auth.loginAs(users.USA.LEVEL_3, { otpCode: '123456' });
  });

  test('should login as USA LEVEL_3 with OTP', async ({ page }) => {
    await test.step('Verify dashboard loads after OTP login', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.goto();
      await dashboard.verifyLoggedIn();
    });
  });

  test('should display correct user info on dashboard', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Verify SECRET clearance displayed', async () => {
      await dashboard.verifyUserInfo(
        TEST_USERS.USA.LEVEL_3.username,
        'SECRET',
        'USA'
      );
    });
  });

  test('should navigate to upload page', async ({ page }) => {
    await test.step('Navigate to resource upload', async () => {
      const uploadLink = page
        .getByRole('link', { name: /upload|add.*document|create.*resource/i })
        .or(page.locator('[data-testid="upload-link"]'));

      const uploadButton = page
        .getByRole('button', { name: /upload|add.*document/i })
        .or(page.locator('[data-testid="upload-button"]'));

      const target = uploadLink.or(uploadButton);
      await target.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    await test.step('Verify upload page loaded', async () => {
      const uploadForm = page
        .getByRole('form')
        .or(page.locator('[data-testid="upload-form"]'))
        .or(page.locator('[data-testid="resource-form"]'));

      await expect(uploadForm.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should upload a file with mocked API', async ({ page }) => {
    // Mock the upload API to prevent actual file storage
    await page.route('**/api/resources', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            resourceId: 'test-upload-secret-001',
            title: 'Uploaded Secret Document',
            classification: 'SECRET',
            releasabilityTo: ['USA', 'GBR', 'CAN'],
            COI: ['NATO'],
            createdAt: new Date().toISOString(),
          }),
        });
      } else {
        await route.continue();
      }
    });

    await test.step('Navigate to upload page', async () => {
      await page.goto('/resources/new', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
        waitUntil: 'domcontentloaded',
      });
    });

    await test.step('Fill upload form', async () => {
      const titleInput = page
        .getByRole('textbox', { name: /title|name/i })
        .or(page.locator('[name="title"]'))
        .or(page.getByPlaceholder(/title|name/i));

      await titleInput.first().fill('Uploaded Secret Document');

      // Optionally set a file input
      const fileInput = page.locator('input[type="file"]');
      const hasFileInput = await fileInput.isVisible().catch(() => false);
      if (hasFileInput) {
        await fileInput.setInputFiles({
          name: 'test-document.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from('This is a secret test document for E2E testing.'),
        });
      }
    });

    await test.step('Submit upload form', async () => {
      const submitButton = page
        .getByRole('button', { name: /upload|submit|create/i })
        .or(page.locator('[type="submit"]'));

      await submitButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    await test.step('Verify upload success', async () => {
      // Either toast notification, success message, or redirect
      const successIndicator = page
        .getByText(/success|uploaded|created/i)
        .or(page.locator('[data-sonner-toast]'))
        .or(page.locator('[data-testid="upload-success"]'));

      await expect(successIndicator.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.NETWORK,
      });
    });
  });

  test('should set classification to SECRET on upload', async ({ page }) => {
    await page.goto('/resources/new', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });

    await test.step('Select SECRET classification', async () => {
      const classificationSelect = page
        .getByRole('combobox', { name: /classification/i })
        .or(page.getByLabel(/classification/i))
        .or(page.locator('[name="classification"]'));

      await classificationSelect.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });

      const secretOption = page
        .getByRole('option', { name: /SECRET/i })
        .or(page.getByText(/^SECRET$/i));

      await secretOption.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify SECRET is selected', async () => {
      const selected = page.getByText(/SECRET/i);
      await expect(selected.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should tag resource with NATO COI', async ({ page }) => {
    await page.goto('/resources/new', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      waitUntil: 'domcontentloaded',
    });

    await test.step('Select NATO COI tag', async () => {
      const coiInput = page
        .getByRole('combobox', { name: /coi|community/i })
        .or(page.getByLabel(/coi|community of interest/i))
        .or(page.locator('[name="coi"]'))
        .or(page.locator('[data-testid="coi-selector"]'));

      await coiInput.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

      const natoOption = page
        .getByRole('option', { name: /NATO/i })
        .or(page.getByText(/^NATO$/));

      await natoOption.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify NATO COI badge appears', async () => {
      const natoBadge = page.getByText(/NATO/i);
      await expect(natoBadge.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should verify uploaded resource appears in resources list', async ({
    page,
  }) => {
    // Mock resource list to include our "uploaded" document
    await page.route('**/api/resources*', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            resources: [
              {
                resourceId: 'test-upload-secret-001',
                title: 'Uploaded Secret Document',
                classification: 'SECRET',
                releasabilityTo: ['USA', 'GBR', 'CAN'],
                COI: ['NATO'],
              },
              ...Object.values(TEST_RESOURCES.SECRET).map((r) => ({
                resourceId: r.resourceId,
                title: r.title,
                classification: r.classification,
                releasabilityTo: r.releasabilityTo,
                COI: r.COI,
              })),
            ],
            total: Object.keys(TEST_RESOURCES.SECRET).length + 1,
          }),
        });
      } else {
        await route.continue();
      }
    });

    const resources = new ResourcesPage(page);
    await resources.goto();

    await test.step('Search for uploaded resource', async () => {
      await resources.searchFor('Uploaded Secret');
    });

    await test.step('Verify resource appears in results', async () => {
      const uploadedResource = page.getByText(/Uploaded Secret Document/i);
      await expect(uploadedResource.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should view uploaded resource detail', async ({ page }) => {
    // Mock the detail endpoint
    await page.route('**/api/resources/test-upload-secret-001', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          resourceId: 'test-upload-secret-001',
          title: 'Uploaded Secret Document',
          classification: 'SECRET',
          releasabilityTo: ['USA', 'GBR', 'CAN'],
          COI: ['NATO'],
          content: 'This is a secret test document for E2E testing.',
          createdAt: new Date().toISOString(),
        }),
      });
    });

    const resources = new ResourcesPage(page);

    await test.step('Navigate to resource detail', async () => {
      await resources.gotoResourceDetail('test-upload-secret-001');
    });

    await test.step('Verify detail page loads', async () => {
      await expect(page).toHaveURL(/\/resources\/test-upload-secret-001/);
      const title = page.getByText(/Uploaded Secret Document/i);
      await expect(title.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should display releasability markings on resource', async ({ page }) => {
    const resources = new ResourcesPage(page);
    await resources.gotoResourceDetail(TEST_RESOURCES.SECRET.NATO.resourceId);

    await test.step('Verify SECRET classification marking', async () => {
      const classificationMarking = page.getByText(/SECRET/i);
      await expect(classificationMarking.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify releasability markings', async () => {
      const releasability = page.getByText(/releasab|REL TO/i);
      await expect(releasability.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should open identity drawer and verify SECRET clearance', async ({
    page,
  }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Open identity drawer', async () => {
      await dashboard.openIdentityDrawer();
    });

    await test.step('Verify clearance shows SECRET', async () => {
      const clearanceText = dashboard.identityDrawer.getByText(/SECRET/i);
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
  });

  test('should display NATO COI badge in identity drawer', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.openIdentityDrawer();

    await test.step('Verify NATO COI badge is displayed', async () => {
      const natoBadge = dashboard.identityDrawer.getByText(/NATO/i);
      await expect(natoBadge).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify no FVEY badge (SECRET user has NATO only)', async () => {
      // testuser-usa-3 has ['NATO'] COI, not FVEY
      const fveyBadge = dashboard.identityDrawer.getByText(/^FVEY$/);
      await expect(fveyBadge).not.toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.SHORT,
      });
    });

    await dashboard.closeIdentityDrawer();
  });

  test('should navigate to policies page', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();

    await test.step('Click policies link', async () => {
      await dashboard.goToPolicies();
    });

    await test.step('Verify policies page loaded', async () => {
      await expect(page).toHaveURL(/\/policies/);
      const policiesHeading = page.getByRole('heading', {
        name: /policies/i,
      });
      await expect(policiesHeading).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should logout and verify session cleared', async ({ page, auth }) => {
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

    await test.step('Verify protected pages redirect after logout', async () => {
      await page.goto('/resources', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      // Should be redirected to login
      await expect(page).toHaveURL(/\/login|\/$/,  {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });

  test('should access NATO SECRET resource (authorized)', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Verify access to NATO SECRET document', async () => {
      await resources.verifyResourceAccessible(
        TEST_RESOURCES.SECRET.NATO.resourceId
      );
    });

    await test.step('Verify NATO resource title visible', async () => {
      const title = page.getByText(
        new RegExp(TEST_RESOURCES.SECRET.NATO.title, 'i')
      );
      await expect(title.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.RESOURCE_LOAD,
      });
    });
  });

  test('should be denied access to TOP_SECRET resource', async ({ page }) => {
    const resources = new ResourcesPage(page);

    await test.step('Attempt access to TOP_SECRET resource', async () => {
      await resources.verifyResourceDenied(
        TEST_RESOURCES.TOP_SECRET.USA_RESTRICTED.resourceId
      );
    });
  });
});
