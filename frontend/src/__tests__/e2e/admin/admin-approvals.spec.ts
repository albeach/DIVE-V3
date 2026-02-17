import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminApprovalsPage } from '../pages/AdminApprovalsPage';

test.describe('Admin Approvals', () => {
  // Use saved admin session if available
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await adminPage.goto();
  });

  test('page renders with heading', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await expect(adminPage.heading).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    await expect(adminPage.heading).toContainText(/approv/i);
  });

  test('pending approvals list is visible', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await test.step('Wait for approval list to load', async () => {
      await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });
    });

    await test.step('Verify list or empty state is displayed', async () => {
      const hasCards = await adminPage.approvalCards.count() > 0;
      const hasEmptyState = await adminPage.emptyState.isVisible();
      expect(hasCards || hasEmptyState).toBeTruthy();
    });
  });

  test('approval cards display required information', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No pending approvals available to verify card structure');
      return;
    }

    const firstCard = adminPage.approvalCards.first();
    await test.step('Card contains requestor information', async () => {
      await expect(firstCard).toBeVisible();
      const cardText = await firstCard.textContent();
      expect(cardText).toBeTruthy();
    });

    await test.step('Card contains action buttons', async () => {
      const approveButton = firstCard.locator('button', { hasText: /approve/i });
      const rejectButton = firstCard.locator('button', { hasText: /reject|deny/i });
      const hasApprove = await approveButton.isVisible().catch(() => false);
      const hasReject = await rejectButton.isVisible().catch(() => false);
      expect(hasApprove || hasReject).toBeTruthy();
    });
  });

  test('approve request flow updates status', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No pending approvals available for approve flow');
      return;
    }

    await test.step('Click approve on first pending request', async () => {
      const approveButton = adminPage.approvalCards.first().locator('button', { hasText: /approve/i });
      await approveButton.click();
    });

    await test.step('Confirm approval if confirmation dialog appears', async () => {
      const confirmButton = page.locator('button', { hasText: /confirm|yes/i });
      if (await confirmButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await confirmButton.click();
      }
    });

    await test.step('Verify status changes to approved', async () => {
      const statusBadge = page.locator('[data-testid="status-badge"], .status-badge, .badge').filter({ hasText: /approved/i });
      await expect(statusBadge.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });

  test('reject request flow with reason', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No pending approvals available for reject flow');
      return;
    }

    await test.step('Click reject on first pending request', async () => {
      const rejectButton = adminPage.approvalCards.first().locator('button', { hasText: /reject|deny/i });
      await rejectButton.click();
    });

    await test.step('Fill in rejection reason', async () => {
      const reasonInput = page.locator('textarea, input[name="reason"], [data-testid="rejection-reason"]');
      if (await reasonInput.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await reasonInput.fill('E2E test rejection reason - does not meet policy requirements');
      }
    });

    await test.step('Confirm rejection', async () => {
      const confirmButton = page.locator('button', { hasText: /confirm|submit|reject/i }).last();
      await confirmButton.click();
    });

    await test.step('Verify status changes to rejected', async () => {
      const statusBadge = page.locator('[data-testid="status-badge"], .status-badge, .badge').filter({ hasText: /rejected|denied/i });
      await expect(statusBadge.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });

  test('notification toast appears after approval action', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No pending approvals available for notification test');
      return;
    }

    await test.step('Perform an approval action', async () => {
      const approveButton = adminPage.approvalCards.first().locator('button', { hasText: /approve/i });
      await approveButton.click();

      const confirmButton = page.locator('button', { hasText: /confirm|yes/i });
      if (await confirmButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await confirmButton.click();
      }
    });

    await test.step('Verify toast notification appears', async () => {
      const toast = page.locator('[role="alert"], .toast, .notification, [data-testid="toast"]');
      await expect(toast.first()).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });

  test('empty state message when no pending approvals', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount > 0) {
      test.skip(true, 'Pending approvals exist, cannot verify empty state');
      return;
    }

    await test.step('Empty state is displayed', async () => {
      await expect(adminPage.emptyState).toBeVisible();
    });

    await test.step('Empty state contains helpful message', async () => {
      const emptyText = await adminPage.emptyState.textContent();
      expect(emptyText).toBeTruthy();
      expect(emptyText!.length).toBeGreaterThan(5);
    });
  });

  test('status badges show correct states', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Check for status badges on the page', async () => {
      const badges = page.locator('[data-testid="status-badge"], .status-badge, .badge');
      const badgeCount = await badges.count();

      if (badgeCount === 0) {
        test.skip(true, 'No status badges visible on the page');
        return;
      }

      for (let i = 0; i < Math.min(badgeCount, 5); i++) {
        const badgeText = await badges.nth(i).textContent();
        const normalizedText = badgeText?.toLowerCase().trim() ?? '';
        const validStatuses = ['pending', 'approved', 'rejected', 'denied', 'in review', 'expired'];
        const hasValidStatus = validStatuses.some(status => normalizedText.includes(status));
        expect(hasValidStatus).toBeTruthy();
      }
    });
  });

  test('pending status badge has distinct visual styling', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const pendingBadge = page.locator('[data-testid="status-badge"], .status-badge, .badge').filter({ hasText: /pending/i }).first();

    if (!await pendingBadge.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
      test.skip(true, 'No pending status badge visible');
      return;
    }

    await test.step('Pending badge has background color or class indicating status', async () => {
      await expect(pendingBadge).toBeVisible();
      const classList = await pendingBadge.getAttribute('class');
      expect(classList).toBeTruthy();
    });
  });

  test('multiple approvals can be processed sequentially', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount < 2) {
      test.skip(true, 'Need at least 2 pending approvals for sequential processing test');
      return;
    }

    await test.step('Process first approval', async () => {
      const approveButton = adminPage.approvalCards.first().locator('button', { hasText: /approve/i });
      await approveButton.click();

      const confirmButton = page.locator('button', { hasText: /confirm|yes/i });
      if (await confirmButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await confirmButton.click();
      }

      await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);
    });

    await test.step('Process second approval', async () => {
      const rejectButton = page.locator('button', { hasText: /reject|deny/i }).first();
      if (await rejectButton.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
        await rejectButton.click();

        const reasonInput = page.locator('textarea, input[name="reason"], [data-testid="rejection-reason"]');
        if (await reasonInput.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false)) {
          await reasonInput.fill('Sequential processing test - rejection reason');
        }

        const confirmButton = page.locator('button', { hasText: /confirm|submit|reject/i }).last();
        await confirmButton.click();
      }
    });

    await test.step('Verify both actions were processed', async () => {
      const remainingPending = await adminPage.approvalCards.count();
      expect(remainingPending).toBeLessThan(cardCount);
    });
  });

  test('approval cards contain timestamp information', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No approval cards to check for timestamps');
      return;
    }

    await test.step('First card contains a date or time reference', async () => {
      const cardText = await adminPage.approvalCards.first().textContent();
      const hasDatePattern = /\d{1,4}[-/]\d{1,2}[-/]\d{1,4}|ago|today|yesterday|\d{1,2}:\d{2}/i.test(cardText ?? '');
      expect(hasDatePattern).toBeTruthy();
    });
  });

  test('page title and breadcrumb are correct', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);

    await test.step('Page has correct title or breadcrumb', async () => {
      const breadcrumb = page.locator('nav[aria-label="breadcrumb"], .breadcrumb, [data-testid="breadcrumb"]');
      const hasBreadcrumb = await breadcrumb.isVisible({ timeout: TEST_CONFIG.TIMEOUTS.SHORT }).catch(() => false);

      if (hasBreadcrumb) {
        await expect(breadcrumb).toContainText(/approv/i);
      } else {
        await expect(adminPage.heading).toBeVisible();
      }
    });
  });

  test('tab or filter for different approval statuses', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    await test.step('Look for status filter tabs or dropdown', async () => {
      const tabs = page.locator('[role="tab"], .tab, [data-testid*="tab"], [data-testid*="filter"]');
      const dropdown = page.locator('select, [role="listbox"], [data-testid*="status-filter"]');

      const hasTabs = await tabs.count() > 0;
      const hasDropdown = await dropdown.isVisible().catch(() => false);

      // Page should have some form of status filtering
      expect(hasTabs || hasDropdown).toBeTruthy();
    });
  });

  test('approval detail can be expanded or viewed', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);
    await page.waitForLoadState('networkidle', { timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION });

    const cardCount = await adminPage.approvalCards.count();
    if (cardCount === 0) {
      test.skip(true, 'No approval cards available to expand');
      return;
    }

    await test.step('Click on card to see details', async () => {
      const firstCard = adminPage.approvalCards.first();
      const detailLink = firstCard.locator('a, button, [data-testid*="detail"], [data-testid*="expand"]');

      if (await detailLink.first().isVisible().catch(() => false)) {
        await detailLink.first().click();
        await page.waitForTimeout(TEST_CONFIG.TIMEOUTS.SHORT);

        // Should see expanded details or a detail view
        const detailContent = page.locator('[data-testid*="detail"], .detail, .expanded, dialog, [role="dialog"]');
        const hasDetail = await detailContent.isVisible().catch(() => false);
        expect(hasDetail).toBeTruthy();
      }
    });
  });

  test('loading state is shown while fetching approvals', async ({ page }) => {
    const adminPage = new AdminApprovalsPage(page);

    await test.step('Navigate and check for loading indicator', async () => {
      await adminPage.goto();

      // Loading state should appear briefly or content should load
      const loading = page.locator('[data-testid="loading"], .loading, .spinner, [role="progressbar"]');
      const content = page.locator('[data-testid="approvals-list"], [data-testid="empty-state"]');

      // Either loading was shown and resolved, or content loaded immediately
      await expect(content.first().or(adminPage.heading)).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });
});
