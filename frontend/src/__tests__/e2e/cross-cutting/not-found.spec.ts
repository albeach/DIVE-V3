/**
 * Cross-cutting 404 / not-found page tests.
 *
 * Ensures that navigating to non-existent routes renders a user-friendly
 * 404 page, that the page provides navigational affordances (home link,
 * back button), and that it does not leak internal application paths or
 * appear blank.
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Selectors that indicate the 404 / not-found page rendered. */
const NOT_FOUND_SELECTORS = [
  '[data-testid="not-found"]',
  '[data-testid="404-page"]',
  '[data-testid="not-found-page"]',
  'text=404',
  'text=Page not found',
  'text=Not Found',
  'text=page doesn\'t exist',
  'text=could not be found',
].join(', ');

/**
 * Navigate to the given path and assert that a 404-like page is shown
 * (either a dedicated 404 page, an error page, or a redirect to a
 * known location).
 */
async function assertNotFoundOrErrorOrRedirect(
  page: import('@playwright/test').Page,
  path: string,
) {
  const response = await page.goto(path);
  await page.waitForLoadState('networkidle');

  const status = response?.status() ?? 0;
  const currentUrl = new URL(page.url());

  // Option 1: server returned 404 status
  const is404Status = status === 404;

  // Option 2: a 404 / not-found UI element is visible
  const notFoundVisible = await page
    .locator(NOT_FOUND_SELECTORS)
    .first()
    .isVisible()
    .catch(() => false);

  // Option 3: an error boundary rendered (some apps use a generic error page for missing routes)
  const errorBoundaryVisible = await page
    .locator(
      '[data-testid="error-boundary"], [data-testid="error-page"], text=Something went wrong, text=Error',
    )
    .first()
    .isVisible()
    .catch(() => false);

  // Option 4: the app redirected away from the bad path (e.g. to /dashboard or /login)
  const wasRedirected = currentUrl.pathname !== path;

  expect(
    is404Status || notFoundVisible || errorBoundaryVisible || wasRedirected,
    `Navigating to ${path} should show a 404 page, error page, or redirect -- ` +
      `status=${status}, notFound=${notFoundVisible}, error=${errorBoundaryVisible}, redirect=${wasRedirected}`,
  ).toBe(true);
}

// ---------------------------------------------------------------------------
// 404 rendering tests
// ---------------------------------------------------------------------------

test.describe('Not Found - Route handling', () => {
  test.use({ storageState: AUTH_STATE.AAL1 });

  test('Navigate to /nonexistent renders 404 page', async ({ page }) => {
    await assertNotFoundOrErrorOrRedirect(page, '/nonexistent');
  });

  test('Navigate to /resources/fake-id-12345 renders 404 or error page', async ({ page }) => {
    await assertNotFoundOrErrorOrRedirect(page, '/resources/fake-id-12345');
  });

  test('Navigate to /admin/nonexistent renders 404 or redirect', async ({ page }) => {
    await assertNotFoundOrErrorOrRedirect(page, '/admin/nonexistent');
  });

  test('Navigate to /policies/fake-id renders 404 page', async ({ page }) => {
    await assertNotFoundOrErrorOrRedirect(page, '/policies/fake-id');
  });
});

// ---------------------------------------------------------------------------
// 404 page quality checks
// ---------------------------------------------------------------------------

test.describe('Not Found - Page quality', () => {
  test.use({ storageState: AUTH_STATE.AAL1 });

  /**
   * Helper: navigate to /nonexistent and return true if we're still on a
   * 404-like page (not redirected away).  Quality tests only make sense
   * when the app actually renders a 404 page.
   */
  async function goto404(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.goto('/nonexistent');
    await page.waitForLoadState('networkidle');
    const status = response?.status() ?? 0;
    const url = new URL(page.url());
    // If the app redirected us away, these quality checks don't apply
    if (url.pathname !== '/nonexistent') return false;
    return true;
  }

  test('404 page has navigation link back to home', async ({ page }) => {
    const onPage = await goto404(page);
    if (!onPage) { test.skip(true, 'App redirects from unknown routes — 404 quality N/A'); return; }

    // Look for a link that takes the user back to a known location
    const homeLink = page.locator(
      'a[href="/"], a[href="/dashboard"], a:has-text("Home"), a:has-text("Go back"), a:has-text("Dashboard"), a:has-text("Return")',
    );
    const homeLinkCount = await homeLink.count();

    // Also check for a button-style navigation element
    const navButton = page.locator(
      'button:has-text("Home"), button:has-text("Go back"), button:has-text("Dashboard"), button:has-text("Return")',
    );
    const navButtonCount = await navButton.count();

    expect(
      homeLinkCount + navButtonCount,
      '404 page should have at least one navigation element to return home',
    ).toBeGreaterThan(0);
  });

  test('404 page shows user-friendly message (not blank)', async ({ page }) => {
    const onPage = await goto404(page);
    if (!onPage) { test.skip(true, 'App redirects from unknown routes — 404 quality N/A'); return; }

    const bodyText = (await page.locator('body').textContent()) ?? '';
    const trimmedText = bodyText.trim();

    // The page should not be blank
    expect(trimmedText.length, '404 page should not be blank').toBeGreaterThan(0);

    // It should contain some recognizable user-facing text
    const hasFriendlyMessage =
      /404/i.test(trimmedText) ||
      /not found/i.test(trimmedText) ||
      /doesn.*exist/i.test(trimmedText) ||
      /page.*missing/i.test(trimmedText) ||
      /could not be found/i.test(trimmedText) ||
      /go back/i.test(trimmedText) ||
      /return/i.test(trimmedText);

    expect(
      hasFriendlyMessage,
      '404 page should show a user-friendly message',
    ).toBe(true);
  });

  test('404 page does not expose internal paths', async ({ page }) => {
    const onPage = await goto404(page);
    if (!onPage) { test.skip(true, 'App redirects from unknown routes — 404 quality N/A'); return; }

    const bodyText = (await page.locator('body').textContent()) ?? '';

    // Internal file-system paths that should never appear
    const internalPathPatterns = [
      /\/app\/src\//,
      /\/node_modules\//,
      /\/usr\/local\//,
      /C:\\Users\\/,
      /webpack:\/\//,
      /at\s+\w+\s+\(.*:\d+:\d+\)/, // stack traces
      /\.tsx?:\d+/,                  // TypeScript source references
    ];

    for (const pattern of internalPathPatterns) {
      expect(
        bodyText,
        `404 page should not expose internal path matching: ${pattern}`,
      ).not.toMatch(pattern);
    }
  });

  test('Back button from 404 returns to previous page', async ({ page }) => {
    // First navigate to a known good page so there is history
    await page.goto('/dashboard');
    await page.waitForLoadState('networkidle');

    const dashboardUrl = page.url();

    // Now navigate to a non-existent page
    await page.goto('/nonexistent');
    await page.waitForLoadState('networkidle');

    // Go back using browser history
    await page.goBack();
    await page.waitForLoadState('networkidle');

    // Should be back on the dashboard (or at least not on the 404 page)
    const currentUrl = page.url();
    const backOnDashboard = currentUrl.includes('/dashboard');
    const notOn404 = !currentUrl.includes('/nonexistent');

    expect(
      backOnDashboard || notOn404,
      `Back button should return to previous page (expected dashboard, got ${currentUrl})`,
    ).toBe(true);
  });
});
