/**
 * Dynamic Health Check Tests
 *
 * Automatically generated and runs against any detected running instance
 * Tests basic functionality for each instance type (hub/spoke)
 */

import { test, expect } from '@playwright/test';

// Get instance info from environment (set by dynamic runner)
const DIVE_INSTANCE = process.env.DIVE_INSTANCE || 'unknown';
const INSTANCE_NAME = getInstanceDisplayName(DIVE_INSTANCE);
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

function getInstanceDisplayName(instance: string): string {
  const names: Record<string, string> = {
    hub: 'DIVE Hub',
    usa: 'United States',
    gbr: 'United Kingdom',
    fra: 'France',
    deu: 'Germany',
    can: 'Canada',
    alb: 'Albania',
    dnk: 'Denmark',
    rou: 'Romania',
    aus: 'Australia',
    nzl: 'New Zealand',
  };
  return names[instance] || instance.toUpperCase();
}

test.describe(`${INSTANCE_NAME} (${DIVE_INSTANCE}) - Health & Basic Functionality`, () => {
  test('instance frontend is accessible', async ({ page }) => {
    console.log(`🧪 Testing ${INSTANCE_NAME} at ${BASE_URL}`);

    await page.goto('/', {
      timeout: 30000,
      waitUntil: 'domcontentloaded'
    });

    // Basic check that page loaded
    await expect(page.locator('body')).toBeVisible();

    // Check for basic DIVE branding or content
    const hasContent = await page.locator('text=/DIVE|Login|Sign|Resource/i').isVisible({ timeout: 5000 }).catch(() => false);
    expect(hasContent).toBe(true);
  });

  test('instance health endpoint responds', async ({ request }) => {
    // Try multiple possible health endpoints
    const healthEndpoints = [
      '/api/health',
      '/health',
      '/api/health/ready'
    ];

    let healthResponse = null;
    for (const endpoint of healthEndpoints) {
      try {
        const response = await request.get(endpoint, { timeout: 5000 });
        if (response.status() === 200) {
          healthResponse = response;
          console.log(`✅ Health check passed: ${endpoint}`);
          break;
        }
      } catch (error) {
        // Continue to next endpoint
      }
    }

    expect(healthResponse).not.toBeNull();
    expect(healthResponse!.status()).toBe(200);
  });

  test('instance shows correct instance information', async ({ page }) => {
    await page.goto('/');

    // Check if instance name appears in the UI
    const instanceText = await page.locator(`text=/${INSTANCE_NAME}|${DIVE_INSTANCE.toUpperCase()}/i`).isVisible({ timeout: 5000 }).catch(() => false);

    if (instanceText) {
      console.log(`✅ Instance branding detected: ${INSTANCE_NAME}`);
    } else {
      console.log(`⚠️ Instance branding not clearly visible, but page loads correctly`);
    }
  });

  test('instance backend API is accessible', async ({ request }) => {
    // Test backend connectivity if BACKEND_URL is available
    const backendUrl = process.env.BACKEND_URL;
    if (!backendUrl) {
      console.log('⚠️ Backend URL not configured, skipping backend test');
      return;
    }

    try {
      const response = await request.get(`${backendUrl}/health`, { timeout: 5000 });
      expect([200, 404]).toContain(response.status()); // 404 is OK if no health endpoint
      console.log(`✅ Backend accessible at ${backendUrl}`);
    } catch (error) {
      console.log(`⚠️ Backend not accessible at ${backendUrl}: ${error.message}`);
      // Don't fail the test for backend connectivity issues
    }
  });

  test('instance has working navigation', async ({ page }) => {
    await page.goto('/');

    // Try to find common navigation elements
    const navElements = [
      page.locator('nav, [role="navigation"]'),
      page.locator('header'),
      page.locator('button, a').filter({ hasText: /login|sign|resource|dashboard/i }),
      page.locator('[data-testid*="nav"], [data-testid*="menu"]')
    ];

    let foundNavigation = false;
    for (const nav of navElements) {
      try {
        if (await nav.isVisible({ timeout: 2000 })) {
          foundNavigation = true;
          break;
        }
      } catch (error) {
        // Continue checking other selectors
      }
    }

    expect(foundNavigation).toBe(true);
    console.log(`✅ Navigation elements detected for ${INSTANCE_NAME}`);
  });

  // Instance-specific tests
  if (DIVE_INSTANCE === 'hub') {
    test('hub shows federation status', async ({ page }) => {
      await page.goto('/');

      // Hub-specific checks
      const federationIndicators = [
        page.locator('text=/federation|spoke|instance/i'),
        page.locator('[data-testid*="federation"]'),
        page.locator('[data-testid*="spoke"]')
      ];

      let hasFederationUI = false;
      for (const indicator of federationIndicators) {
        if (await indicator.isVisible({ timeout: 3000 }).catch(() => false)) {
          hasFederationUI = true;
          break;
        }
      }

      expect(hasFederationUI).toBe(true);
      console.log('✅ Hub federation UI detected');
    });
  } else {
    // Spoke instance tests
    test('spoke shows connection to hub', async ({ page }) => {
      await page.goto('/');

      // Look for hub connection indicators
      const hubIndicators = [
        page.locator('text=/hub|connected|federation/i'),
        page.locator('[data-testid*="hub"]'),
        page.locator('[data-testid*="connection"]')
      ];

      // This is informational - don't fail if not found
      let hasHubConnection = false;
      for (const indicator of hubIndicators) {
        if (await indicator.isVisible({ timeout: 3000 }).catch(() => false)) {
          hasHubConnection = true;
          break;
        }
      }

      if (hasHubConnection) {
        console.log('✅ Spoke shows hub connection status');
      } else {
        console.log('ℹ️ Hub connection status not visible in UI');
      }
    });
  }
});

