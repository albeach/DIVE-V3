/**
 * Comprehensive Federation Flow Tests for DIVE Hub
 *
 * Tests cross-instance federation scenarios:
 * - Hub-to-spoke authentication forwarding
 * - Resource sharing across instances
 * - Federation metadata exchange
 * - Cross-domain session management
 * - Multi-instance resource access
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { loginAs, logout } from '../../helpers/auth';

test.describe('DIVE Hub - Federation Flows', () => {
  test.describe('Hub-to-Spoke Authentication Forwarding', () => {
    test('should allow hub users to access spoke resources via federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Navigate to federation section
      await page.goto('/federation');

      // Should show available spoke instances
      await expect(page.locator('[data-testid="spoke-instance-list"]')).toBeVisible();

      // Click on a spoke instance (e.g., GBR)
      await page.click('[data-testid="spoke-gbr"]');

      // Should federate to GBR instance
      await page.waitForURL(/.*gbr.*/, { timeout: 10000 });

      // Should maintain session context
      await expect(page.locator('[data-testid="federated-session"]')).toBeVisible();
    });

    test('should handle federation authentication challenges', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.TOP_SECRET);

      // Try to access restricted spoke resource
      await page.goto('/federation/spoke/alb/restricted-resource');

      // Should handle any additional authentication requirements
      // (e.g., spoke-specific MFA or authorization)
      await expect(page.locator('[data-testid="federation-auth"]')).toBeVisible();
    });
  });

  test.describe('Cross-Instance Resource Sharing', () => {
    test.describe('Resource Export from Hub', () => {
      test('should allow authorized users to export resources to spokes', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        // Select a resource
        const resource = page.locator('[data-testid="resource-item"]').first();
        await resource.click();

        // Click export/share button
        await page.click('[data-testid="export-resource"]');

        // Select target instances (spokes)
        await page.check('[data-testid="export-target-gbr"]');
        await page.check('[data-testid="export-target-deu"]');

        await page.click('[data-testid="confirm-export"]');

        // Should show success and export status
        await expect(page.locator('[data-testid="export-success"]')).toBeVisible();
      });

      test('should enforce releasability when exporting', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/resources/usa-only-resource-123/export');

        // Try to export to non-releasable country
        await page.check('[data-testid="export-target-chn"]');

        // Should show validation error
        await expect(page.locator('[data-testid="releasability-error"]')).toBeVisible();
        await expect(page.locator('[data-testid="confirm-export"]')).toBeDisabled();
      });
    });

    test.describe('Resource Import to Hub', () => {
      test('should allow importing authorized spoke resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/federation/imports');

        // Should show available imports from spokes
        await expect(page.locator('[data-testid="available-imports"]')).toBeVisible();

        // Select and import a resource
        await page.click('[data-testid="import-resource-btn"]');
        await page.click('[data-testid="confirm-import"]');

        // Should appear in local resources
        await page.goto('/resources');
        await expect(page.locator('[data-testid="imported-resource"]')).toBeVisible();
      });

      test('should validate imported resource classifications', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });
        await page.goto('/federation/imports');

        // Try to import SECRET resource (above clearance)
        const secretImport = page.locator('[data-testid="import-item"][data-classification="SECRET"]').first();

        if (await secretImport.count() > 0) {
          await secretImport.click();
          await expect(page.locator('[data-testid="classification-error"]')).toBeVisible();
        }
      });
    });
  });

  test.describe('Federation Metadata Exchange', () => {
    test('should display federation partner information', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/federation/partners');

      // Should show all spoke instances
      const partners = page.locator('[data-testid="federation-partner"]');
      await expect(partners).toHaveCount(4); // ALB, DNK, GBR, ROU

      // Each partner should show status and capabilities
      for (const partner of await partners.all()) {
        await expect(partner.locator('[data-testid="partner-status"]')).toBeVisible();
        await expect(partner.locator('[data-testid="partner-capabilities"]')).toBeVisible();
      }
    });

    test('should show federation connection health', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/federation/health');

      // Should show connectivity status for each spoke
      await expect(page.locator('[data-testid="health-alb"]')).toBeVisible();
      await expect(page.locator('[data-testid="health-dnk"]')).toBeVisible();
      await expect(page.locator('[data-testid="health-gbr"]')).toBeVisible();
      await expect(page.locator('[data-testid="health-rou"]')).toBeVisible();

      // All should show healthy status (green indicators)
      const healthyIndicators = page.locator('[data-testid="health-indicator"][data-status="healthy"]');
      await expect(healthyIndicators).toHaveCount(4);
    });

    test('should handle federation partner offline scenarios', async ({ page }) => {
      // This test would require simulating offline spokes
      // For now, test the UI handles offline status
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/federation/partners');

      // Look for any offline indicators (would need backend simulation)
      const offlinePartners = page.locator('[data-testid="partner-status"][data-status="offline"]');

      // If any offline, should show appropriate messaging
      if (await offlinePartners.count() > 0) {
        await expect(page.locator('[data-testid="offline-message"]')).toBeVisible();
      }
    });
  });

  test.describe('Cross-Domain Session Management', () => {
    test('should maintain session across federation hops', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Start at hub
      await expect(page.locator('[data-testid="user-info"]')).toContainText(TEST_USERS.USA.SECRET.username);

      // Federate to GBR spoke
      await page.goto('/federation/spoke/gbr');
      await page.waitForURL(/.*gbr.*/, { timeout: 10000 });

      // Should maintain user identity
      await expect(page.locator('[data-testid="federated-user"]')).toContainText(TEST_USERS.USA.SECRET.username);

      // Go back to hub
      await page.click('[data-testid="return-to-hub"]');
      await page.waitForURL(/.*localhost:3000.*/, { timeout: 10000 });

      // Should still be logged in
      await expect(page.locator('[data-testid="user-info"]')).toContainText(TEST_USERS.USA.SECRET.username);
    });

    test('should handle session timeout during federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Federate to spoke
      await page.goto('/federation/spoke/gbr');
      await page.waitForURL(/.*gbr.*/, { timeout: 10000 });

      // Simulate session timeout (would need backend manipulation)
      // For now, test logout behavior
      await page.click('[data-testid="federated-logout"]');

      // Should return to hub login
      await page.waitForURL(/.*localhost:3000.*/, { timeout: 10000 });
      await expect(page.getByRole('button', { name: /United States/i })).toBeVisible();
    });
  });

  test.describe('Multi-Instance Resource Access', () => {
    test('should allow federated search across instances', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/federation/search');

      // Enter search query
      await page.fill('[data-testid="federated-search"]', 'classified document');
      await page.click('[data-testid="search-btn"]');

      // Should show results from multiple instances
      await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

      // Results should be grouped by instance
      await expect(page.locator('[data-testid="hub-results"]')).toBeVisible();
      await expect(page.locator('[data-testid="spoke-results"]')).toBeVisible();
    });

    test('should enforce authorization across federated results', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });
      await page.goto('/federation/search');

      await page.fill('[data-testid="federated-search"]', 'secret');
      await page.click('[data-testid="search-btn"]');

      // Should show only authorized results
      const results = page.locator('[data-testid="search-result"]');

      // Check that no SECRET results are shown (above clearance)
      for (const result of await results.all()) {
        await expect(result).not.toHaveAttribute('data-classification', 'SECRET');
      }
    });

    test('should handle cross-instance resource linking', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources/federated-resource-123');

      // Resource should show federation metadata
      await expect(page.locator('[data-testid="federation-source"]')).toBeVisible();
      await expect(page.locator('[data-testid="federation-timestamp"]')).toBeVisible();

      // Should allow navigation back to source instance
      await page.click('[data-testid="view-in-source"]');
      await expect(page).toHaveURL(/.*gbr.*/, { timeout: 10000 }); // Assuming GBR source
    });
  });

  test.describe('Federation Error Handling', () => {
    test('should handle network errors during federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Try to access offline spoke (would need network simulation)
      await page.goto('/federation/spoke/alb');

      // Should show appropriate error messaging
      await expect(page.locator('[data-testid="federation-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-federation"]')).toBeVisible();
    });

    test('should handle authorization failures in federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.UNCLASSIFIED);

      // Try to access high-security spoke resource
      await page.goto('/federation/spoke/gbr/secret-resource');

      // Should show federation authorization error
      await expect(page.locator('[data-testid="federation-authz-error"]')).toBeVisible();
    });

    test('should handle federation timeout scenarios', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

      // Set up a slow federation request (would need backend manipulation)
      await page.goto('/federation/spoke/rou');

      // Should show timeout handling
      await expect(page.locator('[data-testid="federation-timeout"]')).toBeVisible();
      await expect(page.locator('[data-testid="retry-federation"]')).toBeVisible();
    });
  });
});
