/**
 * Admin Federation E2E Tests
 *
 * Tests the federation management admin interface with 6 sub-routes:
 * - Spokes: spoke list with status cards
 * - OPAL: dashboard with client list
 * - Drift: drift detection events and resolution
 * - Audit: audit log with filtering
 * - Statistics: charts and analytics
 * - Policies: policy list and push workflow
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminFederationPage } from '../pages/AdminFederationPage';

test.describe('Admin Federation Management', () => {
  // Use saved admin session if available (from auth-setup.ts)
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  // ---------------------------------------------------------------------------
  // Spokes Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('Spokes', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('spokes');
    });

    test('should render the federation heading', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await fedPage.verifyLoaded();
    });

    test('should display spoke list', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.spokeList.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should display spoke status cards', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const cards = fedPage.spokeStatusCard;
      const count = await cards.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display spoke status card with status badge', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const firstCard = fedPage.spokeStatusCard.first();
      await expect(firstCard).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });

      // Status badge should be present on the card
      const statusBadge = firstCard
        .locator('[data-testid="spoke-status-badge"]')
        .or(firstCard.locator('.status-badge'))
        .or(firstCard.getByRole('status'));
      await expect(statusBadge.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should display federation health indicator', async ({ page }) => {
      const healthIndicator = page
        .locator('[data-testid="federation-health"]')
        .or(page.getByText(/health/i).first())
        .or(page.getByRole('status'));
      await expect(healthIndicator.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // OPAL Dashboard Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('OPAL Dashboard', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('opal');
    });

    test('should render the OPAL dashboard', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.opalDashboard.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should display OPAL client list', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.opalClientList.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should have at least one OPAL client', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const clientCount = await fedPage.getOpalClientCount();
      expect(clientCount).toBeGreaterThanOrEqual(1);
    });

    test('should display client items with content', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const clientItems = fedPage.opalClientList
        .getByRole('listitem')
        .or(fedPage.opalClientList.locator('[data-testid="opal-client-item"]'))
        .or(fedPage.opalClientList.locator('.opal-client-item'));

      const firstItem = clientItems.first();
      await expect(firstItem).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
      const text = await firstItem.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Drift Detection Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('Drift Detection', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('drift');
    });

    test('should render the drift detection page', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await fedPage.verifyLoaded();
    });

    test('should display drift event list', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      // Drift events may or may not be present, but the container should exist
      const driftContainer = fedPage.driftEventList
        .or(page.getByText(/no drift events/i))
        .or(page.locator('[data-testid="drift-empty-state"]'));
      await expect(driftContainer.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should show drift events when present', async ({ page }) => {
      await test.step('Mock drift events API', async () => {
        await page.route('**/api/admin/federation/drift**', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([
                {
                  id: 'drift-001',
                  spokeId: 'FRA',
                  type: 'policy_mismatch',
                  detectedAt: new Date().toISOString(),
                  severity: 'warning',
                  description: 'Policy version mismatch on FRA spoke',
                  resolved: false,
                },
                {
                  id: 'drift-002',
                  spokeId: 'DEU',
                  type: 'config_drift',
                  detectedAt: new Date(Date.now() - 3600000).toISOString(),
                  severity: 'info',
                  description: 'Configuration drift detected on DEU spoke',
                  resolved: false,
                },
              ]),
            });
          } else {
            await route.continue();
          }
        });
      });

      await test.step('Reload with mocked data', async () => {
        const fedPage = new AdminFederationPage(page);
        await fedPage.goto('drift');
      });

      await test.step('Verify drift events are displayed', async () => {
        const fedPage = new AdminFederationPage(page);
        const items = fedPage.driftEventList
          .getByRole('listitem')
          .or(fedPage.driftEventList.locator('[data-event-id]'));
        const count = await items.count();
        expect(count).toBeGreaterThanOrEqual(1);
      });
    });

    test('should resolve a drift event', async ({ page }) => {
      await test.step('Mock drift events and resolve API', async () => {
        await page.route('**/api/admin/federation/drift**', async (route) => {
          if (route.request().method() === 'GET') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify([
                {
                  id: 'drift-001',
                  spokeId: 'FRA',
                  type: 'policy_mismatch',
                  detectedAt: new Date().toISOString(),
                  severity: 'warning',
                  description: 'Policy version mismatch',
                  resolved: false,
                },
              ]),
            });
          } else {
            await route.continue();
          }
        });

        await page.route('**/api/admin/federation/drift/*/resolve', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'Drift event resolved' }),
          });
        });
      });

      await test.step('Reload with mocked data', async () => {
        const fedPage = new AdminFederationPage(page);
        await fedPage.goto('drift');
      });

      await test.step('Click resolve on the drift event', async () => {
        const fedPage = new AdminFederationPage(page);
        await fedPage.resolveDriftEvent('drift-001');
      });

      await test.step('Verify success notification', async () => {
        const toast = page
          .locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST)
          .or(page.getByText(/resolved|success/i));
        await expect(toast.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Audit Log Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('Audit Log', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('audit');
    });

    test('should render the audit log table', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.auditLogTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should display audit log entries', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const rows = fedPage.auditLogTable
        .getByRole('row')
        .or(fedPage.auditLogTable.locator('tr'));
      const count = await rows.count();
      // Header + at least 1 entry
      expect(count).toBeGreaterThanOrEqual(2);
    });

    test('should display audit log filter', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.auditLogFilter.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should filter audit log by spoke events', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Apply spoke filter', async () => {
        await fedPage.filterAuditLog('spoke');
      });

      await test.step('Verify table is still visible with filtered results', async () => {
        await expect(fedPage.auditLogTable.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should filter audit log by policy events', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Apply policy filter', async () => {
        await fedPage.filterAuditLog('policy');
      });

      await test.step('Verify table is still visible with filtered results', async () => {
        await expect(fedPage.auditLogTable.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should display audit entry details', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const firstDataRow = fedPage.auditLogTable
        .getByRole('row').nth(1)
        .or(fedPage.auditLogTable.locator('tr').nth(1));

      await expect(firstDataRow).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });

      const rowText = await firstDataRow.textContent();
      expect(rowText).toBeTruthy();
      expect(rowText!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Statistics Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('Statistics', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('statistics');
    });

    test('should render the statistics page', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await fedPage.verifyLoaded();
    });

    test('should display statistics charts', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await fedPage.verifyStatsLoaded();
    });

    test('should display at least one chart element', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const chartElements = fedPage.statsCharts
        .first()
        .locator('canvas')
        .or(fedPage.statsCharts.first().locator('svg'))
        .or(fedPage.statsCharts.first().locator('[data-testid="chart"]'));

      const count = await chartElements.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display stats summary values', async ({ page }) => {
      const statsRegion = page
        .locator('[data-testid="stats-charts"]')
        .or(page.locator('.stats-charts'))
        .or(page.getByRole('region', { name: /statistics/i }));

      await expect(statsRegion.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });

      const text = await statsRegion.first().textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Policies Sub-Route
  // ---------------------------------------------------------------------------

  test.describe('Policies', () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!hasAuthState('ADMIN'), 'Admin auth state not available');
      const fedPage = new AdminFederationPage(page);
      await fedPage.goto('policies');
    });

    test('should render the policy list', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.policyList.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should display policy items', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const items = fedPage.policyList
        .getByRole('listitem')
        .or(fedPage.policyList.locator('[data-testid="policy-item"]'))
        .or(fedPage.policyList.locator('.policy-item'));

      const count = await items.count();
      expect(count).toBeGreaterThanOrEqual(1);
    });

    test('should display push policy button', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      await expect(fedPage.policyPushButton.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    test('should initiate push policy flow with confirmation dialog', async ({ page }) => {
      await test.step('Intercept policy push API', async () => {
        await page.route('**/api/admin/federation/policies/push**', async (route) => {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ success: true, message: 'Policy pushed to all spokes' }),
          });
        });
      });

      await test.step('Click push policy button', async () => {
        const fedPage = new AdminFederationPage(page);
        await fedPage.policyPushButton.first().click({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });

      await test.step('Verify confirmation dialog appears', async () => {
        const confirmDialog = page
          .getByRole('dialog')
          .or(page.getByRole('alertdialog'))
          .or(page.locator('[data-testid="confirm-push"]'));
        await expect(confirmDialog.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });

      await test.step('Confirm push', async () => {
        const confirmButton = page
          .getByRole('button', { name: /confirm/i })
          .or(page.getByRole('button', { name: /yes.*push/i }))
          .or(page.locator('[data-testid="confirm-push"]'));
        await confirmButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
        await page.waitForLoadState('networkidle');
      });

      await test.step('Verify success notification', async () => {
        const toast = page
          .locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST)
          .or(page.getByText(/pushed|success/i));
        await expect(toast.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should display policy content when clicking a policy item', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const firstItem = fedPage.policyList
        .getByRole('listitem').first()
        .or(fedPage.policyList.locator('[data-testid="policy-item"]').first())
        .or(fedPage.policyList.locator('.policy-item').first());

      await firstItem.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

      await test.step('Verify policy detail or expanded content', async () => {
        const policyDetail = page
          .getByRole('dialog')
          .or(page.locator('[data-testid="policy-detail"]'))
          .or(page.locator('.policy-detail'));
        await expect(policyDetail.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Navigation Between Sub-Routes
  // ---------------------------------------------------------------------------

  test.describe('Sub-Route Navigation', () => {
    test('should navigate from spokes to OPAL dashboard', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Start on spokes page', async () => {
        await fedPage.goto('spokes');
        await fedPage.verifyLoaded();
      });

      await test.step('Navigate to OPAL', async () => {
        await fedPage.goto('opal');
        await expect(fedPage.opalDashboard.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should navigate from OPAL to drift detection', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Start on OPAL page', async () => {
        await fedPage.goto('opal');
      });

      await test.step('Navigate to drift detection', async () => {
        await fedPage.goto('drift');
        await fedPage.verifyLoaded();
      });
    });

    test('should navigate from drift to audit log', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Start on drift page', async () => {
        await fedPage.goto('drift');
      });

      await test.step('Navigate to audit', async () => {
        await fedPage.goto('audit');
        await expect(fedPage.auditLogTable.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should navigate from audit to statistics', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Start on audit page', async () => {
        await fedPage.goto('audit');
      });

      await test.step('Navigate to statistics', async () => {
        await fedPage.goto('statistics');
        await fedPage.verifyStatsLoaded();
      });
    });

    test('should navigate from statistics to policies', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);

      await test.step('Start on statistics page', async () => {
        await fedPage.goto('statistics');
      });

      await test.step('Navigate to policies', async () => {
        await fedPage.goto('policies');
        await expect(fedPage.policyList.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      });
    });

    test('should navigate through all 6 sub-routes sequentially', async ({ page }) => {
      const fedPage = new AdminFederationPage(page);
      const subRoutes: Array<'spokes' | 'opal' | 'drift' | 'audit' | 'statistics' | 'policies'> = [
        'spokes',
        'opal',
        'drift',
        'audit',
        'statistics',
        'policies',
      ];

      for (const route of subRoutes) {
        await test.step(`Navigate to ${route}`, async () => {
          await fedPage.goto(route);
          await fedPage.verifyLoaded();
        });
      }
    });
  });
});
