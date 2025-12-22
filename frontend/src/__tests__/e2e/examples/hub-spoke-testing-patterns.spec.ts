/**
 * Hub-Spoke Testing Patterns - Practical Examples
 *
 * Shows how to structure Playwright tests for hub-spoke architecture
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../fixtures/test-users';
import { loginAs, logout } from '../helpers/auth';
import { DashboardPage } from '../pages/DashboardPage';

// =============================================================================
// PATTERN 1: Instance-Aware Test Configuration
// =============================================================================

const INSTANCE_CONFIG = {
  hub: {
    name: 'DIVE Hub',
    baseURL: process.env.HUB_FRONTEND_URL || 'http://localhost:3000',
    backendURL: process.env.HUB_BACKEND_URL || 'http://localhost:4000',
    testUsers: TEST_USERS.USA
  },
  fra: {
    name: 'France Spoke',
    baseURL: process.env.FRA_FRONTEND_URL || 'http://localhost:3025',
    backendURL: process.env.FRA_BACKEND_URL || 'http://localhost:4025',
    testUsers: TEST_USERS.FRA
  },
  gbr: {
    name: 'UK Spoke',
    baseURL: process.env.GBR_FRONTEND_URL || 'http://localhost:3003',
    backendURL: process.env.GBR_BACKEND_URL || 'http://localhost:4003',
    testUsers: TEST_USERS.GBR
  }
};

const CURRENT_INSTANCE = INSTANCE_CONFIG[process.env.DIVE_INSTANCE || 'hub'];

// =============================================================================
// PATTERN 2: Instance-Specific Test Suites
// =============================================================================

test.describe(`${CURRENT_INSTANCE.name} - Authentication`, () => {
  test.use({ baseURL: CURRENT_INSTANCE.baseURL });

  test('user can authenticate', async ({ page }) => {
    await loginAs(page, CURRENT_INSTANCE.testUsers.SECRET);

    const dashboard = new DashboardPage(page);
    await dashboard.verifyLoggedIn();
    await dashboard.verifyUserInfo(
      CURRENT_INSTANCE.testUsers.SECRET.username,
      CURRENT_INSTANCE.testUsers.SECRET.clearance,
      CURRENT_INSTANCE.testUsers.SECRET.countryCode
    );
  });
});

// =============================================================================
// PATTERN 3: Cross-Instance Federation Tests
// =============================================================================

test.describe('Federation - Cross-Instance Access', () => {
  test.use({ baseURL: INSTANCE_CONFIG.hub.baseURL });

  test('USA user can access FRA resources via federation', async ({ page }) => {
    // Login to hub as USA user
    await loginAs(page, TEST_USERS.USA.SECRET);

    // Enable federation mode (if UI supports it)
    // This would interact with federation toggle UI

    // Verify can see FRA resources
    // This tests the federation layer working
  });
});

// =============================================================================
// PATTERN 4: Parallel Instance Testing
// =============================================================================

test.describe.parallel('All Instances - Health Checks', () => {
  Object.entries(INSTANCE_CONFIG).forEach(([instanceKey, config]) => {
    test(`${config.name} is healthy`, async ({ page }) => {
      // Override baseURL for this specific test
      await page.goto(`${config.baseURL}/health`, {
        timeout: 10000
      });

      // Verify health endpoint response
      await expect(page.locator('text=healthy')).toBeVisible();
    });
  });
});

// =============================================================================
// PATTERN 5: CLI-Integrated Testing
// =============================================================================

/**
 * This pattern integrates with the @dive CLI for dynamic testing
 *
 * Usage:
 *   # Test hub instance
 *   ./dive hub up && DIVE_INSTANCE=hub npm run test:e2e
 *
 *   # Test FRA spoke
 *   ./dive --instance fra spoke up && DIVE_INSTANCE=fra npm run test:e2e
 *
 *   # Test federation
 *   ./dive federation up && npm run test:e2e:federation
 */

test.describe('CLI-Driven Instance Testing', () => {
  test.use({ baseURL: CURRENT_INSTANCE.baseURL });

  test(`runs on ${CURRENT_INSTANCE.name}`, async ({ page }) => {
    // This test automatically adapts based on DIVE_INSTANCE env var
    await page.goto('/');

    // Verify we're on the correct instance
    await expect(page.locator(`text=${CURRENT_INSTANCE.name}`)).toBeVisible();
  });
});

// =============================================================================
// PATTERN 6: Instance-Specific Resource Testing
// =============================================================================

test.describe(`${CURRENT_INSTANCE.name} - Resource Access`, () => {
  test.use({ baseURL: CURRENT_INSTANCE.baseURL });

  test('user can access instance-specific resources', async ({ page }) => {
    await loginAs(page, CURRENT_INSTANCE.testUsers.SECRET);

    // Navigate to resources
    await page.goto('/resources');

    // Verify instance-appropriate resources are shown
    // Hub might show all, spokes might show filtered sets
  });
});

export { INSTANCE_CONFIG, CURRENT_INSTANCE };

