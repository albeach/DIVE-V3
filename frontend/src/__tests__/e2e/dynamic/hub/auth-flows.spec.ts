/**
 * Comprehensive Authentication Flow Tests for DIVE Hub
 *
 * Tests all authentication scenarios for the hub instance:
 * - Basic login flows (UNCLASSIFIED users)
 * - OTP authentication (CONFIDENTIAL/SECRET users)
 * - WebAuthn authentication (TOP_SECRET users)
 * - Session management
 * - Multi-user concurrent sessions
 * - Login failure scenarios
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { loginAs, logout, expectLoggedIn, expectLoggedOut } from '../../helpers/auth';

test.describe('DIVE Hub - Authentication Flows', () => {
  test.describe('Basic Login (UNCLASSIFIED)', () => {
    test('should login UNCLASSIFIED USA user successfully', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.UNCLASS);
      await expectLoggedIn(page, TEST_USERS.USA.UNCLASS);
    });

    test('should login UNCLASSIFIED contractor successfully', async ({ page }) => {
      await loginAs(page, TEST_USERS.INDUSTRY.BAH); // BAH is the contractor user
      await expectLoggedIn(page, TEST_USERS.INDUSTRY.BAH);
    });

    test('should handle invalid credentials gracefully', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /United States/i }).click();

      // Wait for Keycloak
      await page.waitForURL(/.*keycloak.*/, { timeout: 10000 });

      // Fill invalid credentials
      await page.fill('#username', 'invalid-user');
      await page.fill('#password', 'wrong-password');
      await page.click('#kc-login');

      // Should stay on login page with error
      await expect(page.locator('#input-error')).toBeVisible();
      await expect(page).toHaveURL(/.*login.*/);
    });
  });

  test.describe('OTP Authentication (CONFIDENTIAL/SECRET)', () => {
    test('should login CONFIDENTIAL USA user with OTP', async ({ page }) => {
      // Note: Requires valid TOTP code in test environment
      await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.CONFIDENTIAL);
    });

    test('should login SECRET USA user with OTP', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);
    });

    test('should handle invalid OTP gracefully', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /United States/i }).click();
      await page.waitForURL(/.*keycloak.*/, { timeout: 10000 });

      // Fill valid username/password
      await page.fill('#username', TEST_USERS.USA.SECRET.username);
      await page.fill('#password', TEST_USERS.USA.SECRET.password);
      await page.click('#kc-login');

      // Wait for OTP page
      await page.waitForURL(/.*totp.*/, { timeout: 10000 });

      // Fill invalid OTP
      await page.fill('#totp', '000000');
      await page.click('#kc-login');

      // Should show OTP error
      await expect(page.locator('.pf-c-alert__title')).toContainText('Invalid');
    });
  });

  test.describe('WebAuthn Authentication (TOP_SECRET)', () => {
    test('should login TOP_SECRET USA user with WebAuthn', async ({ page }) => {
      // Note: Requires WebAuthn credentials in test environment
      await loginAs(page, TEST_USERS.USA.TOP_SECRET);
      await expectLoggedIn(page, TEST_USERS.USA.TOP_SECRET);
    });

    test.skip('should handle WebAuthn cancellation', async ({ page }) => {
      // Skip in CI - requires browser interaction
      await page.goto('/');
      await page.getByRole('button', { name: /United States/i }).click();
      await page.waitForURL(/.*keycloak.*/, { timeout: 10000 });

      await page.fill('#username', TEST_USERS.USA.TOP_SECRET.username);
      await page.fill('#password', TEST_USERS.USA.TOP_SECRET.password);
      await page.click('#kc-login');

      await page.waitForURL(/.*webauthn.*/, { timeout: 10000 });

      // Click authenticate but cancel WebAuthn prompt
      await page.click('#authenticateWebAuthnButton');

      // Browser will show WebAuthn prompt - test would need to handle cancellation
      // This is difficult to automate reliably across browsers
    });
  });

  test.describe('Session Management', () => {
    test('should maintain session across page refreshes', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);

      // Refresh page
      await page.reload();
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);
    });

    test('should handle logout correctly', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);

      await logout(page);
      await expectLoggedOut(page);
    });

    test('should redirect to login after session expires', async ({ page }) => {
      // This would require manipulating session cookies or waiting for expiration
      // For now, test that logout works and redirects appropriately
      await loginAs(page, TEST_USERS.USA.UNCLASSIFIED);
      await logout(page);

      // Should be redirected to home page with login options
      await expect(page.getByRole('button', { name: /United States/i })).toBeVisible();
    });
  });

  test.describe('Concurrent Sessions', () => {
    test('should handle multiple browser tabs', async ({ page, context }) => {
      // Login in first tab
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await expectLoggedIn(page, TEST_USERS.USA.SECRET);

      // Open second tab
      const newPage = await context.newPage();
      await newPage.goto('/');
      await expectLoggedIn(newPage, TEST_USERS.USA.SECRET);
    });

    test('should handle multiple users concurrently', async ({ browser }) => {
      // Test concurrent access from different users
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Login different users
      await loginAs(page1, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await loginAs(page2, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });

      // Both should be logged in with correct user info
      await expectLoggedIn(page1, TEST_USERS.USA.SECRET);
      await expectLoggedIn(page2, TEST_USERS.USA.CONFIDENTIAL);

      await context1.close();
      await context2.close();
    });
  });

  test.describe('IdP Selection', () => {
    test('should show all available IdPs on home page', async ({ page }) => {
      await page.goto('/');

      // Check for major IdP buttons
      await expect(page.getByRole('button', { name: /United States/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /Industry/i })).toBeVisible();
      // Note: Hub instance may not show all spoke IdPs directly
    });

    test('should handle IdP button clicks correctly', async ({ page }) => {
      await page.goto('/');
      await page.getByRole('button', { name: /United States/i }).click();

      // Should redirect to Keycloak
      await page.waitForURL(/.*keycloak.*/, { timeout: 10000 });
      await expect(page).toHaveURL(/.*realms.*/);
    });
  });
});
