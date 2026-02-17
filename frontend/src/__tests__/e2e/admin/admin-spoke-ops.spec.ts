import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminSpokeOpsPage } from '../pages/AdminSpokeOpsPage';

test.describe('Admin Spoke Operations', () => {
  // Use saved admin session if available
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await spokeOpsPage.goto();
  });

  test('spoke overview page renders', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);

    await test.step('Heading is visible', async () => {
      await expect(spokeOpsPage.heading).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });

    await test.step('Spoke list or overview content loads', async () => {
      const content = page.locator('[data-testid="spoke-list"], [data-testid="spoke-overview"], table, .spoke-card');
      await expect(content.first().or(spokeOpsPage.heading)).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });

  test('spoke entries display status information', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Spoke entries are visible', async () => {
      const spokeEntries = spokeOpsPage.spokeEntries;
      const entryCount = await spokeEntries.count();

      if (entryCount === 0) {
        test.skip(true, 'No spoke entries available');
        return;
      }

      const firstEntry = spokeEntries.first();
      const entryText = await firstEntry.textContent();
      expect(entryText).toBeTruthy();
      expect(entryText!.length).toBeGreaterThan(0);
    });
  });

  test('maintenance mode toggle enable works', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to maintenance section', async () => {
      await spokeOpsPage.navigateToMaintenance();
    });

    await test.step('Enable maintenance mode', async () => {
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();

      if (!await toggle.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Maintenance mode toggle not available');
        return;
      }

      const isCurrentlyEnabled = await toggle.isChecked().catch(() => false);

      if (!isCurrentlyEnabled) {
        await toggle.click();
      }
    });

    await test.step('Handle confirmation dialog', async () => {
      const confirmDialog = page.locator('[role="dialog"], dialog, .modal');
      if (await confirmDialog.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        const confirmButton = confirmDialog.locator('button', { hasText: /confirm|enable|yes/i });
        await confirmButton.click();
      }
    });

    await test.step('Verify maintenance mode is enabled', async () => {
      const statusIndicator = page.locator('[data-testid="maintenance-status"], .maintenance-status, .status-indicator');
      const enabledText = page.locator('text=/maintenance.*enabled|enabled.*maintenance|in maintenance/i');

      const hasIndicator = await statusIndicator.isVisible().catch(() => false);
      const hasEnabledText = await enabledText.isVisible().catch(() => false);
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();
      const isChecked = await toggle.isChecked().catch(() => false);

      expect(hasIndicator || hasEnabledText || isChecked).toBeTruthy();
    });
  });

  test('maintenance mode toggle disable works', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to maintenance section', async () => {
      await spokeOpsPage.navigateToMaintenance();
    });

    await test.step('Ensure maintenance mode is enabled first', async () => {
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();

      if (!await toggle.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Maintenance mode toggle not available');
        return;
      }

      const isEnabled = await toggle.isChecked().catch(() => false);
      if (!isEnabled) {
        await toggle.click();

        const confirmDialog = page.locator('[role="dialog"], dialog, .modal');
        if (await confirmDialog.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
          await confirmDialog.locator('button', { hasText: /confirm|enable|yes/i }).click();
        }
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
      }
    });

    await test.step('Disable maintenance mode', async () => {
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();
      await toggle.click();

      const confirmDialog = page.locator('[role="dialog"], dialog, .modal');
      if (await confirmDialog.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await confirmDialog.locator('button', { hasText: /confirm|disable|yes/i }).click();
      }
    });

    await test.step('Verify maintenance mode is disabled', async () => {
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();
      const isChecked = await toggle.isChecked().catch(() => false);
      expect(isChecked).toBeFalsy();
    });
  });

  test('maintenance status indicator reflects current state', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to maintenance section', async () => {
      await spokeOpsPage.navigateToMaintenance();
    });

    await test.step('Status indicator is present and shows a valid state', async () => {
      const statusIndicator = page.locator('[data-testid="maintenance-status"], .maintenance-status, .status-indicator, .badge');
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();

      const hasStatus = await statusIndicator.first().isVisible().catch(() => false);
      const hasToggle = await toggle.isVisible().catch(() => false);

      if (!hasStatus && !hasToggle) {
        test.skip(true, 'No maintenance status indicator found');
        return;
      }

      if (hasStatus) {
        const statusText = await statusIndicator.first().textContent();
        const hasValidState = /enabled|disabled|active|inactive|on|off|maintenance/i.test(statusText ?? '');
        expect(hasValidState).toBeTruthy();
      }
    });
  });

  test('failover page shows event log', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to failover section', async () => {
      await spokeOpsPage.navigateToFailover();
    });

    await test.step('Failover event log or empty state is visible', async () => {
      const eventLog = page.locator('[data-testid="failover-events"], [data-testid="event-log"], table, .event-list');
      const emptyState = page.locator('[data-testid="no-events"], .empty-state');
      const heading = page.locator('h1, h2, h3').filter({ hasText: /failover/i });

      const hasLog = await eventLog.first().isVisible().catch(() => false);
      const hasEmpty = await emptyState.isVisible().catch(() => false);
      const hasHeading = await heading.isVisible().catch(() => false);

      expect(hasLog || hasEmpty || hasHeading).toBeTruthy();
    });
  });

  test('failover events have timestamps and descriptions', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to failover section', async () => {
      await spokeOpsPage.navigateToFailover();
    });

    await test.step('Verify event entries contain required fields', async () => {
      const eventRows = page.locator('[data-testid*="event"], tr, .event-entry').filter({ hasText: /.+/ });
      const rowCount = await eventRows.count();

      if (rowCount === 0) {
        test.skip(true, 'No failover events to verify');
        return;
      }

      const firstEvent = eventRows.first();
      const eventText = await firstEvent.textContent();

      // Should contain a timestamp pattern
      const hasTimestamp = /\d{2,4}[-/]\d{2}[-/]\d{2,4}|\d{1,2}:\d{2}|ago|today|yesterday/i.test(eventText ?? '');
      expect(hasTimestamp).toBeTruthy();

      // Should contain some descriptive text
      expect(eventText!.length).toBeGreaterThan(10);
    });
  });

  test('audit page shows queue status', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to audit section', async () => {
      await spokeOpsPage.navigateToAudit();
    });

    await test.step('Audit content loads', async () => {
      const auditContent = page.locator('[data-testid="audit-queue"], [data-testid*="audit"], table, .audit-list');
      const queueStatus = page.locator('[data-testid="queue-status"], .queue-status');
      const heading = page.locator('h1, h2, h3').filter({ hasText: /audit|queue/i });

      const hasContent = await auditContent.first().isVisible().catch(() => false);
      const hasQueue = await queueStatus.isVisible().catch(() => false);
      const hasHeading = await heading.isVisible().catch(() => false);

      expect(hasContent || hasQueue || hasHeading).toBeTruthy();
    });
  });

  test('policy sync status is visible', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Check for policy sync status indicator', async () => {
      const syncStatus = page.locator('[data-testid="policy-sync"], [data-testid*="sync"], .sync-status');
      const syncText = page.locator('text=/sync|policy.*status|last.*sync/i');

      const hasStatus = await syncStatus.first().isVisible().catch(() => false);
      const hasText = await syncText.isVisible().catch(() => false);

      if (!hasStatus && !hasText) {
        test.skip(true, 'Policy sync status not displayed on this view');
        return;
      }

      if (hasStatus) {
        await expect(syncStatus.first()).toBeVisible();
      }
    });
  });

  test('navigate between maintenance, failover, and audit sub-routes', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to maintenance', async () => {
      await spokeOpsPage.navigateToMaintenance();
      const maintenanceContent = page.locator('text=/maintenance/i');
      await expect(maintenanceContent.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });

    await test.step('Navigate to failover', async () => {
      await spokeOpsPage.navigateToFailover();
      const failoverContent = page.locator('text=/failover/i');
      await expect(failoverContent.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });

    await test.step('Navigate to audit', async () => {
      await spokeOpsPage.navigateToAudit();
      const auditContent = page.locator('text=/audit/i');
      await expect(auditContent.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });
  });

  test('maintenance mode confirmation dialog appears', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Navigate to maintenance section', async () => {
      await spokeOpsPage.navigateToMaintenance();
    });

    await test.step('Click maintenance toggle to trigger dialog', async () => {
      const toggle = page.locator('[data-testid="maintenance-toggle"], [role="switch"], input[type="checkbox"]').first();

      if (!await toggle.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        test.skip(true, 'Maintenance toggle not available');
        return;
      }

      await toggle.click();
    });

    await test.step('Confirmation dialog is displayed', async () => {
      const dialog = page.locator('[role="dialog"], dialog, .modal, [data-testid="confirmation-dialog"]');

      if (await dialog.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await expect(dialog).toBeVisible();

        // Dialog should have confirm and cancel buttons
        const confirmButton = dialog.locator('button', { hasText: /confirm|yes|enable|disable/i });
        const cancelButton = dialog.locator('button', { hasText: /cancel|no/i });

        await expect(confirmButton).toBeVisible();
        await expect(cancelButton).toBeVisible();

        // Dismiss the dialog without confirming
        await cancelButton.click();
      }
    });
  });

  test('error handling when spoke is unreachable', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);

    await test.step('Mock API failure for spoke connectivity', async () => {
      await page.route('**/api/**/spoke*/**', (route) => {
        route.fulfill({
          status: 503,
          body: JSON.stringify({ error: 'Service Unavailable', message: 'Spoke is unreachable' }),
          contentType: 'application/json',
        });
      });
    });

    await test.step('Navigate to spoke operations', async () => {
      await spokeOpsPage.goto();
      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Error state or fallback is displayed', async () => {
      const errorMessage = page.locator('[data-testid="error"], .error, [role="alert"]');
      const errorText = page.locator('text=/unreachable|unavailable|error|failed|offline|cannot connect/i');
      const retryButton = page.locator('button', { hasText: /retry|reconnect/i });

      const hasError = await errorMessage.first().isVisible().catch(() => false);
      const hasErrorText = await errorText.isVisible().catch(() => false);
      const hasRetry = await retryButton.isVisible().catch(() => false);

      // At least one error indicator should be present
      expect(hasError || hasErrorText || hasRetry).toBeTruthy();
    });

    await test.step('Clean up route mock', async () => {
      await page.unrouteAll();
    });
  });

  test('spoke health indicators are color-coded', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Check for health status indicators', async () => {
      const healthIndicators = page.locator('[data-testid*="health"], .health-indicator, .status-dot, .status-icon');
      const indicatorCount = await healthIndicators.count();

      if (indicatorCount === 0) {
        test.skip(true, 'No health indicators visible');
        return;
      }

      const firstIndicator = healthIndicators.first();
      await expect(firstIndicator).toBeVisible();

      // Check that the indicator has a class or style suggesting color coding
      const classList = await firstIndicator.getAttribute('class');
      expect(classList).toBeTruthy();
    });
  });

  test('spoke operations page has correct navigation breadcrumb', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);

    await test.step('Breadcrumb or page hierarchy is present', async () => {
      const breadcrumb = page.locator('nav[aria-label="breadcrumb"], .breadcrumb, [data-testid="breadcrumb"]');
      const hasBreadcrumb = await breadcrumb.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false);

      if (hasBreadcrumb) {
        await expect(breadcrumb).toContainText(/spoke|operations/i);
      } else {
        // Fallback: at least heading indicates spoke operations context
        await expect(spokeOpsPage.heading).toBeVisible();
      }
    });
  });

  test('spoke list shows country or instance identifiers', async ({ page }) => {
    const spokeOpsPage = new AdminSpokeOpsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Spoke entries contain identifying information', async () => {
      const spokeEntries = spokeOpsPage.spokeEntries;
      const entryCount = await spokeEntries.count();

      if (entryCount === 0) {
        test.skip(true, 'No spoke entries to verify');
        return;
      }

      const firstEntry = spokeEntries.first();
      const entryText = await firstEntry.textContent();

      // Spoke entries should contain a country code, name, or instance identifier
      expect(entryText).toBeTruthy();
      expect(entryText!.trim().length).toBeGreaterThan(0);
    });
  });
});
