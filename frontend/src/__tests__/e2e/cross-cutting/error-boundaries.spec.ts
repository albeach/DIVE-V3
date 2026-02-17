/**
 * Cross-cutting error boundary tests.
 *
 * Verifies that every major admin page gracefully handles API failures
 * by rendering the application's error boundary UI rather than crashing
 * or showing raw stack traces.  Also covers retry behaviour, sensitive
 * data leakage prevention, recovery after navigation, network-offline
 * degradation, and session-expiry handling.
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Selectors that indicate the error boundary / error page rendered. */
const ERROR_BOUNDARY_SELECTORS = [
  '[data-testid="error-boundary"]',
  '[data-testid="error-page"]',
  '[data-testid="error-fallback"]',
  'text=Something went wrong',
  'text=An error occurred',
  'text=Unable to load',
  'text=Error',
  'text=Oops',
  'text=try again',
].join(', ');

/** Patterns that should NEVER appear on an error page. */
const SENSITIVE_PATTERNS = [
  /at\s+\w+\s+\(.*:\d+:\d+\)/, // JS stack traces
  /Error:\s+.*\n\s+at\s+/,       // Multi-line stack trace
  /Bearer\s+ey[A-Za-z0-9_-]+/,   // JWT tokens
  /token[=:]\s*["']?ey[A-Za-z0-9_-]+/, // token values
  /password[=:]/i,               // password fields
  /secret[=:]/i,                 // secret fields
  /MONGO_URI/,                   // connection strings
  /postgres:\/\//,               // postgres URIs
];

/**
 * Intercept the given API path and force a 500 response, then navigate
 * to the route and assert the error boundary rendered.
 */
async function interceptAndAssertErrorBoundary(
  page: import('@playwright/test').Page,
  apiGlob: string,
  route: string,
) {
  await page.route(apiGlob, (routeObj) =>
    routeObj.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ error: 'Internal Server Error' }),
    }),
  );

  await page.goto(route);
  await page.waitForLoadState('networkidle');

  // Wait for the error UI to appear (may take a moment after the fetch fails)
  const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
  await expect(errorElement).toBeVisible({ timeout: 10_000 });
}

// ---------------------------------------------------------------------------
// Admin error-boundary tests
// ---------------------------------------------------------------------------

test.describe('Error boundaries - Admin API failures', () => {
  test.use({ storageState: AUTH_STATE.ADMIN });

  test('Force API error on /admin/users renders error boundary', async ({ page }) => {
    await interceptAndAssertErrorBoundary(
      page,
      '**/api/admin/users*',
      '/admin/users',
    );
  });

  test('Force API error on /admin/certificates renders error boundary', async ({ page }) => {
    await interceptAndAssertErrorBoundary(
      page,
      '**/api/admin/certificates*',
      '/admin/certificates',
    );
  });

  test('Force API error on /admin/logs renders error boundary', async ({ page }) => {
    await interceptAndAssertErrorBoundary(
      page,
      '**/api/admin/logs*',
      '/admin/logs',
    );
  });

  test('Force API error on /admin/analytics renders error boundary', async ({ page }) => {
    await interceptAndAssertErrorBoundary(
      page,
      '**/api/admin/analytics*',
      '/admin/analytics',
    );
  });

  test('Force API error on /admin/federation/spokes renders error boundary', async ({ page }) => {
    await interceptAndAssertErrorBoundary(
      page,
      '**/api/admin/federation*',
      '/admin/federation/spokes',
    );
  });
});

// ---------------------------------------------------------------------------
// Error page behaviour
// ---------------------------------------------------------------------------

test.describe('Error boundaries - Error page behaviour', () => {
  test.use({ storageState: AUTH_STATE.ADMIN });

  test('Error page shows retry button', async ({ page }) => {
    await page.route('**/api/admin/users*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    );

    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
    await expect(errorElement).toBeVisible({ timeout: 10_000 });

    // Look for a retry / try-again button
    const retryButton = page.locator(
      'button:has-text("Retry"), button:has-text("Try Again"), button:has-text("Reload"), [data-testid="retry-button"]',
    );
    await expect(retryButton.first()).toBeVisible();
  });

  test('Retry button re-fetches data after error', async ({ page }) => {
    let callCount = 0;

    await page.route('**/api/admin/users*', (route) => {
      callCount++;
      if (callCount <= 1) {
        // First call fails
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
      // Subsequent calls succeed
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0 }),
      });
    });

    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
    await expect(errorElement).toBeVisible({ timeout: 10_000 });

    // Click retry
    const retryButton = page.locator(
      'button:has-text("Retry"), button:has-text("Try Again"), button:has-text("Reload"), [data-testid="retry-button"]',
    );
    await retryButton.first().click();

    // After retry, the error boundary should disappear (or at least a second request was made)
    await page.waitForLoadState('networkidle');
    expect(callCount).toBeGreaterThanOrEqual(2);
  });

  test('Error page does NOT leak sensitive information', async ({ page }) => {
    await page.route('**/api/admin/users*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Internal Server Error',
          stack: 'Error: DB connection failed\n    at Object.<anonymous> (/app/src/db.ts:42:11)',
          token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.fake',
        }),
      }),
    );

    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
    await expect(errorElement).toBeVisible({ timeout: 10_000 });

    // Grab the full text content of the page body
    const bodyText = (await page.locator('body').textContent()) ?? '';

    for (const pattern of SENSITIVE_PATTERNS) {
      expect(
        bodyText,
        `Page body should not match sensitive pattern: ${pattern}`,
      ).not.toMatch(pattern);
    }
  });

  test('Error page shows user-friendly message', async ({ page }) => {
    await page.route('**/api/admin/users*', (route) =>
      route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' }),
      }),
    );

    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
    await expect(errorElement).toBeVisible({ timeout: 10_000 });

    // The visible text should contain a human-readable message
    const text = (await errorElement.textContent()) ?? '';
    const isFriendly =
      /something went wrong/i.test(text) ||
      /error/i.test(text) ||
      /unable to load/i.test(text) ||
      /try again/i.test(text) ||
      /oops/i.test(text);

    expect(isFriendly, 'Error message should be user-friendly').toBe(true);
  });

  test('Navigate away from error and back recovers', async ({ page }) => {
    let shouldFail = true;

    await page.route('**/api/admin/users*', (route) => {
      if (shouldFail) {
        return route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Internal Server Error' }),
        });
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], total: 0 }),
      });
    });

    // Trigger the error
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    const errorElement = page.locator(ERROR_BOUNDARY_SELECTORS).first();
    await expect(errorElement).toBeVisible({ timeout: 10_000 });

    // Navigate away
    shouldFail = false;
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    // Navigate back -- the API now succeeds so the error boundary should not render
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // Give the page a moment to settle, then verify no error boundary is visible
    await page.waitForTimeout(2_000);
    const errorBoundaryStillVisible = await page
      .locator(ERROR_BOUNDARY_SELECTORS)
      .first()
      .isVisible()
      .catch(() => false);

    expect(errorBoundaryStillVisible, 'Error boundary should not persist after navigation recovery').toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Network & session edge cases
// ---------------------------------------------------------------------------

test.describe('Error boundaries - Network and session edge cases', () => {
  test.use({ storageState: AUTH_STATE.ADMIN });

  test('Force network offline shows graceful degradation', async ({ page, context }) => {
    // Load the page first so the shell renders
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // Go offline
    await context.setOffline(true);

    // Trigger a navigation or data refresh that requires the network
    await page.reload().catch(() => {
      // reload may throw when offline -- that is expected
    });

    // The page should show some offline / error indication rather than a blank screen
    await page.waitForTimeout(3_000);
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const pageIsBlank = bodyText.trim().length === 0;

    expect(pageIsBlank, 'Page should not be completely blank when offline').toBe(false);

    // Restore connectivity for cleanup
    await context.setOffline(false);
  });

  test('Session expiry during admin operation shows session error boundary', async ({ page }) => {
    // Let the page load normally first
    await page.goto('/admin/users');
    await page.waitForLoadState('networkidle');

    // Now intercept all subsequent API calls with a 401 to simulate session expiry
    await page.route('**/api/**', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Unauthorized', message: 'Session expired' }),
      }),
    );

    // Trigger a data refresh (click a refresh button or reload data)
    const refreshButton = page.locator(
      'button:has-text("Refresh"), button:has-text("Reload"), [data-testid="refresh-button"]',
    );
    if ((await refreshButton.count()) > 0) {
      await refreshButton.first().click();
    } else {
      // Fallback: navigate within admin to trigger an API call
      await page.goto('/admin/users');
    }

    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(3_000);

    // The app should show either the error boundary, a session-expired message,
    // or redirect to the login page
    const bodyText = (await page.locator('body').textContent()) ?? '';
    const currentUrl = page.url();

    const handledSessionExpiry =
      /session.*expir/i.test(bodyText) ||
      /unauthorized/i.test(bodyText) ||
      /sign.?in/i.test(bodyText) ||
      /log.?in/i.test(bodyText) ||
      currentUrl.includes('/login') ||
      currentUrl.includes('/auth') ||
      (await page.locator(ERROR_BOUNDARY_SELECTORS).first().isVisible().catch(() => false));

    expect(
      handledSessionExpiry,
      'App should handle session expiry gracefully (error boundary, message, or redirect)',
    ).toBe(true);
  });
});
