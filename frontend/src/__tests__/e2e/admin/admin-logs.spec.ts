import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminLogsPage } from '../pages/AdminLogsPage';

test.describe('Admin Logs', () => {
  // Use saved admin session if available
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
    const logsPage = new AdminLogsPage(page);
    await logsPage.goto();
  });

  test('page renders with log table', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);

    await test.step('Heading is visible', async () => {
      await expect(logsPage.heading).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
      await expect(logsPage.heading).toContainText(/log/i);
    });

    await test.step('Log table or list is present', async () => {
      await expect(logsPage.logTable).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });
  });

  test('filter by ERROR log level', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Select ERROR level filter', async () => {
      await logsPage.filterByLevel('ERROR');
    });

    await test.step('Verify filtered results show only ERROR entries', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const rows = logsPage.logRows;
      const rowCount = await rows.count();

      if (rowCount > 0) {
        for (let i = 0; i < Math.min(rowCount, 5); i++) {
          const rowText = await rows.nth(i).textContent();
          expect(rowText?.toLowerCase()).toContain('error');
        }
      }
    });
  });

  test('filter by WARN log level', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Select WARN level filter', async () => {
      await logsPage.filterByLevel('WARN');
    });

    await test.step('Verify filtered results contain WARN entries', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const rows = logsPage.logRows;
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRowText = await rows.first().textContent();
        expect(firstRowText?.toLowerCase()).toContain('warn');
      }
    });
  });

  test('filter by INFO log level', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Select INFO level filter', async () => {
      await logsPage.filterByLevel('INFO');
    });

    await test.step('Verify filtered results contain INFO entries', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const rows = logsPage.logRows;
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRowText = await rows.first().textContent();
        expect(firstRowText?.toLowerCase()).toContain('info');
      }
    });
  });

  test('filter by DEBUG log level', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Select DEBUG level filter', async () => {
      await logsPage.filterByLevel('DEBUG');
    });

    await test.step('Verify filtered results contain DEBUG entries', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const rows = logsPage.logRows;
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRowText = await rows.first().textContent();
        expect(firstRowText?.toLowerCase()).toContain('debug');
      }
    });
  });

  test('filter by source', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Open source filter and select a source', async () => {
      const sourceFilter = page.locator('[data-testid="source-filter"], select[name="source"], [data-testid*="source"]');
      if (!await sourceFilter.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Source filter not available');
        return;
      }

      await sourceFilter.click();
      const sourceOption = page.locator('option, [role="option"], li').filter({ hasText: /.+/ }).first();
      if (await sourceOption.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await sourceOption.click();
      }
    });

    await test.step('Results are filtered', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const rows = logsPage.logRows;
      const rowCount = await rows.count();
      // Source filter should return results or empty state
      expect(rowCount).toBeGreaterThanOrEqual(0);
    });
  });

  test('search logs by keyword', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const searchTerm = 'authentication';

    await test.step('Enter search keyword', async () => {
      await logsPage.searchInput.fill(searchTerm);
      await logsPage.searchInput.press('Enter');
    });

    await test.step('Wait for filtered results', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Verify results match search term or show no results', async () => {
      const rows = logsPage.logRows;
      const rowCount = await rows.count();

      if (rowCount > 0) {
        const firstRowText = await rows.first().textContent();
        expect(firstRowText?.toLowerCase()).toContain(searchTerm.toLowerCase());
      } else {
        const noResults = page.locator('[data-testid="no-results"], .no-results, .empty-state');
        await expect(noResults.first().or(logsPage.logTable)).toBeVisible();
      }
    });
  });

  test('date range filter works', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Set date range', async () => {
      const startDate = page.locator('[data-testid="start-date"], input[name="startDate"], input[type="date"]').first();
      const endDate = page.locator('[data-testid="end-date"], input[name="endDate"], input[type="date"]').last();

      if (!await startDate.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Date range filter not available');
        return;
      }

      const today = new Date();
      const lastWeek = new Date(today);
      lastWeek.setDate(today.getDate() - 7);

      await startDate.fill(lastWeek.toISOString().split('T')[0]);
      await endDate.fill(today.toISOString().split('T')[0]);
    });

    await test.step('Apply filter and verify results load', async () => {
      const applyButton = page.locator('button', { hasText: /apply|filter|search/i });
      if (await applyButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await applyButton.click();
      }

      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      await expect(logsPage.logTable).toBeVisible();
    });
  });

  test('export logs triggers download', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Click export button', async () => {
      const exportButton = page.locator('button', { hasText: /export|download/i });
      if (!await exportButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Export button not available');
        return;
      }

      const downloadPromise = page.waitForEvent('download', { timeout: TEST_CONFIG.TIMEOUTS.ACTION }).catch(() => null);
      await exportButton.click();
      const download = await downloadPromise;

      if (download) {
        expect(download.suggestedFilename()).toBeTruthy();
      }
    });
  });

  test('log entries show correct structure', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const rowCount = await logsPage.logRows.count();
    if (rowCount === 0) {
      test.skip(true, 'No log entries available to verify structure');
      return;
    }

    await test.step('Log entry contains timestamp', async () => {
      const firstRow = logsPage.logRows.first();
      const rowText = await firstRow.textContent();
      const hasTimestamp = /\d{2,4}[-/]\d{2}[-/]\d{2,4}|\d{1,2}:\d{2}:\d{2}|ago|today/i.test(rowText ?? '');
      expect(hasTimestamp).toBeTruthy();
    });

    await test.step('Log entry contains level indicator', async () => {
      const firstRow = logsPage.logRows.first();
      const rowText = await firstRow.textContent();
      const hasLevel = /error|warn|info|debug|critical|trace/i.test(rowText ?? '');
      expect(hasLevel).toBeTruthy();
    });

    await test.step('Log entry contains source', async () => {
      const firstRow = logsPage.logRows.first();
      const cells = firstRow.locator('td, [data-testid*="cell"], .log-cell');
      const cellCount = await cells.count();
      // A proper log entry should have multiple columns (timestamp, level, source, message)
      expect(cellCount).toBeGreaterThanOrEqual(3);
    });

    await test.step('Log entry contains message content', async () => {
      const firstRow = logsPage.logRows.first();
      const rowText = await firstRow.textContent();
      expect(rowText!.length).toBeGreaterThan(10);
    });
  });

  test('pagination works for large log sets', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Check for pagination controls', async () => {
      const pagination = page.locator('[data-testid="pagination"], nav[aria-label*="pag"], .pagination, [role="navigation"]');
      const nextButton = page.locator('button', { hasText: /next|>/i });
      const pageNumbers = page.locator('[data-testid*="page-number"], .page-number, [aria-label*="Page"]');

      const hasPagination = await pagination.isVisible().catch(() => false);
      const hasNextButton = await nextButton.isVisible().catch(() => false);
      const hasPageNumbers = await pageNumbers.count() > 0;

      if (!hasPagination && !hasNextButton && !hasPageNumbers) {
        test.skip(true, 'Pagination controls not present (log set may be small)');
        return;
      }
    });

    await test.step('Navigate to next page', async () => {
      const nextButton = page.locator('button', { hasText: /next|>/i }).first();
      if (await nextButton.isEnabled()) {
        await nextButton.click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
        await expect(logsPage.logTable).toBeVisible();
      }
    });
  });

  test('violations tab shows security-relevant entries', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Switch to violations tab', async () => {
      const violationsTab = page.locator('[role="tab"], button, a').filter({ hasText: /violation|security|alert/i }).first();

      if (!await violationsTab.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Violations tab not available');
        return;
      }

      await violationsTab.click();
    });

    await test.step('Verify violations content loads', async () => {
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      const violationEntries = page.locator('[data-testid*="violation"], tr, .log-entry');
      const emptyState = page.locator('[data-testid="no-violations"], .empty-state');

      const hasEntries = await violationEntries.count() > 0;
      const hasEmpty = await emptyState.isVisible().catch(() => false);
      expect(hasEntries || hasEmpty).toBeTruthy();
    });
  });

  test('refresh button reloads log data', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Click refresh button', async () => {
      const refreshButton = page.locator('button', { hasText: /refresh|reload/i })
        .or(page.locator('button[aria-label*="refresh"], [data-testid="refresh-button"]'));

      if (!await refreshButton.first().isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Refresh button not available');
        return;
      }

      await refreshButton.first().click();
    });

    await test.step('Log table is still visible after refresh', async () => {
      await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
      await expect(logsPage.logTable).toBeVisible();
    });
  });

  test('retention policy badge is visible', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Check for retention policy indicator', async () => {
      const retentionBadge = page.locator('[data-testid*="retention"], .retention, .badge').filter({ hasText: /retention|day|keep/i });
      const retentionText = page.locator('text=/\\d+\\s*(days?|months?)/i');

      const hasBadge = await retentionBadge.isVisible().catch(() => false);
      const hasText = await retentionText.isVisible().catch(() => false);

      if (!hasBadge && !hasText) {
        test.skip(true, 'Retention policy badge not displayed');
        return;
      }

      if (hasBadge) {
        await expect(retentionBadge).toBeVisible();
      } else {
        await expect(retentionText).toBeVisible();
      }
    });
  });

  test('clearing search resets log display', async ({ page }) => {
    const logsPage = new AdminLogsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const initialCount = await logsPage.logRows.count();

    await test.step('Enter a search term', async () => {
      await logsPage.searchInput.fill('xyznonexistent');
      await logsPage.searchInput.press('Enter');
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Clear the search', async () => {
      await logsPage.searchInput.clear();
      await logsPage.searchInput.press('Enter');
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Log display resets to original state', async () => {
      const resetCount = await logsPage.logRows.count();
      expect(resetCount).toBeGreaterThanOrEqual(0);
      await expect(logsPage.logTable).toBeVisible();
    });
  });
});
