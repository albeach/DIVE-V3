import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminClearancePage {
  readonly page: Page;
  readonly heading: Locator;

  // Tab locators
  readonly overviewTab: Locator;
  readonly matrixTab: Locator;
  readonly editorTab: Locator;
  readonly testTab: Locator;
  readonly auditTab: Locator;

  // Overview tab locators
  readonly overviewStatsCards: Locator;

  // Matrix tab locators
  readonly matrixTable: Locator;
  readonly matrixCountryRow: Locator;

  // Editor tab locators
  readonly editorForm: Locator;
  readonly editorCountrySelect: Locator;
  readonly editorLevelInputs: Locator;

  // Test tab locators
  readonly testToolInput: Locator;
  readonly testToolResult: Locator;

  // Audit tab locators
  readonly auditLogTable: Locator;
  readonly auditLogEntry: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page
      .getByRole('heading', { name: /clearance/i })
      .or(page.getByRole('heading', { name: /clearance management/i }))
      .or(page.locator('h1:has-text("Clearance")'));

    // Tabs
    this.overviewTab = page
      .getByRole('tab', { name: /overview/i })
      .or(page.locator('[data-testid="tab-overview"]'))
      .or(page.getByText(/overview/i).locator('xpath=self::*[contains(@role,"tab") or contains(@class,"tab")]'));

    this.matrixTab = page
      .getByRole('tab', { name: /matrix/i })
      .or(page.locator('[data-testid="tab-matrix"]'))
      .or(page.getByText(/matrix/i).locator('xpath=self::*[contains(@role,"tab") or contains(@class,"tab")]'));

    this.editorTab = page
      .getByRole('tab', { name: /editor/i })
      .or(page.locator('[data-testid="tab-editor"]'))
      .or(page.getByText(/editor/i).locator('xpath=self::*[contains(@role,"tab") or contains(@class,"tab")]'));

    this.testTab = page
      .getByRole('tab', { name: /test/i })
      .or(page.locator('[data-testid="tab-test"]'))
      .or(page.getByText(/test/i).locator('xpath=self::*[contains(@role,"tab") or contains(@class,"tab")]'));

    this.auditTab = page
      .getByRole('tab', { name: /audit/i })
      .or(page.locator('[data-testid="tab-audit"]'))
      .or(page.getByText(/audit/i).locator('xpath=self::*[contains(@role,"tab") or contains(@class,"tab")]'));

    // Overview
    this.overviewStatsCards = page
      .locator('[data-testid="stats-card"]')
      .or(page.locator('.stats-card'))
      .or(page.getByRole('region', { name: /statistics/i }));

    // Matrix
    this.matrixTable = page
      .getByRole('table', { name: /matrix/i })
      .or(page.locator('[data-testid="clearance-matrix"]'))
      .or(page.locator('table.matrix-table'));

    this.matrixCountryRow = page
      .locator('[data-testid="matrix-country-row"]')
      .or(this.matrixTable.getByRole('row'));

    // Editor
    this.editorForm = page
      .getByRole('form', { name: /clearance editor/i })
      .or(page.locator('[data-testid="editor-form"]'))
      .or(page.locator('form.clearance-editor'));

    this.editorCountrySelect = page
      .getByRole('combobox', { name: /country/i })
      .or(page.getByLabel(/country/i))
      .or(page.locator('[data-testid="editor-country-select"]'));

    this.editorLevelInputs = page
      .locator('[data-testid="editor-level-input"]')
      .or(page.locator('.editor-level-input'))
      .or(page.getByRole('textbox', { name: /level/i }));

    // Test tool
    this.testToolInput = page
      .getByRole('textbox', { name: /test/i })
      .or(page.getByPlaceholder(/enter.*clearance/i))
      .or(page.locator('[data-testid="test-tool-input"]'));

    this.testToolResult = page
      .locator('[data-testid="test-tool-result"]')
      .or(page.locator('.test-result'))
      .or(page.getByRole('region', { name: /result/i }));

    // Audit log
    this.auditLogTable = page
      .getByRole('table', { name: /audit/i })
      .or(page.locator('[data-testid="audit-log-table"]'))
      .or(page.locator('table.audit-log'));

    this.auditLogEntry = page
      .locator('[data-testid="audit-log-entry"]')
      .or(this.auditLogTable.getByRole('row'));
  }

  async goto() {
    await this.page.goto('/admin/clearance-management', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async switchTab(
    tabName: 'overview' | 'matrix' | 'editor' | 'test' | 'audit'
  ) {
    const tabMap: Record<string, Locator> = {
      overview: this.overviewTab,
      matrix: this.matrixTab,
      editor: this.editorTab,
      test: this.testTab,
      audit: this.auditTab,
    };

    const tab = tabMap[tabName];
    await tab.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyTabActive(
    tabName: 'overview' | 'matrix' | 'editor' | 'test' | 'audit'
  ) {
    const tabMap: Record<string, Locator> = {
      overview: this.overviewTab,
      matrix: this.matrixTab,
      editor: this.editorTab,
      test: this.testTab,
      audit: this.auditTab,
    };

    const tab = tabMap[tabName];
    await expect(tab).toHaveAttribute('aria-selected', 'true', {
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async getStatsCardValue(cardName: string): Promise<string> {
    const card = this.page
      .locator(`[data-testid="stats-card-${cardName}"]`)
      .or(this.page.locator(`.stats-card:has-text("${cardName}")`))
      .or(
        this.overviewStatsCards.filter({
          hasText: new RegExp(cardName, 'i'),
        })
      );

    await expect(card.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const value = card
      .first()
      .locator('.stats-value')
      .or(card.first().locator('[data-testid="stats-value"]'))
      .or(card.first().getByRole('status'));

    return (await value.textContent()) ?? '';
  }

  async getMatrixCell(country: string, level: string): Promise<string> {
    const row = this.matrixTable
      .getByRole('row', { name: new RegExp(country, 'i') })
      .or(this.matrixTable.locator(`tr:has-text("${country}")`));

    await expect(row.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const cell = row
      .first()
      .locator(`[data-level="${level}"]`)
      .or(row.first().locator(`td:has-text("${level}")`));

    return (await cell.first().textContent()) ?? '';
  }

  async editMapping(country: string, level: string, value: string) {
    await this.switchTab('editor');

    await this.editorCountrySelect.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.page
      .getByRole('option', { name: new RegExp(country, 'i') })
      .or(this.page.locator(`[data-value="${country}"]`))
      .click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });

    const levelInput = this.page
      .locator(`[data-level="${level}"] input`)
      .or(this.page.getByLabel(new RegExp(level, 'i')))
      .or(this.page.locator(`[data-testid="level-input-${level}"]`));

    await levelInput.first().fill(value);

    const saveButton = this.page
      .getByRole('button', { name: /save/i })
      .or(this.page.locator('[data-testid="save-mapping"]'));

    await saveButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async testClearance(country: string, clearance: string) {
    await this.switchTab('test');

    const countryInput = this.page
      .getByRole('combobox', { name: /country/i })
      .or(this.page.getByLabel(/country/i))
      .or(this.page.locator('[data-testid="test-country-input"]'));

    await countryInput.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await countryInput.first().fill(country);

    await this.testToolInput.fill(clearance);

    const runButton = this.page
      .getByRole('button', { name: /test|run|evaluate/i })
      .or(this.page.locator('[data-testid="run-test"]'));

    await runButton.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await expect(this.testToolResult.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async verifyAuditEntry(expected: { action?: string; user?: string }) {
    await this.switchTab('audit');

    await expect(this.auditLogTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    if (expected.action) {
      const actionCell = this.auditLogTable
        .getByText(new RegExp(expected.action, 'i'))
        .first();
      await expect(actionCell).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    }

    if (expected.user) {
      const userCell = this.auditLogTable
        .getByText(new RegExp(expected.user, 'i'))
        .first();
      await expect(userCell).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    }
  }
}
