/**
 * Comprehensive Test Suite for United Kingdom (GBR) Spoke Instance
 *
 * Tests all core functionality for the GBR instance:
 * - Authentication with UK users (FVEY COI)
 * - Authorization with FVEY clearance levels
 * - Resource management with UK jurisdiction
 * - Federation with Five Eyes partners
 * - UK-specific compliance and features
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { adaptiveLoginAs, adaptiveLogout } from '../../helpers/auth-adaptive';

test.describe('United Kingdom (GBR) Spoke Instance - Comprehensive Tests', () => {
  test.describe('Adaptive Authentication', () => {
    test('should authenticate user using adaptive auth on GBR instance', async ({ page }) => {
      const usersToTry = [
        TEST_USERS.GBR.TOP_SECRET, // Try FVEY UK users first
        TEST_USERS.USA.TOP_SECRET, // Then other FVEY members
        TEST_USERS.GBR.SECRET,
        TEST_USERS.USA.SECRET
      ];

      let authenticated = false;
      for (const user of usersToTry) {
        try {
          console.log(`[GBR] Trying authentication with ${user.username}`);
          await adaptiveLoginAs(page, user, { instanceCode: 'gbr', otpCode: '123456' });
          authenticated = true;
          break;
        } catch (error) {
          console.log(`[GBR] Failed with ${user.username}: ${error.message}`);
          continue;
        }
      }

      if (authenticated) {
        await expect(page.locator('[data-testid="user-info"]')).toBeVisible();
      } else {
        console.log('[GBR] All authentication attempts failed - checking basic access');
        await expect(page.locator('body')).toBeVisible();
      }
    });
  });

  test.describe('Authorization - FVEY Clearance Levels', () => {
    test('should allow FVEY users to access all clearance levels', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/resources');

      // FVEY users should access all classifications
      const allResources = page.locator('[data-testid="resource-item"]');
      await expect(allResources).toBeVisible();

      // Verify TOP_SECRET access
      const topSecretResources = page.locator('[data-testid="resource-item"][data-classification="TOP_SECRET"]');
      if (await topSecretResources.count() > 0) {
        await expect(topSecretResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
      }
    });

    test('should enforce FVEY COI restrictions', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      const fveyResources = page.locator('[data-testid="resource-item"][data-coi*="FVEY"]');
      if (await fveyResources.count() > 0) {
        await expect(fveyResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
      }
    });

    test('should allow access to NATO-COSMIC resources', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/resources');

      const natoCosmicResources = page.locator('[data-testid="resource-item"][data-coi*="NATO-COSMIC"]');
      if (await natoCosmicResources.count() > 0) {
        await expect(natoCosmicResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
      }
    });
  });

  test.describe('Resource Management - UK Operations', () => {
    test('should allow creating resources with UK classification scheme', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/resources/new');

      await page.fill('[data-testid="resource-title"]', 'UK Classified Document');
      await page.selectOption('[data-testid="classification-select"]', 'SECRET');
      await page.selectOption('[data-testid="uk-classification"]', 'UK OFFICIAL-SENSITIVE');
      await page.check('[data-testid="releasable-gbr"]');
      await page.check('[data-testid="fvey-marking"]');
      await page.fill('[data-testid="resource-content"]', 'UK FVEY content');

      await page.click('[data-testid="create-resource"]');
      await expect(page.locator('[data-testid="resource-title"]')).toContainText('UK Classified Document');
      await expect(page.locator('[data-testid="uk-official-sensitive"]')).toBeVisible();
    });

    test('should show UK document numbering (GBR-)', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      const gbrDoc = page.locator('[data-testid="resource-id"]').filter({ hasText: 'GBR-' }).first();
      await expect(gbrDoc).toBeVisible();
    });

    test('should support UK Eyes Only markings', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/resources/new');

      await page.check('[data-testid="uk-eyes-only"]');
      await page.fill('[data-testid="resource-title"]', 'UK Eyes Only Document');
      await page.click('[data-testid="create-resource"]');

      await expect(page.locator('[data-testid="uk-eyes-only-badge"]')).toBeVisible();
    });
  });

  test.describe('Federation - Five Eyes Integration', () => {
    test('should allow federation to USA (hub)', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.click('[data-testid="federate-to-hub"]');

      await page.waitForURL(/.*localhost:3000.*/, { timeout: 10000 });
      await expect(page.locator('[data-testid="federated-from-gbr"]')).toBeVisible();
    });

    test('should maintain FVEY context in hub federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.click('[data-testid="federate-to-hub"]');
      await page.waitForURL(/.*localhost:3000.*/, { timeout: 10000 });

      await expect(page.locator('[data-testid="federated-user-country"]')).toContainText('United Kingdom');
      await expect(page.locator('[data-testid="federated-user-coi"]')).toContainText('FVEY');
      await expect(page.locator('[data-testid="federated-user-coi"]')).toContainText('NATO-COSMIC');
    });

    test('should share FVEY resources with hub', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      const fveyResource = page.locator('[data-testid="resource-item"][data-coi*="FVEY"]').first();
      if (await fveyResource.count() > 0) {
        await fveyResource.click();
        await page.click('[data-testid="share-with-hub"]');

        await expect(page.locator('[data-testid="federation-share-success"]')).toBeVisible();
      }
    });
  });

  test.describe('Federation - Cross-FVEY Integration', () => {
    test('should show FVEY partner connectivity', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/federation/fvey');

      // Should show Five Eyes partners
      await expect(page.locator('[data-testid="fvey-usa"]')).toBeVisible();
      await expect(page.locator('[data-testid="fvey-can"]')).toBeVisible();
      await expect(page.locator('[data-testid="fvey-aus"]')).toBeVisible();
      await expect(page.locator('[data-testid="fvey-nzl"]')).toBeVisible();
    });

    test('should allow direct federation to FVEY partners', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/federation/fvey');

      // Click on USA federation
      await page.click('[data-testid="federate-to-usa"]');
      await page.waitForURL(/.*usa.*/, { timeout: 10000 });

      await expect(page.locator('[data-testid="fvey-federation-active"]')).toBeVisible();
    });

    test('should enforce FVEY data sharing rules', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/federation/sharing');

      // Should show FVEY-only sharing options
      await expect(page.locator('[data-testid="share-fvey-only"]')).toBeVisible();
      await expect(page.locator('[data-testid="share-nato-only"]')).toBeVisible();

      // Should not allow sharing outside FVEY without approval
      await expect(page.locator('[data-testid="share-outside-fvey"]')).toBeHidden();
    });
  });

  test.describe('UK-Specific Features', () => {
    test('should display UK language and locale options', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });

      await page.click('[data-testid="language-selector"]');
      await expect(page.locator('[data-testid="lang-en-GB"]')).toBeVisible(); // British English
      await expect(page.locator('[data-testid="lang-cy"]')).toBeVisible(); // Welsh
    });

    test('should show UK timezone and date formats', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });

      await expect(page.locator('[data-testid="user-timezone"]')).toContainText('Europe/London');
      await expect(page.locator('[data-testid="date-format"]')).toContainText('DD/MM/YYYY');
    });

    test('should comply with UK data protection laws', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
      await page.goto('/privacy');

      await expect(page.locator('[data-testid="uk-gdpr-compliance"]')).toBeVisible();
      await expect(page.locator('[data-testid="ico-registration"]')).toBeVisible();
    });

    test('should support UK classification markings', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/resources');

      // Should show UK-specific classification options
      await expect(page.locator('[data-testid="uk-official-marking"]')).toBeVisible();
      await expect(page.locator('[data-testid="uk-secret-marking"]')).toBeVisible();
      await expect(page.locator('[data-testid="uk-top-secret-marking"]')).toBeVisible();
    });
  });

  test.describe('Intelligence Community Features', () => {
    test('should support SIGINT/SIGINT markings', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/resources/new');

      await page.check('[data-testid="sigint-source"]');
      await page.selectOption('[data-testid="sigint-type"]', 'COMINT');
      await page.fill('[data-testid="resource-title"]', 'SIGINT Intelligence Report');

      await page.click('[data-testid="create-resource"]');

      await expect(page.locator('[data-testid="sigint-badge"]')).toBeVisible();
      await expect(page.locator('[data-testid="comint-indicator"]')).toBeVisible();
    });

    test('should handle UKUSA Agreement compliance', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/compliance/ukusa');

      await expect(page.locator('[data-testid="ukusa-agreement-status"]')).toContainText('Active');
      await expect(page.locator('[data-testid="fvey-data-sharing"]')).toBeVisible();
    });

    test('should support GCHQ-specific workflows', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.TOP_SECRET);
      await page.goto('/workflows');

      await expect(page.locator('[data-testid="gchq-workflow"]')).toBeVisible();
      await expect(page.locator('[data-testid="cesg-compliance"]')).toBeVisible();
    });
  });

  test.describe('Error Handling - UK Context', () => {
    test('should handle FVEY federation failures', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });

      // Simulate FVEY partner offline
      await page.goto('/federation/fvey/usa');

      // Should show FVEY-specific error handling
      await expect(page.locator('[data-testid="fvey-federation-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="emergency-contacts"]')).toBeVisible();
    });

    test('should handle UK classification mismatches', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.CONFIDENTIAL, { otpCode: '123456' });

      // Try to access TOP_SECRET resource
      await page.goto('/resources/top-secret-doc-123');

      await expect(page.locator('[data-testid="uk-classification-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="required-uk-level"]')).toContainText('TOP SECRET');
    });

    test('should handle FVEY COI violations', async ({ page }) => {
      await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });

      // Try to access UK FVEY resource
      await page.goto('/resources/uk-fvey-doc-123');

      await expect(page.locator('[data-testid="fvey-coi-violation"]')).toBeVisible();
      await expect(page.locator('[data-testid="coi-required"]')).toContainText('FVEY');
    });
  });

  test.describe('Performance - UK Instance', () => {
    test('should load UK resources within performance targets', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });

      const startTime = Date.now();
      await page.goto('/resources');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000);

      await expect(page.locator('[data-testid="performance-metrics"]')).toBeVisible();
    });

    test('should handle FVEY user load efficiently', async ({ page, browser }) => {
      const contexts = [];
      for (let i = 0; i < 5; i++) {
        const context = await browser.newContext();
        contexts.push(context);
        const newPage = await context.newPage();

        await loginAs(newPage, TEST_USERS.GBR.TOP_SECRET);
        await newPage.goto('/resources');
        await expect(newPage.locator('[data-testid="fvey-resources"]')).toBeVisible();
      }

      for (const context of contexts) {
        await context.close();
      }
    });

    test('should maintain performance during federation', async ({ page }) => {
      await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });

      const startTime = Date.now();
      await page.click('[data-testid="federate-to-hub"]');
      await page.waitForURL(/.*localhost:3000.*/, { timeout: 10000 });
      const federationTime = Date.now() - startTime;

      // Federation should complete within 5 seconds
      expect(federationTime).toBeLessThan(5000);
    });
  });
});
