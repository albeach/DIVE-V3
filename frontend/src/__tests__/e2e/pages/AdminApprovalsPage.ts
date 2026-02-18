import { Page, Locator, expect } from '@playwright/test';
import { TEST_CONFIG } from '../fixtures/test-config';

export class AdminApprovalsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly pendingList: Locator;
  readonly approvalCard: Locator;
  readonly approveButton: Locator;
  readonly rejectButton: Locator;
  readonly rejectReasonInput: Locator;
  readonly rejectConfirmButton: Locator;
  readonly emptyState: Locator;
  readonly statusBadge: Locator;
  readonly notificationToast: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page
      .getByRole('heading', { name: /approvals/i })
      .or(page.getByRole('heading', { name: /pending requests/i }));
    this.pendingList = page
      .getByRole('list', { name: /pending/i })
      .or(page.locator('[data-testid="pending-list"]'));
    this.approvalCard = page
      .getByRole('listitem')
      .or(page.locator('[data-testid="approval-card"]'));
    this.approveButton = page
      .getByRole('button', { name: /approve/i })
      .or(page.locator('[data-testid="approve-button"]'));
    this.rejectButton = page
      .getByRole('button', { name: /reject/i })
      .or(page.locator('[data-testid="reject-button"]'));
    this.rejectReasonInput = page
      .getByRole('textbox', { name: /reason/i })
      .or(page.locator('[data-testid="reject-reason-input"]'));
    this.rejectConfirmButton = page
      .getByRole('button', { name: /confirm rejection/i })
      .or(page.getByRole('button', { name: /confirm reject/i }))
      .or(page.locator('[data-testid="reject-confirm-button"]'));
    this.emptyState = page
      .getByText(/no pending/i)
      .or(page.locator('[data-testid="empty-state"]'));
    this.statusBadge = page
      .getByRole('status')
      .or(page.locator('[data-testid="status-badge"]'));
    this.notificationToast = page
      .getByRole('alert')
      .or(page.locator('[data-testid="notification-toast"]'));
  }

  async goto() {
    await this.page.goto('/admin/approvals', {
      timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
    });
    await this.page.waitForLoadState('domcontentloaded');
  }

  async verifyLoaded() {
    await expect(this.heading).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async getPendingCount(): Promise<number> {
    await this.pendingList.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const cards = this.approvalCard;
    return await cards.count();
  }

  async approveRequest(alias: string) {
    const card = this.page
      .getByRole('listitem')
      .filter({ hasText: alias })
      .or(
        this.page
          .locator('[data-testid="approval-card"]')
          .filter({ hasText: alias })
      );
    await card.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const approve = card
      .getByRole('button', { name: /approve/i })
      .or(card.locator('[data-testid="approve-button"]'));
    await approve.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
  }

  async rejectRequest(alias: string, reason: string) {
    const card = this.page
      .getByRole('listitem')
      .filter({ hasText: alias })
      .or(
        this.page
          .locator('[data-testid="approval-card"]')
          .filter({ hasText: alias })
      );
    await card.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const reject = card
      .getByRole('button', { name: /reject/i })
      .or(card.locator('[data-testid="reject-button"]'));
    await reject.click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    await this.rejectReasonInput.waitFor({
      state: 'visible',
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    await this.rejectReasonInput.fill(reason);
    await this.rejectConfirmButton.click({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async verifyEmptyState() {
    await expect(this.emptyState).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async verifyApprovalStatus(alias: string, status: string) {
    const card = this.page
      .getByRole('listitem')
      .filter({ hasText: alias })
      .or(
        this.page
          .locator('[data-testid="approval-card"]')
          .filter({ hasText: alias })
      );
    const badge = card
      .getByRole('status')
      .or(card.locator('[data-testid="status-badge"]'));
    await expect(badge).toContainText(status, {
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }

  async verifyNotificationShown(message: string) {
    const toast = this.page
      .getByRole('alert')
      .filter({ hasText: message })
      .or(
        this.page
          .locator('[data-testid="notification-toast"]')
          .filter({ hasText: message })
      );
    await expect(toast).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  }
}
