/**
 * Hub Instance Basic Functionality Tests
 *
 * Validates core hub instance behavior:
 * - Instance accessibility and health
 * - Application branding and title
 * - IdP selector presence (login page)
 * - Health API endpoint
 * - Navigation structure
 *
 * These run against the hub project (baseURL from hub-chromium config).
 */

import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from '../../fixtures/test-config';

test.describe('DIVE Hub Instance - Basic Functionality', () => {
  test('instance is accessible and returns HTML', async ({ page }) => {
    const response = await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    expect(response).not.toBeNull();
    expect(response!.status()).toBeLessThan(500);

    // Page body should render
    await expect(page.locator('body')).toBeVisible();

    // Should have a title
    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('instance shows correct branding', async ({ page }) => {
    await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // Should contain DIVE V3 branding somewhere on the page
    const brandingIndicator = page.getByText(/dive/i)
      .or(page.locator('[alt*="DIVE"], [alt*="dive"]'))
      .or(page.locator('img[src*="logo"]'))
      .first();

    await expect(brandingIndicator).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  });

  test('instance shows IdP selector on login page', async ({ page }) => {
    await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // The login/landing page should show IdP selection buttons
    // At minimum, the hub (USA) IdP should be visible
    const idpButton = page.getByRole('button', { name: /United States|USA/i })
      .or(page.getByRole('link', { name: /United States|USA/i }))
      .first();

    await expect(idpButton).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  });

  test('instance health check endpoint responds', async ({ page }) => {
    // Check the health API
    const response = await page.request.get('/api/health');

    // Should return 200 or at least not 500
    expect(response.status()).toBeLessThan(500);

    if (response.status() === 200) {
      const body = await response.json();
      expect(body).toBeDefined();
    }
  });

  test('instance has proper meta tags', async ({ page }) => {
    await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // Should have viewport meta tag (responsive design)
    const viewport = page.locator('meta[name="viewport"]');
    expect(await viewport.count()).toBeGreaterThan(0);

    // Should have charset
    const charset = page.locator('meta[charset]');
    expect(await charset.count()).toBeGreaterThan(0);
  });

  test('instance serves static assets', async ({ page }) => {
    await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // Next.js should inject its script bundles
    const scripts = page.locator('script[src*="_next"]');
    expect(await scripts.count()).toBeGreaterThan(0);
  });

  test('instance handles 404 routes', async ({ page }) => {
    const response = await page.goto('/this-page-does-not-exist-12345', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });

    // Should return 404 status or show not-found page
    if (response) {
      expect(response.status()).toBe(404);
    }

    // Should show a user-friendly not-found page
    const notFoundIndicator = page.getByText(/not found|404|page doesn.t exist/i).first();
    await expect(notFoundIndicator).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  });

  test('instance HTTPS is properly configured', async ({ page }) => {
    const response = await page.goto('/', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    // URL should be HTTPS (in CI and local Docker)
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/^https:/);
  });
});
