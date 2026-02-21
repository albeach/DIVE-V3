/**
 * Comprehensive Error Handling Tests for DIVE Hub
 *
 * Tests all error scenarios and edge cases:
 * - Network failures and timeouts
 * - Authentication errors
 * - Authorization failures
 * - Service unavailability
 * - Data corruption scenarios
 * - Invalid input handling
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { loginAs, logout } from '../../helpers/auth';

test.describe('DIVE Hub - Error Handling', () => {
  test.describe('Network and Connectivity Errors', () => {
    test('should handle backend service unavailability', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      // Simulate backend down (would need network interception)
      // For now, test error display components
      await page.route('**/api/resources', route => route.abort());

      await page.reload();

      // Should show service unavailable error
      await expect(page.locator('[data-testid="service-unavailable"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-button"]')).toBeVisible();
    });

    test('should handle slow network timeouts', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate slow responses
      await page.route('**/api/**', async route => {
        await new Promise(resolve => setTimeout(resolve, 35000)); // Longer than timeout
        await route.fulfill({ status: 200, body: '{}' });
      });

      await page.goto('/resources');

      // Should show timeout error
      await expect(page.locator('[data-testid="timeout-error"]')).toBeVisible();
    });

    test('should handle intermittent connectivity', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      let requestCount = 0;
      await page.route('**/api/resources', route => {
        requestCount++;
        if (requestCount % 3 === 0) {
          route.abort(); // Fail every 3rd request
        } else {
          route.fulfill({ status: 200, body: '[]' });
        }
      });

      await page.goto('/resources');

      // Should eventually load or show appropriate error
      await expect(page.locator('[data-testid="loading-error"]').or(page.locator('[data-testid="resource-list"]'))).toBeVisible();
    });
  });

  test.describe('Authentication Error Scenarios', () => {
    test('should handle expired tokens gracefully', async ({ page }) => {
      // Login and then simulate token expiration
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      // Simulate expired token by modifying local storage
      await page.evaluate(() => {
        localStorage.setItem('next-auth.session-token', 'expired-token');
      });

      // Try to access protected resource
      await page.goto('/resources/secret-doc-123');

      // Should redirect to login or show session expired
      await expect(page.locator('[data-testid="session-expired"]').or(page.getByRole('button', { name: /United States/i }))).toBeVisible();
    });

    test('should handle concurrent session conflicts', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      await loginAs(page1, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await loginAs(page2, TEST_USERS.USA.SECRET, { otpCode: '123456' }); // Same user

      // Both try to modify same resource
      await page1.goto('/resources/test-resource/edit');
      await page2.goto('/resources/test-resource/edit');

      // One should succeed, other should get conflict error
      await page1.fill('[data-testid="resource-title"]', 'Modified by Page 1');
      await page1.click('[data-testid="save-btn"]');

      await page2.fill('[data-testid="resource-title"]', 'Modified by Page 2');
      await page2.click('[data-testid="save-btn"]');

      // Page 2 should show conflict error
      await expect(page2.locator('[data-testid="conflict-error"]')).toBeVisible();

      await context1.close();
      await context2.close();
    });

    test('should handle malformed JWT tokens', async ({ page }) => {
      // Manually set malformed token
      await page.goto('/');
      await page.evaluate(() => {
        localStorage.setItem('next-auth.session-token', 'malformed.jwt.token');
      });

      await page.reload();

      // Should clear invalid token and show login
      await expect(page.getByRole('button', { name: /United States/i })).toBeVisible();
    });
  });

  test.describe('Authorization Error Scenarios', () => {
    test('should handle insufficient clearance errors', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });

      // Try to access SECRET resource directly
      await page.goto('/resources/secret-document-123');

      // Should show clearance error
      await expect(page.locator('[data-testid="insufficient-clearance"]')).toBeVisible();
      await expect(page.locator('[data-testid="required-clearance"]')).toContainText('SECRET');
      await expect(page.locator('[data-testid="user-clearance"]')).toContainText('CONFIDENTIAL');
    });

    test('should handle COI restriction errors', async ({ page }) => {
      await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });

      // Try to access FVEY-only resource
      await page.goto('/resources/fvey-document-123');

      // Should show COI error
      await expect(page.locator('[data-testid="coi-restriction"]')).toBeVisible();
      await expect(page.locator('[data-testid="required-coi"]')).toContainText('FVEY');
      await expect(page.locator('[data-testid="user-coi"]')).not.toContainText('FVEY');
    });

    test('should handle releasability errors', async ({ page }) => {
      await loginAs(page, TEST_USERS.CHN.SECRET, { otpCode: '123456' });

      // Try to access USA-only resource
      await page.goto('/resources/usa-only-document-123');

      // Should show releasability error
      await expect(page.locator('[data-testid="releasability-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="allowed-countries"]')).toContainText('USA');
      await expect(page.locator('[data-testid="user-country"]')).toContainText('CHN');
    });

    test('should handle embargo date violations', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Try to access embargoed resource (future date)
      await page.goto('/resources/embargoed-document-123');

      // Should show embargo error
      await expect(page.locator('[data-testid="embargo-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="embargo-date"]')).toBeVisible();
      await expect(page.locator('[data-testid="current-date"]')).toBeVisible();
    });
  });

  test.describe('Service Unavailability Scenarios', () => {
    test('should handle Keycloak unavailability', async ({ page }) => {
      await page.goto('/');

      // Simulate Keycloak down
      await page.route('**/realms/**', route => route.abort());

      await page.getByRole('button', { name: /United States/i }).click();

      // Should show Keycloak unavailable error
      await expect(page.locator('[data-testid="keycloak-unavailable"]')).toBeVisible();
    });

    test('should handle OPA policy engine failures', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate OPA down
      await page.route('**/v1/data/**', route => route.abort());

      await page.goto('/resources');

      // Should show policy evaluation error
      await expect(page.locator('[data-testid="policy-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-policy"]')).toBeVisible();
    });

    test('should handle MongoDB connection failures', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate database down (would need backend to handle this)
      await page.route('**/api/resources', route => route.fulfill({
        status: 503,
        body: JSON.stringify({ error: 'Database unavailable' })
      }));

      await page.goto('/resources');

      // Should show database error
      await expect(page.locator('[data-testid="database-error"]')).toBeVisible();
    });
  });

  test.describe('Data Corruption and Validation Errors', () => {
    test('should handle corrupted resource data', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate corrupted response
      await page.route('**/api/resources/123', route => route.fulfill({
        status: 200,
        body: 'invalid json {{{'
      }));

      await page.goto('/resources/123');

      // Should show data corruption error
      await expect(page.locator('[data-testid="data-corruption-error"]')).toBeVisible();
    });

    test('should handle invalid form submissions', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources/new');

      // Submit empty form
      await page.click('[data-testid="create-resource"]');

      // Should show validation errors
      await expect(page.locator('[data-testid="title-required"]')).toBeVisible();
      await expect(page.locator('[data-testid="classification-required"]')).toBeVisible();
      await expect(page.locator('[data-testid="content-required"]')).toBeVisible();
    });

    test('should handle oversized file uploads', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources/new');

      // Try to upload oversized file (would need file input simulation)
      // Should show file size error
      await expect(page.locator('[data-testid="file-too-large"]')).toBeVisible();
    });
  });

  test.describe('Rate Limiting and Abuse Prevention', () => {
    test('should handle rate limiting gracefully', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate rate limiting
      let requestCount = 0;
      await page.route('**/api/resources', route => {
        requestCount++;
        if (requestCount > 10) {
          route.fulfill({ status: 429, body: 'Rate limited' });
        } else {
          route.fulfill({ status: 200, body: '[]' });
        }
      });

      // Make many rapid requests
      for (let i = 0; i < 15; i++) {
        await page.reload();
      }

      // Should show rate limit error
      await expect(page.locator('[data-testid="rate-limited"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-after"]')).toBeVisible();
    });

    test('should handle CSRF token validation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Try to submit form without CSRF token
      await page.route('**/api/resources', route => route.fulfill({
        status: 403,
        body: JSON.stringify({ error: 'Invalid CSRF token' })
      }));

      await page.goto('/resources/new');
      await page.fill('[data-testid="resource-title"]', 'Test');
      await page.click('[data-testid="create-resource"]');

      // Should show CSRF error
      await expect(page.locator('[data-testid="csrf-error"]')).toBeVisible();
    });
  });

  test.describe('Browser and Client-Side Errors', () => {
    test('should handle JavaScript errors gracefully', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Inject JavaScript error
      await page.addScriptTag({
        content: 'throw new Error("Test JavaScript error");'
      });

      await page.goto('/resources');

      // Should show error boundary or continue functioning
      await expect(page.locator('[data-testid="js-error-boundary"]').or(page.locator('[data-testid="resource-list"]'))).toBeVisible();
    });

    test('should handle localStorage corruption', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Corrupt localStorage
      await page.evaluate(() => {
        localStorage.setItem('next-auth.session-token', 'corrupted-data-{{{');
        localStorage.setItem('user-preferences', 'invalid-json');
      });

      await page.reload();

      // Should handle corruption gracefully
      await expect(page.getByRole('button', { name: /United States/i })).toBeVisible();
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources');
      await page.goto('/resources/123');

      // Use browser back button
      await page.goBack();

      // Should maintain authentication state
      await expect(page.locator('[data-testid="resource-list"]')).toBeVisible();

      // Go forward
      await page.goForward();
      await expect(page.locator('[data-testid="resource-detail"]')).toBeVisible();
    });
  });

  test.describe('Recovery and Retry Mechanisms', () => {
    test('should allow retry after temporary failures', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate temporary failure then success
      let attemptCount = 0;
      await page.route('**/api/resources', route => {
        attemptCount++;
        if (attemptCount === 1) {
          route.fulfill({ status: 503, body: 'Temporary failure' });
        } else {
          route.fulfill({ status: 200, body: '[]' });
        }
      });

      await page.goto('/resources');

      // Should show retry option
      await page.click('[data-testid="retry-button"]');

      // Should eventually succeed
      await expect(page.locator('[data-testid="resource-list"]')).toBeVisible();
    });

    test('should provide manual refresh options', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Simulate stale data
      await page.route('**/api/resources', route => route.fulfill({
        status: 200,
        body: '[]',
        headers: { 'Cache-Control': 'max-age=3600' }
      }));

      await page.goto('/resources');

      // Should show refresh button
      await expect(page.locator('[data-testid="refresh-data"]')).toBeVisible();

      // Click refresh
      await page.click('[data-testid="refresh-data"]');

      // Should reload data
      await expect(page.locator('[data-testid="loading-indicator"]')).toBeVisible();
    });
  });
});

