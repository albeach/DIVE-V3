/**
 * Auto-generated basic tests for Denmark instance
 */

import { test, expect } from '@playwright/test';

test.describe('Denmark Instance - Basic Functionality', () => {
  test('instance is accessible', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('body')).toBeVisible();
  });

  test('instance shows correct branding', async ({ page }) => {
    await page.goto('/');
    // Add instance-specific branding checks here
  });

  test('instance health check', async ({ page }) => {
    const response = await page.request.get('/api/health');
    expect(response.status()).toBe(200);
  });
});
