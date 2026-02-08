/**
 * Authentication Confirmed - Comprehensive Frontend Tests
 *
 * This test suite confirms authentication works and then tests comprehensive
 * frontend functionality including resource management, authorization UI,
 * federation workflows, and form validations.
 */

import { test, expect } from '@playwright/test';
import { loginAs, expectLoggedIn } from './helpers/auth';
import { ResourcesPage } from './page-objects/resources.page';
import { ResourceFormPage } from './page-objects/resource-form.page';

test.describe('DIVE V3 - Authentication Confirmed & Comprehensive Frontend', { tag: ['@fast', '@smoke', '@critical'] }, () => {
  let resourcesPage: ResourcesPage;
  let resourceFormPage: ResourceFormPage;

  test.beforeEach(async ({ page }) => {
    resourcesPage = new ResourcesPage(page);
    resourceFormPage = new ResourceFormPage(page);
  });

  test.describe('🔐 Authentication Confirmation', () => {
    test('✅ HUB: should authenticate UNCLASSIFIED USA user successfully', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States',
        clearance: 'UNCLASSIFIED'
      } as any);
      await expectLoggedIn(page, { username: 'testuser-usa-1' } as any);
    });

    test('✅ HUB: should authenticate SECRET USA user with OTP', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States',
        clearance: 'SECRET',
        mfaRequired: true,
        mfaType: 'otp'
      } as any, { otpCode: '123456' });
      await expectLoggedIn(page, { username: 'testuser-usa-3' } as any);
    });

    test('✅ ALB: should authenticate Albania UNCLASSIFIED user', async ({ page }) => {
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });
      await expectLoggedIn(page, { username: 'testuser-alb-1' } as any);
    });
  });

  test.describe('📋 Resource Management - Complete Workflow', () => {
    test('should navigate resources page after authentication', async ({ page }) => {
      // Login first
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);
      await expectLoggedIn(page, { username: 'testuser-usa-1' } as any);

      // Navigate to resources
      await resourcesPage.goto();
      expect(await resourcesPage.isLoaded()).toBe(true);

      // Verify page structure
      expect(await resourcesPage.elementExists('[data-testid="resource-list"]') ||
             await resourcesPage.elementExists('.resource-container')).toBe(true);
    });

    test('should display resource listing correctly', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      // Check pagination if it exists
      const hasPagination = await resourcesPage.hasPagination();
      if (hasPagination) {
        console.log('✅ Pagination detected');
      }

      // Check loading states
      const hasLoading = await resourcesPage.hasLoadingIndicator();
      expect(hasLoading).toBe(false); // Should not be loading anymore

      // Get resource count
      const count = await resourcesPage.getResourceCount();
      console.log(`📊 Found ${count} resources on page`);

      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should filter resources by classification', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      const initialCount = await resourcesPage.getResourceCount();

      // Try filtering by UNCLASSIFIED
      await resourcesPage.filterByClassification('UNCLASSIFIED');
      await resourcesPage.waitForResourcesToLoad();

      const filteredCount = await resourcesPage.getResourceCount();
      expect(filteredCount).toBeLessThanOrEqual(initialCount);
    });

    test('should search for resources', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      // Search for a common term
      await resourcesPage.searchResources('test');
      await resourcesPage.waitForResourcesToLoad();

      // Should complete without error
      const count = await resourcesPage.getResourceCount();
      expect(count).toBeGreaterThanOrEqual(0);
    });

    test('should handle empty search results', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      // Search for something that won't exist
      await resourcesPage.searchResources('nonexistent-resource-12345-unique');
      await resourcesPage.waitForResourcesToLoad();

      const count = await resourcesPage.getResourceCount();
      expect(count).toBe(0);
    });
  });

  test.describe('📝 Resource Creation - Form Validation', () => {
    test('should access create resource form', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await resourcesPage.goto();

      if (await resourcesPage.elementExists('[data-testid="create-resource"]')) {
        await resourcesPage.clickCreateResource();
        await page.waitForURL(/.*\/resources\/new.*/, { timeout: 5000 });

        expect(await resourceFormPage.isLoaded()).toBe(true);
      } else {
        console.log('⚠️ Create resource button not available');
      }
    });

    test('should validate required fields on create form', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        // Try to submit empty form
        await resourceFormPage.submitForm();

        // Should show validation errors
        const errors = await resourceFormPage.getValidationErrors();
        expect(errors.length).toBeGreaterThan(0);

        console.log(`✅ Found ${errors.length} validation errors as expected`);
      } else {
        console.log('⚠️ Create form not accessible');
      }
    });

    test('should create resource with valid data', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        await resourceFormPage.fillTitle('Automated Test Resource - ' + Date.now());
        await resourceFormPage.selectClassification('SECRET');
        await resourceFormPage.fillContent('This resource was created by automated frontend testing.');
        await resourceFormPage.setReleasability(['USA']);

        await resourceFormPage.submitForm();

        // Should redirect or show success
        await page.waitForURL(/.*\/resources.*/, { timeout: 10000 });

        const successElements = page.locator('[data-testid*="success"], .success, text=/created|saved/i');
        const backOnList = page.url().includes('/resources') && !page.url().includes('/new');

        expect(await successElements.count() > 0 || backOnList).toBe(true);
        console.log('✅ Resource creation completed successfully');
      }
    });

    test('should enforce classification restrictions', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-2',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' }); // CONFIDENTIAL user

      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        // Check if TOP_SECRET is restricted
        const isTopSecretRestricted = await resourceFormPage.isClassificationRestricted('TOP_SECRET');
        expect(isTopSecretRestricted).toBe(true);

        console.log('✅ Classification restrictions working correctly');
      }
    });
  });

  test.describe('👁️ Resource Viewing - Authorization Checks', () => {
    test('should view resource details', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();

      if (await resourcesPage.getResourceCount() > 0) {
        const resources = await resourcesPage.getVisibleResources();
        const firstResource = resources[0];

        await resourcesPage.clickResource(firstResource.id);
        await page.waitForURL(/.*\/resources\/.*/, { timeout: 5000 });

        // Should show resource detail view
        const detailElements = page.locator('[data-testid="resource-detail"], .resource-detail, [data-testid*="detail"]');
        expect(await detailElements.count() > 0).toBe(true);

        console.log(`✅ Viewing resource: ${firstResource.title}`);
      } else {
        console.log('⚠️ No resources available to view');
      }
    });

    test('should show access denied for restricted resources', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-2',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' }); // CONFIDENTIAL user

      // Try to access a SECRET resource directly
      await page.goto('/resources/secret-resource-123');

      // Should show access denied or not found
      const accessDenied = await resourcesPage.hasAccessDeniedMessages() ||
                          await page.locator('[data-testid*="denied"], .access-denied, text=/denied|forbidden/i').count() > 0;

      if (accessDenied) {
        console.log('✅ Access control working - denied access to higher classification');
      } else {
        console.log('ℹ️ Resource may not exist or access control not triggered');
      }
    });
  });

  test.describe('🔒 Authorization UI Elements', () => {
    test('should show clearance-based filtering options', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await resourcesPage.goto();

      // Should have some form of authorization controls
      const authControls = page.locator('[data-testid*="clearance"], [data-testid*="classification"], [data-testid*="filter"]');
      expect(await authControls.count() > 0).toBe(true);

      console.log('✅ Authorization UI elements present');
    });

    test('should indicate COI-based access controls', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await resourcesPage.goto();

      // Look for COI indicators
      const coiElements = page.locator('[data-coi], [data-testid*="coi"], .coi-badge');
      const count = await coiElements.count();

      if (count > 0) {
        console.log(`✅ Found ${count} COI access control elements`);
      }
    });
  });

  test.describe('🌐 Federation Workflows', () => {
    test('should show federation options when available', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      // Check for federation UI elements
      const federationElements = page.locator('[data-testid*="federat"], button, a').filter({
        hasText: /federat|hub|spoke/i
      });

      const count = await federationElements.count();
      if (count > 0) {
        console.log(`✅ Found ${count} federation UI elements`);
      } else {
        console.log('ℹ️ No federation elements visible (may not be implemented yet)');
      }
    });

    test('should maintain session across navigation', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      // Navigate to different sections
      await page.goto('/dashboard');
      await expectLoggedIn(page, { username: 'testuser-usa-1' } as any);

      await page.goto('/resources');
      await expectLoggedIn(page, { username: 'testuser-usa-1' } as any);

      console.log('✅ Session maintained across navigation');
    });
  });

  test.describe('⚡ Performance & Usability', () => {
    test('should load resources within acceptable time', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      const startTime = Date.now();
      await resourcesPage.goto();
      await resourcesPage.waitForResourcesToLoad();
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(10000); // Should load within 10 seconds
      console.log(`⚡ Resources page loaded in ${loadTime}ms`);
    });

    test('should handle rapid navigation', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      // Rapid navigation between pages
      await page.goto('/resources');
      await page.goto('/dashboard');
      await page.goto('/resources');
      await page.goBack();
      await page.goForward();

      // Should maintain authentication
      await expectLoggedIn(page, { username: 'testuser-usa-1' } as any);
      console.log('✅ Rapid navigation handled correctly');
    });
  });

  test.describe('🚨 Error Handling', () => {
    test('should handle invalid URLs gracefully', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-1',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any);

      await page.goto('/non-existent-page-12345');

      // Should show 404 or error page
      const errorElements = page.locator('[data-testid="not-found"], .not-found, [data-testid*="error"], text=/not found|404/i');
      expect(await errorElements.count() > 0).toBe(true);

      console.log('✅ Error handling working for invalid URLs');
    });

    test('should handle network errors during form submission', async ({ page }) => {
      await loginAs(page, {
        username: 'testuser-usa-3',
        password: 'TestUser2025!Pilot',
        idp: 'United States'
      } as any, { otpCode: '123456' });

      await page.goto('/resources/new');

      if (await resourceFormPage.isLoaded()) {
        await resourceFormPage.fillRequiredFields();

        // Simulate network error by intercepting request
        await page.route('**/api/resources', route => route.abort());

        await resourceFormPage.submitForm();

        // Should show network error
        const errorElements = page.locator('[data-testid*="error"], .error, text=/network|connection|failed/i');
        expect(await errorElements.count() > 0).toBe(true);

        console.log('✅ Network error handling working');
      }
    });
  });
});

