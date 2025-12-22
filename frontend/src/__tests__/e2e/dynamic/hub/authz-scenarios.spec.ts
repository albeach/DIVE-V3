/**
 * Comprehensive Authorization Scenarios for DIVE Hub
 *
 * Tests all authorization policies and access control:
 * - Clearance-based access (UNCLASSIFIED → TOP_SECRET)
 * - COI (Community of Interest) restrictions
 * - Releasability checks (country-based access)
 * - Resource classification enforcement
 * - Cross-domain access scenarios
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { loginAs, logout } from '../../helpers/auth';

test.describe('DIVE Hub - Authorization Scenarios', () => {
  test.describe('Clearance-Based Access Control', () => {
    test.describe('UNCLASSIFIED User Access', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.UNCLASSIFIED);
      });

      test('should access UNCLASSIFIED resources', async ({ page }) => {
        // Navigate to resources page
        await page.goto('/resources');

        // Should be able to view UNCLASSIFIED content
        await expect(page.locator('[data-testid="resource-list"]')).toBeVisible();

        // Filter to UNCLASSIFIED only
        await page.selectOption('[data-testid="classification-filter"]', 'UNCLASSIFIED');

        // Should see UNCLASSIFIED resources
        const unclassifiedResources = page.locator('[data-testid="resource-item"]');
        await expect(unclassifiedResources.first()).toBeVisible();
      });

      test('should be denied CONFIDENTIAL resources', async ({ page }) => {
        await page.goto('/resources');

        // Try to access CONFIDENTIAL resource directly
        const confidentialResource = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'CONFIDENTIAL'
        }).first();

        if (await confidentialResource.count() > 0) {
          // Should show access denied or not be visible
          await expect(confidentialResource.locator('[data-testid="access-denied"]')).toBeVisible();
        }
      });

      test('should be denied SECRET and TOP_SECRET resources', async ({ page }) => {
        await page.goto('/resources');

        // Check that higher classification resources are not accessible
        const secretResources = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'SECRET'
        });
        const topSecretResources = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'TOP_SECRET'
        });

        // Should not see SECRET/TOP_SECRET resources or should show access denied
        await expect(secretResources).toHaveCount(0);
        await expect(topSecretResources).toHaveCount(0);
      });
    });

    test.describe('CONFIDENTIAL User Access', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });
      });

      test('should access UNCLASSIFIED and CONFIDENTIAL resources', async ({ page }) => {
        await page.goto('/resources');

        // Should see both UNCLASSIFIED and CONFIDENTIAL
        await expect(page.locator('[data-testid="resource-item"]')).toBeVisible();

        // Verify can access CONFIDENTIAL content
        const confidentialResource = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'CONFIDENTIAL'
        }).first();

        if (await confidentialResource.count() > 0) {
          await expect(confidentialResource.locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });

      test('should be denied SECRET and TOP_SECRET resources', async ({ page }) => {
        await page.goto('/resources');

        // Higher classifications should be denied
        const secretResources = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'SECRET'
        });
        await expect(secretResources).toHaveCount(0);
      });
    });

    test.describe('SECRET User Access', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      });

      test('should access UNCLASSIFIED, CONFIDENTIAL, and SECRET resources', async ({ page }) => {
        await page.goto('/resources');

        // Should see all lower and equal classifications
        const resources = page.locator('[data-testid="resource-item"]');
        await expect(resources).toBeVisible();

        // Verify can access SECRET content
        const secretResource = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'SECRET'
        }).first();

        if (await secretResource.count() > 0) {
          await expect(secretResource.locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });

      test('should be denied TOP_SECRET resources', async ({ page }) => {
        await page.goto('/resources');

        const topSecretResources = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'TOP_SECRET'
        });
        await expect(topSecretResources).toHaveCount(0);
      });
    });

    test.describe('TOP_SECRET User Access', () => {
      test.beforeEach(async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.TOP_SECRET);
      });

      test('should access all classification levels', async ({ page }) => {
        await page.goto('/resources');

        // Should see all resources
        const resources = page.locator('[data-testid="resource-item"]');
        await expect(resources).toBeVisible();

        // Verify can access TOP_SECRET content
        const topSecretResource = page.locator('[data-testid="resource-item"]').filter({
          hasText: 'TOP_SECRET'
        }).first();

        if (await topSecretResource.count() > 0) {
          await expect(topSecretResource.locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });
    });
  });

  test.describe('COI (Community of Interest) Access Control', () => {
    test.describe('FVEY COI Resources', () => {
      test('should allow FVEY users to access FVEY resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        // GBR user should have access to FVEY COI resources
        const fveyResources = page.locator('[data-testid="resource-item"][data-coi*="FVEY"]');
        if (await fveyResources.count() > 0) {
          await expect(fveyResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });

      test('should deny non-FVEY users from FVEY resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        // FRA user should not have access to FVEY COI resources
        const fveyResources = page.locator('[data-testid="resource-item"][data-coi*="FVEY"]');
        if (await fveyResources.count() > 0) {
          await expect(fveyResources.first().locator('[data-testid="access-denied"]')).toBeVisible();
        }
      });
    });

    test.describe('NATO COI Resources', () => {
      test('should allow NATO users to access NATO resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.DEU.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        const natoResources = page.locator('[data-testid="resource-item"][data-coi*="NATO"]');
        if (await natoResources.count() > 0) {
          await expect(natoResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });
    });
  });

  test.describe('Releasability (Country-Based) Access Control', () => {
    test.describe('USA-Releasable Resources', () => {
      test('should allow USA users to access USA-releasable resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        const usaResources = page.locator('[data-testid="resource-item"][data-releasable*="USA"]');
        if (await usaResources.count() > 0) {
          await expect(usaResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });

      test('should allow NATO allies to access USA-releasable resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        // GBR should have access to USA-releasable resources (NATO ally)
        const usaResources = page.locator('[data-testid="resource-item"][data-releasable*="USA"]');
        if (await usaResources.count() > 0) {
          await expect(usaResources.first().locator('[data-testid="access-denied"]')).toBeHidden();
        }
      });
    });

    test.describe('Country-Restricted Resources', () => {
      test('should deny non-releasable countries access', async ({ page }) => {
        // Assume we have resources releasable only to USA
        await loginAs(page, TEST_USERS.CHN.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        const usaOnlyResources = page.locator('[data-testid="resource-item"][data-releasable="USA"]');
        if (await usaOnlyResources.count() > 0) {
          await expect(usaOnlyResources.first().locator('[data-testid="access-denied"]')).toBeVisible();
        }
      });
    });
  });

  test.describe('Resource Operations (CRUD)', () => {
    test.describe('Read Operations', () => {
      test('should allow authorized users to view resource details', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/resources');

        const resourceLink = page.locator('[data-testid="resource-item"]').first();
        if (await resourceLink.count() > 0) {
          await resourceLink.click();
          await expect(page).toHaveURL(/.*\/resources\/.*/);
          await expect(page.locator('[data-testid="resource-detail"]')).toBeVisible();
        }
      });

      test('should deny unauthorized users from viewing restricted resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.UNCLASSIFIED);
        await page.goto('/resources/secret-document-123'); // Direct URL access

        // Should redirect or show access denied
        await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
      });
    });

    test.describe('Create Operations', () => {
      test('should allow authorized users to create resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
        await page.goto('/resources/new');

        // Fill out create form
        await page.fill('[data-testid="resource-title"]', 'Test Resource');
        await page.selectOption('[data-testid="classification-select"]', 'SECRET');
        await page.fill('[data-testid="resource-content"]', 'Test content');

        await page.click('[data-testid="create-resource"]');

        // Should redirect to resource detail
        await expect(page).toHaveURL(/.*\/resources\/.*/);
        await expect(page.locator('[data-testid="resource-title"]')).toContainText('Test Resource');
      });

      test('should deny unauthorized users from creating high-classification resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });
        await page.goto('/resources/new');

        // Try to create SECRET resource (above clearance)
        await page.selectOption('[data-testid="classification-select"]', 'SECRET');

        // Should show error or disable SECRET option
        await expect(page.locator('[data-testid="classification-error"]')).toBeVisible();
      });
    });

    test.describe('Update Operations', () => {
      test('should allow resource owners to update resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

        // Navigate to owned resource
        await page.goto('/resources');
        const ownedResource = page.locator('[data-testid="resource-item"][data-owner="true"]').first();

        if (await ownedResource.count() > 0) {
          await ownedResource.click();
          await page.click('[data-testid="edit-resource"]');

          await page.fill('[data-testid="resource-title"]', 'Updated Title');
          await page.click('[data-testid="save-changes"]');

          await expect(page.locator('[data-testid="resource-title"]')).toContainText('Updated Title');
        }
      });

      test('should deny non-owners from updating resources', async ({ page }) => {
        await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });

        // Try to edit someone else's resource
        await page.goto('/resources/other-user-resource-123');
        await expect(page.locator('[data-testid="edit-resource"]')).toBeHidden();
      });
    });
  });

  test.describe('Cross-Domain Access Scenarios', () => {
    test('should handle concurrent access to same resource', async ({ browser }) => {
      const context1 = await browser.newContext();
      const context2 = await browser.newContext();

      const page1 = await context1.newPage();
      const page2 = await context2.newPage();

      // Both users access same resource simultaneously
      await loginAs(page1, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await loginAs(page2, TEST_USERS.USA.CONFIDENTIAL, { otpCode: '123456' });

      await page1.goto('/resources/shared-resource-123');
      await page2.goto('/resources/shared-resource-123');

      // Both should see appropriate access levels
      await expect(page1.locator('[data-testid="resource-detail"]')).toBeVisible();
      await expect(page2.locator('[data-testid="access-denied"]')).toBeVisible();

      await context1.close();
      await context2.close();
    });

    test('should handle session invalidation correctly', async ({ page }) => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      await page.goto('/resources');

      // Simulate session invalidation (would need backend manipulation)
      // For now, test logout behavior
      await logout(page);

      // Try to access protected resource after logout
      await page.goto('/resources/protected-resource-123');
      await expect(page.locator('[data-testid="login-required"]')).toBeVisible();
    });
  });
});

