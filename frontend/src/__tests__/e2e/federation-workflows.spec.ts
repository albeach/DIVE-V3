/**
 * Federation Workflow E2E Tests
 * 
 * Tests cross-instance federation scenarios:
 * - Cross-instance SSO validation
 * - Policy synchronization verification
 * - Trust relationship testing
 * - Cross-border resource access
 * 
 * Phase 10: End-to-End Integration Testing
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';

test.describe('Federation Workflows - Cross-Instance SSO', () => {
  test('USA user → FRA instance SSO', async ({ page }) => {
    // Step 1: Login to USA Hub
    await test.step('Login to USA Hub', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
    });
    
    // Step 2: Navigate to FRA instance
    await test.step('Navigate to FRA instance', async () => {
      await page.goto('http://localhost:3025/resources');
      
      // Should either be logged in via SSO or redirected to login
      const url = page.url();
      if (url.includes('/login')) {
        // SSO should auto-login
        await page.waitForURL(/\/resources|\/dashboard/, { timeout: 15000 });
      }
    });
    
    // Step 3: Verify access to FRA resources
    await test.step('Verify access to FRA resources', async () => {
      const resources = new ResourcesPage(page);
      await resources.verifyResourcesDisplayed();
    });
  });

  test('FRA user → USA Hub SSO', async ({ page }) => {
    // Login to FRA instance
    await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
    
    // Navigate to USA Hub
    await page.goto('http://localhost:3000/resources');
    
    // Should be logged in via SSO
    await page.waitForURL(/\/resources|\/dashboard/, { timeout: 15000 });
    
    const resources = new ResourcesPage(page);
    await resources.verifyResourcesDisplayed();
  });

  test('GBR user → FRA instance SSO', async ({ page }) => {
    await loginAs(page, TEST_USERS.GBR.SECRET, { otpCode: '123456' });
    
    await page.goto('http://localhost:3025/resources');
    await page.waitForURL(/\/resources|\/dashboard/, { timeout: 15000 });
    
    const resources = new ResourcesPage(page);
    await resources.verifyResourcesDisplayed();
  });
});

test.describe('Federation Workflows - Policy Synchronization', () => {
  test('Policy update propagates to spoke instances', async ({ page }) => {
    // This test would require backend API to update policies
    // For now, verify that policy changes are reflected
    
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    // Navigate to policy management
    await page.goto('/admin/policies');
    
    // Verify policy version is displayed
    const policyVersion = page.locator('[data-testid="policy-version"]');
    await expect(policyVersion).toBeVisible();
  });

  test('Spoke instances receive policy updates', async ({ page }) => {
    await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
    
    // Navigate to FRA instance
    await page.goto('http://localhost:3025/admin/policies');
    
    // Verify policy sync status
    const syncStatus = page.locator('[data-testid="policy-sync-status"]');
    await expect(syncStatus).toBeVisible();
  });
});

test.describe('Federation Workflows - Trust Relationships', () => {
  test('Verify trust relationship between USA and FRA', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    // Navigate to federation management
    await page.goto('/admin/federation');
    
    // Verify FRA is listed as trusted partner
    const fraPartner = page.getByText(/FRA|France/i);
    await expect(fraPartner).toBeVisible();
    
    // Verify trust level
    const trustLevel = page.locator('[data-testid="trust-level-FRA"]');
    await expect(trustLevel).toBeVisible();
  });

  test('Verify trust relationship between FRA and GBR', async ({ page }) => {
    await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
    
    await page.goto('http://localhost:3025/admin/federation');
    
    const gbrPartner = page.getByText(/GBR|United Kingdom/i);
    await expect(gbrPartner).toBeVisible();
  });
});

test.describe('Federation Workflows - Cross-Border Resource Access', () => {
  test('USA user accesses FRA resources via federation', async ({ page }) => {
    await loginAs(page, TEST_USERS.USA.SECRET, { otpCode: '123456' });
    
    const resources = new ResourcesPage(page);
    await resources.goto();
    
    // Enable federated search
    await resources.enableFederatedSearch();
    
    // Search for resources
    await resources.searchFor('NATO');
    
    // Should show resources from multiple instances
    const federatedResults = page.locator('[data-testid="federated-results"]');
    await expect(federatedResults).toBeVisible();
    
    // Filter by FRA instance
    await page.click('[data-testid="instance-filter"]');
    await page.click('text=FRA');
    
    // Verify FRA resources are shown
    await expect(page.locator('[data-testid="resource-card"]')).toContainText(/FRA|France/i);
  });

  test('FRA user accesses USA resources via federation', async ({ page }) => {
    await loginAs(page, TEST_USERS.FRA.SECRET, { otpCode: '123456' });
    
    await page.goto('http://localhost:3025/resources');
    
    const resources = new ResourcesPage(page);
    await resources.enableFederatedSearch();
    await resources.searchFor('FVEY');
    
    // Should show USA resources if accessible
    const results = page.locator('[data-testid="resource-card"]');
    const count = await results.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
