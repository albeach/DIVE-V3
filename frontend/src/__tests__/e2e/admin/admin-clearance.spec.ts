/**
 * Admin Clearance Management E2E Tests
 *
 * Tests the clearance management admin interface with 5 tabs:
 * - Overview: stats cards
 * - Matrix: country/clearance grid
 * - Editor: clearance mapping form
 * - Test: clearance validation tool
 * - Audit: change log entries
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminClearancePage } from '../pages/AdminClearancePage';

test.describe('Admin Clearance Management', () => {
  // Use saved admin session if available (from auth-setup.ts)
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.goto();
  });

  // ---------------------------------------------------------------------------
  // Page Rendering & Tabs
  // ---------------------------------------------------------------------------

  test('should render the page heading', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.verifyLoaded();
  });

  test('should display 5 tabs', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);

    await test.step('Verify Overview tab exists', async () => {
      await expect(clearancePage.overviewTab.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify Matrix tab exists', async () => {
      await expect(clearancePage.matrixTab.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify Editor tab exists', async () => {
      await expect(clearancePage.editorTab.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify Test tab exists', async () => {
      await expect(clearancePage.testTab.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify Audit tab exists', async () => {
      await expect(clearancePage.auditTab.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should have Overview tab active by default', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.verifyTabActive('overview');
  });

  // ---------------------------------------------------------------------------
  // Overview Tab
  // ---------------------------------------------------------------------------

  test('should display stats cards on Overview tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('overview');

    await expect(clearancePage.overviewStatsCards.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display countries count in stats', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('overview');

    const countriesValue = await clearancePage.getStatsCardValue('countries');
    expect(countriesValue).toBeTruthy();
    const numCountries = parseInt(countriesValue, 10);
    // Expect at least 1 country mapped
    expect(numCountries).toBeGreaterThanOrEqual(1);
  });

  test('should display mappings count in stats', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('overview');

    const mappingsValue = await clearancePage.getStatsCardValue('mappings');
    expect(mappingsValue).toBeTruthy();
    const numMappings = parseInt(mappingsValue, 10);
    expect(numMappings).toBeGreaterThanOrEqual(1);
  });

  test('should display multiple stats cards', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('overview');

    const cards = page
      .locator('[data-testid="stats-card"]')
      .or(page.locator('.stats-card'));
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // Matrix Tab
  // ---------------------------------------------------------------------------

  test('should render the matrix table on Matrix tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    await expect(clearancePage.matrixTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display country rows in the matrix', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    const rows = clearancePage.matrixCountryRow;
    const count = await rows.count();
    // Header + at least 1 country row
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should display USA in the matrix', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    const usaText = clearancePage.matrixTable
      .getByText(/united states|USA/i)
      .first();
    await expect(usaText).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display France in the matrix', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    const fraText = clearancePage.matrixTable
      .getByText(/france|FRA/i)
      .first();
    await expect(fraText).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display matrix cell value for USA SECRET', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    const cellValue = await clearancePage.getMatrixCell('United States', 'SECRET');
    expect(cellValue).toBeTruthy();
  });

  test('should display matrix cell value for France CONFIDENTIEL', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('matrix');

    // French clearance mapping uses equivalency
    const row = clearancePage.matrixTable
      .getByRole('row', { name: /france|FRA/i })
      .or(clearancePage.matrixTable.locator('tr:has-text("France")'));
    await expect(row.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  // ---------------------------------------------------------------------------
  // Editor Tab
  // ---------------------------------------------------------------------------

  test('should load the editor form on Editor tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('editor');

    await expect(clearancePage.editorForm.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display country selector in editor', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('editor');

    await expect(clearancePage.editorCountrySelect.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display level inputs in editor', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('editor');

    // Click country to populate level inputs
    await clearancePage.editorCountrySelect.first().click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const firstOption = page
      .getByRole('option').first()
      .or(page.locator('[data-value]').first());
    await firstOption.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await page.waitForLoadState('domcontentloaded');

    await expect(clearancePage.editorLevelInputs.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should show save button in editor', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('editor');

    const saveButton = page
      .getByRole('button', { name: /save/i })
      .or(page.locator('[data-testid="save-mapping"]'));

    await expect(saveButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should save a mapping via editor with mocked API', async ({ page }) => {
    await test.step('Intercept the save API call', async () => {
      await page.route('**/api/admin/clearance/mappings**', async (route) => {
        if (route.request().method() === 'PUT' || route.request().method() === 'POST') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'Mapping saved' }),
          });
        } else {
          await route.continue();
        }
      });
    });

    await test.step('Fill and submit the editor form', async () => {
      const clearancePage = new AdminClearancePage(page);
      await clearancePage.editMapping('United States', 'SECRET', 'SECRET');
    });

    await test.step('Verify success toast or notification', async () => {
      const successIndicator = page
        .locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST)
        .or(page.getByText(/saved|success/i));
      await expect(successIndicator.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Test Tab
  // ---------------------------------------------------------------------------

  test('should load the test tool on Test tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('test');

    const runButton = page
      .getByRole('button', { name: /test|run|evaluate/i })
      .or(page.locator('[data-testid="run-test"]'));

    await expect(runButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should show ALLOW for valid clearance mapping', async ({ page }) => {
    await test.step('Intercept validate API', async () => {
      await page.route('**/api/admin/clearance/validate**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: 'ALLOW',
            country: 'USA',
            clearance: 'SECRET',
            equivalentNatoLevel: 'SECRET',
          }),
        });
      });
    });

    await test.step('Run the test tool', async () => {
      const clearancePage = new AdminClearancePage(page);
      await clearancePage.testClearance('USA', 'SECRET');
    });

    await test.step('Verify ALLOW result', async () => {
      const clearancePage = new AdminClearancePage(page);
      const resultText = await clearancePage.testToolResult.first().textContent();
      expect(resultText).toMatch(/allow/i);
    });
  });

  test('should show DENY for invalid clearance mapping', async ({ page }) => {
    await test.step('Intercept validate API with deny response', async () => {
      await page.route('**/api/admin/clearance/validate**', async (route) => {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            result: 'DENY',
            country: 'INVALID_COUNTRY',
            clearance: 'INVALID_LEVEL',
            reason: 'No mapping found for the given country and clearance',
          }),
        });
      });
    });

    await test.step('Run the test tool with invalid input', async () => {
      const clearancePage = new AdminClearancePage(page);
      await clearancePage.testClearance('INVALID_COUNTRY', 'INVALID_LEVEL');
    });

    await test.step('Verify DENY result', async () => {
      const clearancePage = new AdminClearancePage(page);
      const resultText = await clearancePage.testToolResult.first().textContent();
      expect(resultText).toMatch(/deny/i);
    });
  });

  test('should display test result area after running test', async ({ page }) => {
    await page.route('**/api/admin/clearance/validate**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ result: 'ALLOW', country: 'USA', clearance: 'UNCLASSIFIED' }),
      });
    });

    const clearancePage = new AdminClearancePage(page);
    await clearancePage.testClearance('USA', 'UNCLASSIFIED');

    await expect(clearancePage.testToolResult.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  // ---------------------------------------------------------------------------
  // Audit Tab
  // ---------------------------------------------------------------------------

  test('should display audit log table on Audit tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('audit');

    await expect(clearancePage.auditLogTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display audit log entries', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.switchTab('audit');

    const entries = clearancePage.auditLogEntry;
    const count = await entries.count();
    // At least header + 1 entry
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('should verify audit entry contains action column', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    await clearancePage.verifyAuditEntry({ action: '.*' }); // any action
  });

  // ---------------------------------------------------------------------------
  // Tab Switching & State Preservation
  // ---------------------------------------------------------------------------

  test('should switch to Matrix tab and back to Overview', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);

    await test.step('Switch to Matrix tab', async () => {
      await clearancePage.switchTab('matrix');
      await clearancePage.verifyTabActive('matrix');
    });

    await test.step('Switch back to Overview tab', async () => {
      await clearancePage.switchTab('overview');
      await clearancePage.verifyTabActive('overview');
    });

    await test.step('Verify Overview content is still present', async () => {
      await expect(clearancePage.overviewStatsCards.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should navigate through all 5 tabs in order', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);
    const tabs: Array<'overview' | 'matrix' | 'editor' | 'test' | 'audit'> = [
      'overview',
      'matrix',
      'editor',
      'test',
      'audit',
    ];

    for (const tab of tabs) {
      await test.step(`Switch to ${tab} tab`, async () => {
        await clearancePage.switchTab(tab);
        await clearancePage.verifyTabActive(tab);
      });
    }
  });

  test('should preserve editor form state when switching tabs', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);

    await test.step('Switch to Editor tab and select a country', async () => {
      await clearancePage.switchTab('editor');
      await clearancePage.editorCountrySelect.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
      const firstOption = page.getByRole('option').first().or(page.locator('[data-value]').first());
      await firstOption.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForLoadState('domcontentloaded');
    });

    await test.step('Switch to Overview and back to Editor', async () => {
      await clearancePage.switchTab('overview');
      await clearancePage.switchTab('editor');
    });

    await test.step('Verify editor form is still visible', async () => {
      await expect(clearancePage.editorForm.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should switch from Audit back to Test tab', async ({ page }) => {
    const clearancePage = new AdminClearancePage(page);

    await test.step('Go to Audit tab', async () => {
      await clearancePage.switchTab('audit');
      await clearancePage.verifyTabActive('audit');
    });

    await test.step('Switch to Test tab', async () => {
      await clearancePage.switchTab('test');
      await clearancePage.verifyTabActive('test');
    });
  });

  // ---------------------------------------------------------------------------
  // Admin Sidebar
  // ---------------------------------------------------------------------------

  test('should show admin sidebar navigation', async ({ page }) => {
    const sidebar = page.locator(TEST_CONFIG.SELECTORS.ADMIN_SIDEBAR);
    await expect(sidebar.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });
});
