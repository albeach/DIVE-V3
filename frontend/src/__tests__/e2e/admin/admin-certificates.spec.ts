/**
 * Admin Certificates E2E Tests
 *
 * Tests the certificate management admin interface:
 * - Certificate table rendering
 * - Health status indicator
 * - Certificate count validation
 * - Certificate detail modal
 * - Rotate certificate flow
 * - Revoke certificate flow
 * - CRL download
 * - Refresh button
 * - Expiry warnings
 * - Error state handling
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminCertificatesPage } from '../pages/AdminCertificatesPage';

test.describe('Admin Certificates', () => {
  // Use saved admin session if available (from auth-setup.ts)
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
    const certsPage = new AdminCertificatesPage(page);
    await certsPage.goto();
  });

  // ---------------------------------------------------------------------------
  // Page Rendering
  // ---------------------------------------------------------------------------

  test('should render the page heading', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await certsPage.verifyLoaded();
  });

  test('should render the certificate table', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.certificateTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display certificate rows', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    const count = await certsPage.getCertificateCount();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  // ---------------------------------------------------------------------------
  // Health Status
  // ---------------------------------------------------------------------------

  test('should display health status indicator', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.healthStatus.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should show a valid health status value', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    const statusText = await certsPage.healthStatus.first().textContent();
    expect(statusText).toBeTruthy();
    // Status should contain a recognizable state
    expect(statusText!.toLowerCase()).toMatch(/healthy|degraded|warning|error|ok|good|critical/);
  });

  // ---------------------------------------------------------------------------
  // Certificate Count
  // ---------------------------------------------------------------------------

  test('should have certificate count greater than zero', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    const count = await certsPage.getCertificateCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should have certificate count within expected range', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    const count = await certsPage.getCertificateCount();
    // Expect between 1 and 100 certificates
    expect(count).toBeGreaterThanOrEqual(1);
    expect(count).toBeLessThanOrEqual(100);
  });

  // ---------------------------------------------------------------------------
  // Certificate Detail Modal
  // ---------------------------------------------------------------------------

  test('should open certificate detail modal on row click', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);

    await test.step('Click the first certificate row', async () => {
      await certsPage.selectCertificate(0);
    });

    await test.step('Verify detail modal is visible', async () => {
      await expect(certsPage.detailModal).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should display certificate information in detail modal', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await certsPage.selectCertificate(0);

    await test.step('Verify modal has content', async () => {
      const modalText = await certsPage.detailModal.textContent();
      expect(modalText).toBeTruthy();
      expect(modalText!.length).toBeGreaterThan(0);
    });
  });

  test('should close certificate detail modal', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await certsPage.selectCertificate(0);

    await test.step('Close the modal', async () => {
      const closeButton = page
        .getByRole('button', { name: /close/i })
        .or(page.locator('[data-testid="modal-close"]'))
        .or(page.locator('button[aria-label="Close"]'));
      await closeButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    await test.step('Verify modal is hidden', async () => {
      await expect(certsPage.detailModal).not.toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Rotate Certificate
  // ---------------------------------------------------------------------------

  test('should show rotate button for a certificate', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.rotateButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should initiate rotate certificate flow with confirmation dialog', async ({ page }) => {
    await test.step('Intercept rotate API call', async () => {
      await page.route('**/api/admin/certificates/*/rotate', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Certificate rotated' }),
        });
      });
    });

    await test.step('Click rotate on first certificate', async () => {
      const certsPage = new AdminCertificatesPage(page);
      await certsPage.rotateButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify confirmation dialog appears', async () => {
      const confirmDialog = page
        .getByRole('dialog')
        .or(page.getByRole('alertdialog'))
        .or(page.locator('[data-testid="confirm-rotate"]'));
      await expect(confirmDialog.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Confirm rotation', async () => {
      const confirmButton = page
        .getByRole('button', { name: /confirm/i })
        .or(page.getByRole('button', { name: /yes/i }))
        .or(page.locator('[data-testid="confirm-rotate"]'));
      await confirmButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify success notification', async () => {
      const toast = page.locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST)
        .or(page.getByText(/rotated|success/i));
      await expect(toast.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Revoke Certificate
  // ---------------------------------------------------------------------------

  test('should show revoke button for a certificate', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.revokeButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should initiate revoke certificate flow with confirmation dialog', async ({ page }) => {
    await test.step('Intercept revoke API call', async () => {
      await page.route('**/api/admin/certificates/*/revoke', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'Certificate revoked' }),
        });
      });
    });

    await test.step('Click revoke on first certificate', async () => {
      const certsPage = new AdminCertificatesPage(page);
      await certsPage.revokeButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify confirmation dialog appears', async () => {
      const confirmDialog = page
        .getByRole('dialog')
        .or(page.getByRole('alertdialog'))
        .or(page.locator('[data-testid="confirm-revoke"]'));
      await expect(confirmDialog.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Confirm revocation', async () => {
      const confirmButton = page
        .getByRole('button', { name: /confirm/i })
        .or(page.getByRole('button', { name: /yes/i }))
        .or(page.locator('[data-testid="confirm-revoke"]'));
      await confirmButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify success notification', async () => {
      const toast = page.locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST)
        .or(page.getByText(/revoked|success/i));
      await expect(toast.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // CRL Download
  // ---------------------------------------------------------------------------

  test('should display CRL download link', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.crlDownloadLink.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should initiate CRL download', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);

    await test.step('Click CRL download and verify download event', async () => {
      const download = await certsPage.downloadCRL();
      expect(download).toBeTruthy();
      const suggestedFilename = download.suggestedFilename();
      expect(suggestedFilename).toBeTruthy();
      // CRL files typically end with .crl or .pem
      expect(suggestedFilename).toMatch(/\.(crl|pem|der)$/i);
    });
  });

  // ---------------------------------------------------------------------------
  // Refresh Button
  // ---------------------------------------------------------------------------

  test('should display refresh button', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);
    await expect(certsPage.refreshButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should reload data when refresh is clicked', async ({ page }) => {
    const certsPage = new AdminCertificatesPage(page);

    let apiCallCount = 0;
    await page.route('**/api/admin/certificates**', async (route) => {
      apiCallCount++;
      await route.continue();
    });

    await test.step('Click refresh button', async () => {
      await certsPage.refreshButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify API was called', async () => {
      expect(apiCallCount).toBeGreaterThanOrEqual(1);
    });

    await test.step('Verify table is still visible after refresh', async () => {
      await expect(certsPage.certificateTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Expiry Warning
  // ---------------------------------------------------------------------------

  test('should show expiry warnings when certificates are near expiry', async ({ page }) => {
    await test.step('Intercept certificates API with near-expiry cert', async () => {
      await page.route('**/api/admin/certificates', async (route) => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify([
              {
                alias: 'test-cert-expiring',
                subject: 'CN=test.dive25.com',
                issuer: 'CN=DIVE CA',
                notBefore: new Date(Date.now() - 86400000 * 300).toISOString(),
                notAfter: new Date(Date.now() + 86400000 * 7).toISOString(), // 7 days from now
                status: 'warning',
                serialNumber: '123456',
              },
              {
                alias: 'test-cert-valid',
                subject: 'CN=valid.dive25.com',
                issuer: 'CN=DIVE CA',
                notBefore: new Date(Date.now() - 86400000 * 30).toISOString(),
                notAfter: new Date(Date.now() + 86400000 * 365).toISOString(),
                status: 'healthy',
                serialNumber: '789012',
              },
            ]),
          });
        } else {
          await route.continue();
        }
      });
    });

    await test.step('Reload the page with mocked data', async () => {
      const certsPage = new AdminCertificatesPage(page);
      await certsPage.goto();
    });

    await test.step('Verify expiry warning is visible', async () => {
      const certsPage = new AdminCertificatesPage(page);
      await expect(certsPage.expiryWarning.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  test('should show error state when API fails', async ({ page }) => {
    await test.step('Intercept certificates API with error response', async () => {
      await page.route('**/api/admin/certificates**', async (route) => {
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      });
    });

    await test.step('Reload the page', async () => {
      await page.goto('/admin/certificates', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify error state is displayed', async () => {
      const errorIndicator = page
        .locator(TEST_CONFIG.SELECTORS.ADMIN_ERROR)
        .or(page.getByText(/error|failed|unable to load/i))
        .or(page.getByRole('alert'));
      await expect(errorIndicator.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should show error state for health API failure', async ({ page }) => {
    await test.step('Intercept health API with error', async () => {
      await page.route('**/api/admin/certificates/health**', async (route) => {
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Service Unavailable' }),
        });
      });
    });

    await test.step('Reload the page', async () => {
      await page.goto('/admin/certificates', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify health status shows error or degraded', async () => {
      const certsPage = new AdminCertificatesPage(page);
      const healthText = await certsPage.healthStatus.first().textContent();
      // Should show an error, degraded, or unknown state
      if (healthText) {
        expect(healthText.toLowerCase()).toMatch(/error|degraded|unknown|unavailable|critical/);
      }
    });
  });
});
