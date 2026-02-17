import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminFederationPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly spokeList: Locator;
  readonly spokeStatusCard: Locator;
  readonly opalDashboard: Locator;
  readonly opalClientList: Locator;
  readonly driftEventList: Locator;
  readonly driftResolveButton: Locator;
  readonly auditLogTable: Locator;
  readonly auditLogFilter: Locator;
  readonly statsCharts: Locator;
  readonly policyList: Locator;
  readonly policyPushButton: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page
      .getByRole('heading', { name: /federation/i })
      .or(page.getByRole('heading', { name: /federation management/i }))
      .or(page.locator('h1:has-text("Federation")'));

    // Spokes
    this.spokeList = page
      .locator('[data-testid="spoke-list"]')
      .or(page.getByRole('list', { name: /spokes/i }))
      .or(page.locator('.spoke-list'));

    this.spokeStatusCard = page
      .locator('[data-testid="spoke-status-card"]')
      .or(page.locator('.spoke-status-card'))
      .or(page.getByRole('article'));

    // OPAL
    this.opalDashboard = page
      .locator('[data-testid="opal-dashboard"]')
      .or(page.locator('.opal-dashboard'))
      .or(page.getByRole('region', { name: /opal/i }));

    this.opalClientList = page
      .locator('[data-testid="opal-client-list"]')
      .or(page.getByRole('list', { name: /opal.*clients/i }))
      .or(page.locator('.opal-client-list'));

    // Drift
    this.driftEventList = page
      .locator('[data-testid="drift-event-list"]')
      .or(page.getByRole('list', { name: /drift.*events/i }))
      .or(page.locator('.drift-event-list'));

    this.driftResolveButton = page
      .getByRole('button', { name: /resolve/i })
      .or(page.locator('[data-testid="drift-resolve-button"]'));

    // Audit
    this.auditLogTable = page
      .getByRole('table', { name: /audit/i })
      .or(page.locator('[data-testid="audit-log-table"]'))
      .or(page.locator('table.audit-log'));

    this.auditLogFilter = page
      .getByRole('combobox', { name: /filter/i })
      .or(page.getByLabel(/filter.*audit/i))
      .or(page.locator('[data-testid="audit-log-filter"]'));

    // Statistics
    this.statsCharts = page
      .locator('[data-testid="stats-charts"]')
      .or(page.locator('.stats-charts'))
      .or(page.getByRole('region', { name: /statistics/i }));

    // Policies
    this.policyList = page
      .locator('[data-testid="policy-list"]')
      .or(page.getByRole('list', { name: /policies/i }))
      .or(page.locator('.policy-list'));

    this.policyPushButton = page
      .getByRole('button', { name: /push.*policy/i })
      .or(page.getByRole('button', { name: /deploy.*policy/i }))
      .or(page.locator('[data-testid="policy-push-button"]'));
  }

  async goto(
    subRoute:
      | 'spokes'
      | 'opal'
      | 'drift'
      | 'audit'
      | 'statistics'
      | 'policies' = 'spokes'
  ) {
    await this.page.goto(`/admin/federation/${subRoute}`, {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async getSpokeStatus(spokeId: string): Promise<string> {
    const spokeCard = this.page
      .locator(`[data-testid="spoke-status-${spokeId}"]`)
      .or(this.spokeStatusCard.filter({ hasText: new RegExp(spokeId, 'i') }))
      .or(this.spokeList.locator(`[data-spoke-id="${spokeId}"]`));

    await expect(spokeCard.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const statusBadge = spokeCard
      .first()
      .locator('[data-testid="spoke-status-badge"]')
      .or(spokeCard.first().locator('.status-badge'))
      .or(spokeCard.first().getByRole('status'));

    return (await statusBadge.textContent()) ?? '';
  }

  async getOpalClientCount(): Promise<number> {
    await expect(this.opalClientList.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const clients = this.opalClientList
      .getByRole('listitem')
      .or(this.opalClientList.locator('[data-testid="opal-client-item"]'))
      .or(this.opalClientList.locator('.opal-client-item'));

    return await clients.count();
  }

  async resolveDriftEvent(eventId: string) {
    const eventItem = this.page
      .locator(`[data-testid="drift-event-${eventId}"]`)
      .or(this.driftEventList.locator(`[data-event-id="${eventId}"]`))
      .or(
        this.driftEventList
          .getByRole('listitem')
          .filter({ hasText: new RegExp(eventId, 'i') })
      );

    await expect(eventItem.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const resolveButton = eventItem
      .first()
      .getByRole('button', { name: /resolve/i })
      .or(eventItem.first().locator('[data-testid="resolve-button"]'));

    await resolveButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    // Confirm resolution in dialog
    const confirmButton = this.page
      .getByRole('button', { name: /confirm/i })
      .or(this.page.getByRole('button', { name: /yes/i }))
      .or(this.page.locator('[data-testid="confirm-resolve"]'));

    await confirmButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }

  async filterAuditLog(filter: string) {
    await this.auditLogFilter.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    await this.page
      .getByRole('option', { name: new RegExp(filter, 'i') })
      .or(this.page.locator(`[data-value="${filter}"]`))
      .click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    await this.page.waitForLoadState('networkidle');
  }

  async verifyStatsLoaded() {
    await expect(this.statsCharts.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    // Verify at least one chart or data element is rendered
    const chartContent = this.statsCharts
      .first()
      .locator('canvas')
      .or(this.statsCharts.first().locator('svg'))
      .or(this.statsCharts.first().locator('[data-testid="chart"]'));

    await expect(chartContent.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async pushPolicy() {
    await expect(this.policyPushButton).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    await this.policyPushButton.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    // Confirm policy push in dialog
    const confirmButton = this.page
      .getByRole('button', { name: /confirm/i })
      .or(this.page.getByRole('button', { name: /yes.*push/i }))
      .or(this.page.locator('[data-testid="confirm-push"]'));

    await confirmButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }
}
