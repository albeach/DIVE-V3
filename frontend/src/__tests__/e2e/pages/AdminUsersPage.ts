import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminUsersPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly userTable: Locator;
  readonly searchInput: Locator;
  readonly roleFilter: Locator;
  readonly userRow: Locator;
  readonly provisionButton: Locator;
  readonly userDetailModal: Locator;
  readonly resetPasswordButton: Locator;
  readonly assignRoleButton: Locator;
  readonly paginationControls: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    this.page = page;

    this.heading = page
      .getByRole('heading', { name: /users/i })
      .or(page.getByRole('heading', { name: /user management/i }))
      .or(page.locator('h1:has-text("Users")'));

    this.userTable = page
      .getByRole('table', { name: /users/i })
      .or(page.locator('[data-testid="user-table"]'))
      .or(page.locator('table.user-table'));

    this.searchInput = page
      .getByRole('searchbox', { name: /search users/i })
      .or(page.getByPlaceholder(/search/i))
      .or(page.locator('[data-testid="user-search"]'));

    this.roleFilter = page
      .getByRole('combobox', { name: /role/i })
      .or(page.getByLabel(/filter.*role/i))
      .or(page.locator('[data-testid="role-filter"]'));

    this.userRow = page
      .getByRole('row')
      .or(page.locator('[data-testid="user-row"]'));

    this.provisionButton = page
      .getByRole('button', { name: /provision/i })
      .or(page.getByRole('link', { name: /provision/i }))
      .or(page.locator('[data-testid="provision-button"]'));

    this.userDetailModal = page
      .getByRole('dialog', { name: /user detail/i })
      .or(page.getByRole('dialog'))
      .or(page.locator('[data-testid="user-detail-modal"]'));

    this.resetPasswordButton = page
      .getByRole('button', { name: /reset password/i })
      .or(page.locator('[data-testid="reset-password-button"]'));

    this.assignRoleButton = page
      .getByRole('button', { name: /assign role/i })
      .or(page.locator('[data-testid="assign-role-button"]'));

    this.paginationControls = page
      .getByRole('navigation', { name: /pagination/i })
      .or(page.locator('[data-testid="pagination"]'))
      .or(page.locator('.pagination'));

    this.emptyState = page
      .getByText(/no users found/i)
      .or(page.locator('[data-testid="empty-state"]'))
      .or(page.locator('.empty-state'));
  }

  async goto() {
    await this.page.goto('/admin/users', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async gotoProvision() {
    await this.page.goto('/admin/users/provision', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async searchUsers(query: string) {
    await this.searchInput.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.searchInput.fill(query);
    await this.page.waitForLoadState('networkidle');
  }

  async filterByRole(role: string) {
    await this.roleFilter.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page
      .getByRole('option', { name: new RegExp(role, 'i') })
      .or(this.page.locator(`[data-value="${role}"]`))
      .click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.page.waitForLoadState('networkidle');
  }

  async selectUser(index: number) {
    const rows = this.userTable
      .getByRole('row')
      .or(this.userTable.locator('tr'));
    // Skip header row by adding 1 to the index
    await rows.nth(index + 1).click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await expect(this.userDetailModal).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async resetPassword(userId: string) {
    const userRow = this.page
      .getByRole('row', { name: new RegExp(userId, 'i') })
      .or(this.page.locator(`[data-user-id="${userId}"]`));
    await userRow.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await expect(this.userDetailModal).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.resetPasswordButton.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.page.waitForLoadState('networkidle');
  }

  async verifyUserCount(expected: number) {
    const rows = this.userTable
      .getByRole('row')
      .or(this.userTable.locator('tr'));
    // Subtract 1 for the header row
    await expect(rows).toHaveCount(expected + 1, {
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async verifyUserInList(username: string) {
    const userCell = this.userTable
      .getByRole('cell', { name: new RegExp(username, 'i') })
      .or(this.userTable.getByText(username));
    await expect(userCell.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }
}
