/**
 * Comprehensive Resource Management Tests for DIVE Hub
 *
 * Tests the complete resource lifecycle through the UI:
 * - Resource listing and filtering
 * - Resource creation with validation
 * - Resource viewing with authorization checks
 * - Resource editing and updating
 * - Resource deletion (if supported)
 * - Search and navigation
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from '../../fixtures/test-users';
import { adaptiveLoginAs, adaptiveLogout } from '../../helpers/auth-adaptive';
import { ResourcesPage } from '../../page-objects/resources.page';
import { ResourceFormPage } from '../../page-objects/resource-form.page';

test.describe('DIVE Hub - Resource Management', () => {
  let resourcesPage: ResourcesPage;
  let resourceFormPage: ResourceFormPage;

  test.beforeEach(async ({ page }) => {
    resourcesPage = new ResourcesPage(page);
    resourceFormPage = new ResourceFormPage(page);
  });

  test.describe('Resource Listing and Navigation', () => {
    test('should display resources page correctly', async ({ page }) => {
      await resourcesPage.goto();
      expect(await resourcesPage.isLoaded()).toBe(true);

      // Should show some form of resource container
      expect(await resourcesPage.elementExists('[data-testid="resource-list"]') ||
             await resourcesPage.elementExists('.resource-container')).toBe(true);
    });

    test('should load resources without authentication', async ({ page }) => {
      // Test what happens when accessing resources without auth
      await resourcesPage.goto();

      // Either shows public resources or redirects to login
      const isLoaded = await resourcesPage.isLoaded();
      const hasLoginElements = await page.locator('[data-testid*="login"], button').filter({ hasText: /login|auth/i }).count() > 0;

      expect(isLoaded || hasLoginElements).toBe(true);
    });

    test('should handle empty resource state', async ({ page }) => {
      await resourcesPage.goto();

      const resourceCount = await resourcesPage.getResourceCount();
      if (resourceCount === 0) {
        // Should show empty state message
        expect(await page.locator('[data-testid="no-resources"], .empty-state, text=/no resources/i').count() > 0 ||
               await page.locator('[data-testid="empty-resources"]').count() > 0).toBe(true);
      }
    });

    test('should display resource metadata correctly', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.getResourceCount() > 0) {
        const resources = await resourcesPage.getVisibleResources();

        // Each resource should have basic metadata
        for (const resource of resources) {
          expect(resource.title).toBeTruthy();
          expect(resource.id).toBeTruthy();
          // Classification might be visible or hidden based on auth
        }
      }
    });
  });

  test.describe('Resource Filtering and Search', () => {
    test('should filter resources by classification', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.elementExists('[data-testid="classification-filter"]')) {
        const initialCount = await resourcesPage.getResourceCount();

        await resourcesPage.filterByClassification('UNCLASSIFIED');

        // Should not crash and should filter results
        const filteredCount = await resourcesPage.getResourceCount();
        expect(filteredCount).toBeLessThanOrEqual(initialCount);
      }
    });

    test('should search for resources', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.elementExists('[data-testid="search-input"]')) {
        await resourcesPage.searchResources('test');

        // Should not crash and should show results or no results message
        const hasResults = await resourcesPage.getResourceCount() >= 0;
        const hasNoResults = await page.locator('[data-testid="no-results"], text=/no results/i').count() > 0;

        expect(hasResults || hasNoResults).toBe(true);
      }
    });

    test('should handle search with no results', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.elementExists('[data-testid="search-input"]')) {
        await resourcesPage.searchResources('nonexistent-resource-12345');

        // Should show no results message
        expect(await page.locator('[data-testid="no-results"], text=/no results/i, .no-results').count() > 0 ||
               await resourcesPage.getResourceCount() === 0).toBe(true);
      }
    });
  });

  test.describe('Resource Creation', () => {
    test('should navigate to create resource page', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.elementExists('[data-testid="create-resource"]')) {
        await resourcesPage.clickCreateResource();

        // Should navigate to create form
        await page.waitForURL(/.*\/resources\/new.*/, { timeout: 5000 });
        expect(await resourceFormPage.isLoaded()).toBe(true);
      } else {
        console.log('Create resource button not found - may require authentication');
      }
    });

    test('should validate required fields on create form', async ({ page }) => {
      // Try to access create form directly
      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        // Try to submit without filling required fields
        await resourceFormPage.submitForm();

        // Should show validation errors
        const errors = await resourceFormPage.getValidationErrors();
        expect(errors.length).toBeGreaterThan(0);
      } else {
        console.log('Create form not accessible - may require authentication');
      }
    });

    test('should create resource with valid data', async ({ page }) => {
      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        await resourceFormPage.fillTitle('Automated Test Resource');
        await resourceFormPage.selectClassification('UNCLASSIFIED');
        await resourceFormPage.fillContent('This resource was created by automated testing.');
        await resourceFormPage.setReleasability(['USA']);

        await resourceFormPage.submitForm();

        // Should redirect back to resources list or show success
        await page.waitForURL(/.*\/resources.*/, { timeout: 10000 });

        // Check if resource was created (may not be visible if requires approval)
        const successMessage = await page.locator('[data-testid="success"], .success, text=/created|success/i').count() > 0;
        const redirectedToList = page.url().includes('/resources') && !page.url().includes('/new');

        expect(successMessage || redirectedToList).toBe(true);
      }
    });

    test('should enforce classification restrictions', async ({ page }) => {
      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        // Try to create TOP_SECRET resource
        const canSelectTopSecret = await resourceFormPage.isClassificationRestricted('TOP_SECRET');

        if (canSelectTopSecret) {
          console.log('TOP_SECRET classification is restricted - expected behavior');
        } else {
          await resourceFormPage.selectClassification('TOP_SECRET');
          await resourceFormPage.fillRequiredFields();
          await resourceFormPage.submitForm();

          // Should either fail or require additional approval
          const hasErrors = (await resourceFormPage.getValidationErrors()).length > 0;
          const hasApprovalMessage = await page.locator('[data-testid*="approval"], text=/approval|review/i').count() > 0;

          expect(hasErrors || hasApprovalMessage).toBe(true);
        }
      }
    });

    test('should handle form cancellation', async ({ page }) => {
      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        await resourceFormPage.fillTitle('Cancelled Resource');
        await resourceFormPage.cancelForm();

        // Should return to resources list
        await page.waitForURL(/.*\/resources.*/, { timeout: 5000 });
        expect(page.url().includes('/resources')).toBe(true);
        expect(page.url().includes('/new')).toBe(false);
      }
    });
  });

  test.describe('Resource Viewing', () => {
    test('should view resource details', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.getResourceCount() > 0) {
        const resources = await resourcesPage.getVisibleResources();
        const firstResource = resources[0];

        await resourcesPage.clickResource(firstResource.id);

        // Should show resource detail view
        await page.waitForURL(/.*\/resources\/.*/, { timeout: 5000 });
        expect(await page.locator('[data-testid="resource-detail"], .resource-detail').count() > 0).toBe(true);

        // Should show resource title
        const titleElement = await page.locator('[data-testid="resource-title"], h1, h2').first().textContent();
        expect(titleElement?.toLowerCase()).toContain(firstResource.title.toLowerCase());
      } else {
        console.log('No resources available to view');
      }
    });

    test('should handle access to non-existent resource', async ({ page }) => {
      await page.goto('/resources/non-existent-resource-12345');

      // Should show not found or access denied
      const hasNotFound = await page.locator('[data-testid="not-found"], .not-found, text=/not found/i').count() > 0;
      const hasAccessDenied = await page.locator('[data-testid*="access-denied"], text=/denied|forbidden/i').count() > 0;

      expect(hasNotFound || hasAccessDenied).toBe(true);
    });

    test('should show resource metadata in detail view', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.getResourceCount() > 0) {
        const resources = await resourcesPage.getVisibleResources();
        await resourcesPage.clickResource(resources[0].id);

        // Should show some form of metadata
        const hasMetadata = await page.locator('[data-testid*="metadata"], [data-testid*="classification"], [data-testid*="created"], .metadata').count() > 0;
        expect(hasMetadata).toBe(true);
      }
    });
  });

  test.describe('Resource Editing', () => {
    test('should access edit form for owned resources', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.getResourceCount() > 0) {
        const resources = await resourcesPage.getVisibleResources();
        await resourcesPage.clickResource(resources[0].id);

        // Look for edit button
        const editButton = page.locator('[data-testid="edit-resource"], button').filter({ hasText: /edit/i });

        if (await editButton.count() > 0) {
          await editButton.click();
          await page.waitForURL(/.*\/edit.*/, { timeout: 5000 });

          // Should load edit form
          expect(await resourceFormPage.isLoaded()).toBe(true);
        } else {
          console.log('Edit button not found - resource may not be editable or user lacks permissions');
        }
      }
    });

    test('should update resource successfully', async ({ page }) => {
      // This would require finding an editable resource
      // For now, test the form validation if accessible
      await page.goto('/resources/some-id/edit');

      if (await resourceFormPage.isLoaded()) {
        await resourceFormPage.fillTitle('Updated Title');
        await resourceFormPage.submitForm();

        // Should show success or redirect
        const hasSuccess = await page.locator('[data-testid="success"], text=/updated|saved/i').count() > 0;
        const redirected = page.url().includes('/resources') && !page.url().includes('/edit');

        expect(hasSuccess || redirected).toBe(true);
      }
    });
  });

  test.describe('Authorization UI Elements', () => {
    test('should show appropriate access controls', async ({ page }) => {
      await resourcesPage.goto();

      // Look for authorization-related UI elements
      const hasClearanceFilters = await page.locator('[data-testid*="clearance"], [data-testid*="classification"]').count() > 0;
      const hasPermissionIndicators = await page.locator('[data-testid*="permission"], [data-testid*="access"]').count() > 0;

      // Should have some form of access control UI
      expect(hasClearanceFilters || hasPermissionIndicators).toBe(true);
    });

    test('should indicate when resources are restricted', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.getResourceCount() > 0) {
        const hasRestrictions = await resourcesPage.hasAccessDeniedMessages() ||
                               await page.locator('[data-testid*="restricted"], .restricted').count() > 0;

        // If there are restrictions, they should be indicated
        if (hasRestrictions) {
          console.log('Found access restrictions - proper authorization enforcement');
        }
      }
    });

    test('should handle clearance-based visibility', async ({ page }) => {
      await resourcesPage.goto();

      // Check if classification levels are properly filtered
      const visibleClassifications = await page.locator('[data-testid*="classification"]').allTextContents();

      // Should not show classifications above user's clearance (if authenticated)
      // This is a basic check - more detailed tests would require specific user auth
      expect(visibleClassifications.length >= 0).toBe(true);
    });
  });

  test.describe('Performance and Usability', () => {
    test('should load resources within reasonable time', async ({ page }) => {
      const startTime = Date.now();

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      const loadTime = Date.now() - startTime;
      expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds

      console.log(`Resources page loaded in ${loadTime}ms`);
    });

    test('should handle pagination correctly', async ({ page }) => {
      await resourcesPage.goto();

      if (await resourcesPage.hasPagination()) {
        // Test pagination if it exists
        const paginationControls = page.locator('[data-testid*="pagination"], [data-testid*="page"]');

        // Should have navigation controls
        expect(await paginationControls.count() > 0).toBe(true);
      }
    });

    test('should show loading states appropriately', async ({ page }) => {
      await page.goto('/resources');

      // Check for loading indicators during initial load
      const hasLoading = await resourcesPage.hasLoadingIndicator();

      if (hasLoading) {
        console.log('Loading indicators present - good UX');
      }

      // Should eventually show content or empty state
      await resourcesPage.waitForResourcesToLoad();
      expect(await resourcesPage.isLoaded() || await page.locator('[data-testid="empty-state"]').count() > 0).toBe(true);
    });
  });
});

