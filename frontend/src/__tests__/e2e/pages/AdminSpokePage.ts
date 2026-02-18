import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminSpokePage {
  readonly page: Page;
  readonly heading: Locator;
  readonly maintenanceToggle: Locator;
  readonly maintenanceStatus: Locator;
  readonly failoverEventLog: Locator;
  readonly failoverEntry: Locator;
  readonly auditQueueStatus: Locator;
  readonly policySyncStatus: Locator;
  readonly spokeStatusCard: Locator;
  readonly spokeEntries: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole('heading', { name: /spoke/i })
      .or(page.getByRole('heading', { name: /spoke.*dashboard/i }))
      .or(page.getByRole('heading', { name: /spoke management/i }));
    this.maintenanceToggle = page
      .getByRole('switch', { name: /maintenance/i })
      .or(page.getByRole('checkbox', { name: /maintenance/i }))
      .or(page.locator('[data-testid="maintenance-toggle"]'));
    this.maintenanceStatus = page
      .getByText(/maintenance mode/i)
      .or(page.locator('[data-testid="maintenance-status"]'));
    this.failoverEventLog = page
      .getByRole('list', { name: /failover/i })
      .or(page.getByRole('log'))
      .or(page.locator('[data-testid="failover-event-log"]'));
    this.failoverEntry = page
      .getByRole('listitem')
      .or(page.locator('[data-testid="failover-entry"]'));
    this.auditQueueStatus = page
      .getByText(/audit queue/i)
      .or(page.locator('[data-testid="audit-queue-status"]'));
    this.policySyncStatus = page
      .getByText(/policy sync/i)
      .or(page.locator('[data-testid="policy-sync-status"]'));
    this.spokeStatusCard = page
      .getByRole('region', { name: /spoke status/i })
      .or(page.locator('[data-testid="spoke-status-card"]'));
    this.spokeEntries = page
      .locator('[data-testid="spoke-entry"]')
      .or(page.locator('[data-testid="spoke-status-card"]'))
      .or(page.locator('.spoke-card'));
  }

  async goto(subRoute?: string) {
    const path = subRoute ? `/admin/spoke/${subRoute}` : '/admin/spoke';
    await this.page.goto(path, {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async toggleMaintenanceMode() {
    await this.maintenanceToggle.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.maintenanceToggle.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getMaintenanceStatus(): Promise<string> {
    await this.maintenanceStatus.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return (await this.maintenanceStatus.textContent()) ?? '';
  }

  async getFailoverEvents(): Promise<number> {
    await this.goto('failover');
    await this.failoverEventLog.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return await this.failoverEntry.count();
  }

  async getAuditQueueDepth(): Promise<string> {
    await this.goto('audit');
    await this.auditQueueStatus.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return (await this.auditQueueStatus.textContent()) ?? '';
  }

  async getPolicySyncStatus(): Promise<string> {
    await this.policySyncStatus.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return (await this.policySyncStatus.textContent()) ?? '';
  }

  async verifyMaintenanceModeActive() {
    await this.maintenanceStatus.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const status = await this.getMaintenanceStatus();
    expect(status.toLowerCase()).toMatch(/active|enabled|on/i);
  }

  async verifyMaintenanceModeInactive() {
    await this.maintenanceStatus.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const status = await this.getMaintenanceStatus();
    expect(status.toLowerCase()).toMatch(/inactive|disabled|off/i);
  }

  async navigateToMaintenance() {
    await this.goto('maintenance');
  }

  async navigateToFailover() {
    await this.goto('failover');
  }

  async navigateToAudit() {
    await this.goto('audit');
  }
}

// Re-export as AdminSpokeOpsPage for backward compatibility
export { AdminSpokePage as AdminSpokeOpsPage };
