/**
 * Admin Users E2E Tests
 *
 * Tests the user management admin interface:
 * - Page rendering and table display
 * - Search and filter functionality
 * - User details modal
 * - Pagination
 * - Password reset flow
 * - Provision new user form
 * - Non-admin access denial
 * - Empty state handling
 * - User count validation
 */

import { test, expect } from '../fixtures/base-test';
import { AUTH_STATE, hasAuthState } from '../fixtures/base-test';
import { TEST_CONFIG } from '../fixtures/test-config';
import { AdminUsersPage } from '../pages/AdminUsersPage';
import { TEST_USERS } from '../fixtures/test-users';

test.describe('Admin Users', () => {
  // Use saved admin session if available (from auth-setup.ts)
  if (hasAuthState('ADMIN')) {
    test.use({ storageState: AUTH_STATE.ADMIN });
  }

  test.beforeEach(async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.goto();
  });

  // ---------------------------------------------------------------------------
  // Page Rendering
  // ---------------------------------------------------------------------------

  test('should render the page heading', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.verifyLoaded();
  });

  test('should render the user table', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display user rows in the table', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const rows = adminPage.userTable.getByRole('row').or(adminPage.userTable.locator('tr'));
    const count = await rows.count();
    // At least a header row + 1 data row
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should display search input', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.searchInput.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display role filter', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.roleFilter.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should display provision button', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.provisionButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  // ---------------------------------------------------------------------------
  // Search
  // ---------------------------------------------------------------------------

  test('should search users by username', async ({ page }) => {
    await test.step('Enter search query', async () => {
      const adminPage = new AdminUsersPage(page);
      await adminPage.searchUsers('testuser-usa');
    });

    await test.step('Verify filtered results contain the username', async () => {
      const adminPage = new AdminUsersPage(page);
      await adminPage.verifyUserInList('testuser-usa');
    });
  });

  test('should search users by partial username', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.searchUsers('testuser');

    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const rows = adminPage.userTable.getByRole('row').or(adminPage.userTable.locator('tr'));
    const count = await rows.count();
    // Header + at least 1 result
    expect(count).toBeGreaterThanOrEqual(2);
  });

  test('should show empty state for nonexistent username', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.searchUsers('zzz-nonexistent-user-99999');

    await expect(adminPage.emptyState.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should clear search and restore full user list', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Search for a specific user', async () => {
      await adminPage.searchUsers('testuser-usa-1');
    });

    await test.step('Clear the search field', async () => {
      await adminPage.searchInput.clear();
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify full list is restored', async () => {
      const rows = adminPage.userTable.getByRole('row').or(adminPage.userTable.locator('tr'));
      const count = await rows.count();
      expect(count).toBeGreaterThanOrEqual(2);
    });
  });

  // ---------------------------------------------------------------------------
  // Filter by Role
  // ---------------------------------------------------------------------------

  test('should filter users by admin role', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.filterByRole('admin');

    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should filter users by user role', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.filterByRole('user');

    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
    const rows = adminPage.userTable.getByRole('row').or(adminPage.userTable.locator('tr'));
    const count = await rows.count();
    // Header + at least 1 user
    expect(count).toBeGreaterThanOrEqual(2);
  });

  // ---------------------------------------------------------------------------
  // User Details
  // ---------------------------------------------------------------------------

  test('should open user detail modal on row click', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Click the first user row', async () => {
      await adminPage.selectUser(0);
    });

    await test.step('Verify modal is visible', async () => {
      await expect(adminPage.userDetailModal).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  test('should display user information in detail modal', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.selectUser(0);

    await test.step('Verify modal contains user data', async () => {
      const modalContent = adminPage.userDetailModal;
      // Modal should contain some identifiable user text (username, email, role)
      await expect(modalContent).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      const text = await modalContent.textContent();
      expect(text).toBeTruthy();
      expect(text!.length).toBeGreaterThan(0);
    });
  });

  test('should close user detail modal', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.selectUser(0);

    await test.step('Close the modal', async () => {
      const closeButton = page
        .getByRole('button', { name: /close/i })
        .or(page.locator('[data-testid="modal-close"]'))
        .or(page.locator('button[aria-label="Close"]'));
      await closeButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });

    await test.step('Verify modal is hidden', async () => {
      await expect(adminPage.userDetailModal).not.toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Pagination
  // ---------------------------------------------------------------------------

  test('should display pagination controls', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.paginationControls.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should navigate to next page and back', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Click next page', async () => {
      const nextButton = adminPage.paginationControls
        .getByRole('button', { name: /next/i })
        .or(adminPage.paginationControls.locator('[data-testid="next-page"]'))
        .or(adminPage.paginationControls.locator('button:has-text("Next")'));
      await nextButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify page changed', async () => {
      // Page should still have a table
      await expect(adminPage.userTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Click previous page', async () => {
      const prevButton = adminPage.paginationControls
        .getByRole('button', { name: /prev/i })
        .or(adminPage.paginationControls.locator('[data-testid="prev-page"]'))
        .or(adminPage.paginationControls.locator('button:has-text("Previous")'));
      await prevButton.first().click({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify returned to first page', async () => {
      await expect(adminPage.userTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Reset Password
  // ---------------------------------------------------------------------------

  test('should show reset password button in user detail', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.selectUser(0);

    await expect(adminPage.resetPasswordButton.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  test('should initiate reset password flow', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Open user detail modal', async () => {
      await adminPage.selectUser(0);
    });

    await test.step('Click reset password', async () => {
      await adminPage.resetPasswordButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify confirmation dialog or success toast', async () => {
      const confirmDialog = page
        .getByRole('dialog', { name: /reset.*password/i })
        .or(page.getByRole('alertdialog'))
        .or(page.locator('[data-testid="confirm-reset-password"]'));

      const toast = page.locator(TEST_CONFIG.SELECTORS.ADMIN_TOAST);

      // Either a confirmation dialog should appear, or a toast notification
      const dialogOrToast = confirmDialog.first().or(toast.first());
      await expect(dialogOrToast).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Provision New User
  // ---------------------------------------------------------------------------

  test('should navigate to provision user form', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Click provision button', async () => {
      await adminPage.provisionButton.first().click({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify provision form is displayed', async () => {
      // Should navigate to provision page or show a form
      const provisionForm = page
        .getByRole('form', { name: /provision/i })
        .or(page.locator('[data-testid="provision-form"]'))
        .or(page.getByRole('heading', { name: /provision/i }));

      await expect(provisionForm.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
    });
  });

  test('should display required fields in provision form', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await adminPage.gotoProvision();

    await test.step('Verify username field exists', async () => {
      const usernameField = page
        .getByLabel(/username/i)
        .or(page.locator('[data-testid="provision-username"]'));
      await expect(usernameField.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify email field exists', async () => {
      const emailField = page
        .getByLabel(/email/i)
        .or(page.locator('[data-testid="provision-email"]'));
      await expect(emailField.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });

    await test.step('Verify role selector exists', async () => {
      const roleSelect = page
        .getByRole('combobox', { name: /role/i })
        .or(page.getByLabel(/role/i))
        .or(page.locator('[data-testid="provision-role"]'));
      await expect(roleSelect.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });

  // ---------------------------------------------------------------------------
  // User Count Validation
  // ---------------------------------------------------------------------------

  test('should show user count in expected range', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);
    await expect(adminPage.userTable.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });

    const rows = adminPage.userTable.getByRole('row').or(adminPage.userTable.locator('tr'));
    const count = await rows.count();
    // Subtract header row; expect at least 1 user and no more than 500
    const dataRowCount = Math.max(0, count - 1);
    expect(dataRowCount).toBeGreaterThanOrEqual(1);
    expect(dataRowCount).toBeLessThanOrEqual(500);
  });

  test('should show admin sidebar navigation', async ({ page }) => {
    const sidebar = page.locator(TEST_CONFIG.SELECTORS.ADMIN_SIDEBAR);
    await expect(sidebar.first()).toBeVisible({
      timeout: TEST_CONFIG.TIMEOUTS.ACTION,
    });
  });

  // ---------------------------------------------------------------------------
  // Search + Filter Combined
  // ---------------------------------------------------------------------------

  test('should combine search and role filter', async ({ page }) => {
    const adminPage = new AdminUsersPage(page);

    await test.step('Apply role filter', async () => {
      await adminPage.filterByRole('user');
    });

    await test.step('Apply search query on top of filter', async () => {
      await adminPage.searchUsers('testuser');
    });

    await test.step('Verify results are displayed', async () => {
      await expect(adminPage.userTable.first()).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });
});

// ---------------------------------------------------------------------------
// Non-Admin Access Denial (separate describe - uses AAL1 user, no admin storageState)
// ---------------------------------------------------------------------------

test.describe('Admin Users - Non-Admin Access Denial', () => {
  // Use AAL1 storageState (non-admin user) if available
  if (hasAuthState('AAL1')) {
    test.use({ storageState: AUTH_STATE.AAL1 });
  }

  test('should redirect non-admin user away from admin users page', async ({ page }) => {
    await test.step('Navigate to admin users page as non-admin', async () => {
      await page.goto('/admin/users', {
        timeout: TEST_CONFIG.TIMEOUTS.NAVIGATION,
      });
      await page.waitForLoadState('networkidle');
    });

    await test.step('Verify redirect or access denied', async () => {
      // Non-admin should be redirected away or see an error
      const currentUrl = page.url();
      const isRedirected = !currentUrl.includes('/admin/users');
      const accessDenied = page
        .getByText(/access denied/i)
        .or(page.getByText(/unauthorized/i))
        .or(page.getByText(/forbidden/i))
        .or(page.locator(TEST_CONFIG.SELECTORS.ADMIN_ERROR));

      if (!isRedirected) {
        await expect(accessDenied.first()).toBeVisible({
          timeout: TEST_CONFIG.TIMEOUTS.ACTION,
        });
      } else {
        expect(currentUrl).not.toContain('/admin/users');
      }
    });
  });
});
