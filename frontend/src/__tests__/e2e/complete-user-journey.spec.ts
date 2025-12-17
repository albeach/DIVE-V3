/**
 * Complete User Journey E2E Tests
 * 
 * Tests complete user workflows from login to export:
 * - Registration → Login → Search → Filter → Export workflow
 * - Multi-step resource creation and editing
 * - Federation cross-instance scenarios
 * - Performance benchmarking
 * 
 * Phase 10: End-to-End Integration Testing
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES } from './fixtures/test-resources';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { LoginPage } from './pages/LoginPage';

test.describe('Complete User Journey - Login → Search → Filter → Export', () => {
  test('USA SECRET user complete workflow', async ({ page }) => {
    const startTime = Date.now();
    
    // Step 1: Login
    await test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
    });
    
    // Step 2: Navigate to Resources
    await test.step('Navigate to resources page', async () => {
      const resources = new ResourcesPage(page);
      await resources.goto();
      await resources.verifyResourcesDisplayed();
    });
    
    // Step 3: Search
    await test.step('Search for resources', async () => {
      const resources = new ResourcesPage(page);
      await resources.searchFor('fuel');
      await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
    });
    
    // Step 4: Apply Filters
    await test.step('Apply classification filter', async () => {
      const resources = new ResourcesPage(page);
      await resources.filterByClassification('SECRET');
      await expect(page.locator('[data-testid="filtered-results"]')).toBeVisible();
    });
    
    // Step 5: View Resource Details
    await test.step('View resource details', async () => {
      const resources = new ResourcesPage(page);
      await resources.clickResource(0);
      await expect(page.locator('[data-testid="resource-detail"]')).toBeVisible();
    });
    
    // Step 6: Export Resources
    await test.step('Export resources to CSV', async () => {
      await page.goBack();
      const exportButton = page.getByRole('button', { name: /export/i });
      await exportButton.click();
      
      // Select CSV format
      await page.getByRole('button', { name: /csv/i }).click();
      
      // Wait for download (Playwright handles downloads automatically)
      const downloadPromise = page.waitForEvent('download');
      await page.getByRole('button', { name: /download|export/i }).click();
      const download = await downloadPromise;
      
      expect(download.suggestedFilename()).toMatch(/\.csv$/);
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Performance benchmark: complete workflow should complete in < 15 seconds
    expect(duration).toBeLessThan(15000);
  });

  test('Multi-step resource creation workflow', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    // Step 1: Navigate to create resource
    await test.step('Navigate to create resource page', async () => {
      await page.goto('/resources/new');
      await expect(page.locator('[data-testid="resource-form"]')).toBeVisible();
    });
    
    // Step 2: Fill resource form
    await test.step('Fill resource form', async () => {
      await page.fill('[name="title"]', 'Test Resource');
      await page.selectOption('[name="classification"]', 'SECRET');
      await page.fill('[name="content"]', 'Test content for resource');
      await page.fill('[name="releasabilityTo"]', 'USA,GBR');
    });
    
    // Step 3: Submit form
    await test.step('Submit resource form', async () => {
      await page.click('[type="submit"]');
      await expect(page.locator('[data-testid="resource-detail"]')).toBeVisible();
    });
    
    // Step 4: Verify resource created
    await test.step('Verify resource created', async () => {
      await expect(page.locator('text=Test Resource')).toBeVisible();
      await expect(page.locator('text=SECRET')).toBeVisible();
    });
  });

  test('Federation cross-instance workflow', async ({ page }) => {
    // Step 1: Login to Hub (USA)
    await test.step('Login to USA Hub', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
    });
    
    // Step 2: Access federated resources
    await test.step('Access federated resources', async () => {
      const resources = new ResourcesPage(page);
      await resources.goto();
      await resources.enableFederatedSearch();
      await resources.searchFor('NATO');
      
      // Should show resources from multiple instances
      await expect(page.locator('[data-testid="federated-results"]')).toBeVisible();
    });
    
    // Step 3: Filter by instance
    await test.step('Filter by federation instance', async () => {
      await page.click('[data-testid="instance-filter"]');
      await page.click('text=GBR');
      await expect(page.locator('[data-testid="filtered-results"]')).toBeVisible();
    });
  });

  test('Performance benchmark - authentication flow', async ({ page }) => {
    const startTime = Date.now();
    
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Authentication should complete in < 15 seconds
    expect(duration).toBeLessThan(15000);
  });

  test('Performance benchmark - search and filter', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    const resources = new ResourcesPage(page);
    await resources.goto();
    
    const startTime = Date.now();
    
    await resources.searchFor('fuel');
    await resources.filterByClassification('SECRET');
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Search and filter should complete in < 2 seconds
    expect(duration).toBeLessThan(2000);
  });

  test('Error handling - network failure during search', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    const resources = new ResourcesPage(page);
    await resources.goto();
    
    // Simulate network failure
    await page.route('**/api/resources/search', route => route.abort());
    
    await resources.searchFor('fuel');
    
    // Should show error message
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();
    await expect(page.locator('text=/network|error|failed/i')).toBeVisible();
  });

  test('Error handling - invalid filter combination', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.UNCLASS, { otpCode: '123456' });
    
    const resources = new ResourcesPage(page);
    await resources.goto();
    
    // Try to access TOP_SECRET resource (should be denied)
    await resources.searchFor('TOP_SECRET');
    
    // Should show access denied message
    await expect(page.locator('[data-testid="access-denied"]')).toBeVisible();
  });
});

test.describe('Complete User Journey - Mobile Responsiveness', () => {
  test.use({ viewport: { width: 375, height: 667 } }); // iPhone SE size
  
  test('Mobile login and search workflow', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    const resources = new ResourcesPage(page);
    await resources.goto();
    
    // Mobile menu should be accessible
    const menuButton = page.locator('[data-testid="mobile-menu"]');
    await expect(menuButton).toBeVisible();
    
    await resources.searchFor('fuel');
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();
  });
});

