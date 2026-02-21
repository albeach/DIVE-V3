import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminLogsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly logTable: Locator;
  readonly logEntry: Locator;
  readonly levelFilter: Locator;
  readonly sourceFilter: Locator;
  readonly dateRangeStart: Locator;
  readonly dateRangeEnd: Locator;
  readonly searchInput: Locator;
  readonly exportButton: Locator;
  readonly retentionBadge: Locator;
  readonly violationsTab: Locator;
  readonly paginationControls: Locator;
  readonly refreshButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole('heading', { name: /logs/i })
      .or(page.getByRole('heading', { name: /audit log/i }));
    this.logTable = page
      .getByRole('table', { name: /logs/i })
      .or(page.getByRole('table'))
      .or(page.locator('[data-testid="log-table"]'));
    this.logEntry = page
      .getByRole('row')
      .or(page.locator('[data-testid="log-entry"]'));
    this.levelFilter = page
      .getByRole('combobox', { name: /level/i })
      .or(page.getByLabel(/level/i))
      .or(page.locator('[data-testid="level-filter"]'));
    this.sourceFilter = page
      .getByRole('combobox', { name: /source/i })
      .or(page.getByLabel(/source/i))
      .or(page.locator('[data-testid="source-filter"]'));
    this.dateRangeStart = page
      .getByRole('textbox', { name: /start date/i })
      .or(page.getByLabel(/start date/i))
      .or(page.locator('[data-testid="date-range-start"]'));
    this.dateRangeEnd = page
      .getByRole('textbox', { name: /end date/i })
      .or(page.getByLabel(/end date/i))
      .or(page.locator('[data-testid="date-range-end"]'));
    this.searchInput = page
      .getByRole('searchbox')
      .or(page.getByPlaceholder(/search/i))
      .or(page.locator('[data-testid="search-input"]'));
    this.exportButton = page
      .getByRole('button', { name: /export/i })
      .or(page.locator('[data-testid="export-button"]'));
    this.retentionBadge = page
      .getByText(/retention/i)
      .or(page.locator('[data-testid="retention-badge"]'));
    this.violationsTab = page
      .getByRole('tab', { name: /violations/i })
      .or(page.getByRole('button', { name: /violations/i }))
      .or(page.locator('[data-testid="violations-tab"]'));
    this.paginationControls = page
      .getByRole('navigation', { name: /pagination/i })
      .or(page.locator('[data-testid="pagination-controls"]'));
    this.refreshButton = page
      .getByRole('button', { name: /refresh/i })
      .or(page.locator('[data-testid="refresh-button"]'));
  }

  async goto() {
    await this.page.goto('/admin/logs', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async filterByLevel(level: string) {
    await this.levelFilter.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.levelFilter.selectOption({ label: level });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterBySource(source: string) {
    await this.sourceFilter.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.sourceFilter.selectOption({ label: source });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async filterByDateRange(start: string, end: string) {
    await this.dateRangeStart.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.dateRangeStart.fill(start);
    await this.dateRangeEnd.fill(end);
    await this.page.waitForLoadState('domcontentloaded');
  }

  async searchLogs(query: string) {
    await this.searchInput.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.searchInput.fill(query);
    await this.searchInput.press('Enter');
    await this.page.waitForLoadState('domcontentloaded');
  }

  async exportLogs() {
    const downloadPromise = this.page.waitForEvent('download', {
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.exportButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    return await downloadPromise;
  }

  async getLogCount(): Promise<number> {
    await this.logTable.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    // Subtract 1 to exclude the header row
    const rowCount = await this.logEntry.count();
    return Math.max(0, rowCount - 1);
  }

  async verifyLogEntry(expected: {
    level?: string;
    source?: string;
    message?: string;
  }) {
    const filters: string[] = [];
    if (expected.level) filters.push(expected.level);
    if (expected.source) filters.push(expected.source);
    if (expected.message) filters.push(expected.message);

    const matchingRow = this.page
      .getByRole('row')
      .filter({ hasText: new RegExp(filters.join('.*'), 'i') })
      .or(
        this.page
          .locator('[data-testid="log-entry"]')
          .filter({ hasText: new RegExp(filters.join('.*'), 'i') })
      );
    await expect(matchingRow.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async switchToViolations() {
    await this.violationsTab.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async getRetentionPolicy(): Promise<string> {
    await this.retentionBadge.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    return (await this.retentionBadge.textContent()) ?? '';
  }
}
