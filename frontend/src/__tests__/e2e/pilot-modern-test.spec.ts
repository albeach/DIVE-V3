/**
 * PILOT TEST - Modern E2E Testing Patterns
 * 
 * This test demonstrates the new E2E testing infrastructure:
 * ✅ Centralized test users (fixtures/test-users.ts)
 * ✅ Centralized test resources (fixtures/test-resources.ts)
 * ✅ Centralized config (fixtures/test-config.ts)
 * ✅ Authentication helpers (helpers/auth.ts)
 * ✅ Page Object Model (pages/*.ts)
 * ✅ Semantic selectors (getByRole, getByLabel)
 * ✅ Relative paths (no hardcoded BASE_URL)
 * ✅ Explicit waits (no arbitrary timeouts)
 * ✅ Comprehensive error handling
 * 
 * Use this as a template when refactoring existing E2E tests.
 * 
 * Test Scenarios:
 * 1. USA SECRET user can access FVEY document (ALLOW)
 * 2. France SECRET user cannot access FVEY document (DENY - country)
 * 3. USA UNCLASS user cannot access SECRET document (DENY - clearance)
 */

import { test, expect } from '@playwright/test';
import { TEST_USERS } from './fixtures/test-users';
import { TEST_RESOURCES, TEST_SCENARIOS } from './fixtures/test-resources';
import { TEST_CONFIG } from './fixtures/test-config';
import { loginAs, logout } from './helpers/auth';
import { DashboardPage } from './pages/DashboardPage';
import { ResourcesPage } from './pages/ResourcesPage';
import { LoginPage } from './pages/LoginPage';

/**
 * Test suite: Resource Access Authorization
 */
test.describe('Resource Access Authorization (Modern Pattern)', () => {
  test.beforeEach(async ({ page }) => {
    console.log('\n🧪 Starting test...');
  });
  
  test.afterEach(async ({ page }) => {
    // Logout after each test to ensure clean state
    try {
      await logout(page);
    } catch (error) {
      console.log('⚠️ Logout failed (may already be logged out):', error);
    }
  });
  
  /**
   * Scenario 1: USA SECRET user accessing FVEY document
   * EXPECTED: ALLOW
   */
  test('USA SECRET user can access FVEY document', async ({ page }) => {
    test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET);
    });
    
    test.step('Verify dashboard shows user info', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
      await dashboard.verifyUserInfo(
        TEST_USERS.USA.SECRET.username,
        TEST_USERS.USA.SECRET.clearance,
        TEST_USERS.USA.SECRET.countryCode
      );
    });
    
    test.step('Navigate to resources page', async () => {
      const resources = new ResourcesPage(page);
      await resources.goto();
      await resources.verifyResourcesDisplayed();
    });
    
    test.step('Access FVEY document - expect ALLOW', async () => {
      const resources = new ResourcesPage(page);
      const fveyResource = TEST_RESOURCES.SECRET.FVEY;
      
      await resources.verifyResourceAccessible(fveyResource.resourceId);
      
      // Verify we can see the resource content
      const content = page.getByText(fveyResource.content);
      await expect(content).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });
  
  /**
   * Scenario 2: France SECRET user accessing FVEY document
   * EXPECTED: DENY (country FRA not in releasabilityTo: [USA, GBR, CAN, AUS, NZL])
   */
  test('France SECRET user cannot access FVEY document', async ({ page }) => {
    test.step('Login as France SECRET user', async () => {
      await loginAs(page, TEST_USERS.FRA.SECRET);
    });
    
    test.step('Verify dashboard shows user info', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
      await dashboard.verifyUserInfo(
        TEST_USERS.FRA.SECRET.username,
        TEST_USERS.FRA.SECRET.clearance,
        TEST_USERS.FRA.SECRET.countryCode
      );
    });
    
    test.step('Attempt to access FVEY document - expect DENY', async () => {
      const resources = new ResourcesPage(page);
      const fveyResource = TEST_RESOURCES.SECRET.FVEY;
      
      await resources.verifyResourceDenied(fveyResource.resourceId);
      
      // Verify denial reason mentions country or releasability
      const denialReason = page.getByText(/country|releasability|not releasable to/i);
      await expect(denialReason).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });
  
  /**
   * Scenario 3: USA UNCLASS user accessing SECRET document
   * EXPECTED: DENY (clearance UNCLASSIFIED < SECRET)
   */
  test('USA UNCLASS user cannot access SECRET document', async ({ page }) => {
    test.step('Login as USA UNCLASS user', async () => {
      await loginAs(page, TEST_USERS.USA.UNCLASS);
    });
    
    test.step('Verify dashboard shows UNCLASSIFIED clearance', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
      await dashboard.verifyUserInfo(
        TEST_USERS.USA.UNCLASS.username,
        'UNCLASSIFIED',
        'USA'
      );
    });
    
    test.step('Attempt to access SECRET document - expect DENY', async () => {
      const resources = new ResourcesPage(page);
      const secretResource = TEST_RESOURCES.SECRET.BASIC;
      
      await resources.verifyResourceDenied(secretResource.resourceId);
      
      // Verify denial reason mentions clearance
      const denialReason = page.getByText(/clearance|insufficient|not authorized/i);
      await expect(denialReason).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });
  
  /**
   * Scenario 4: Resources page search functionality
   */
  test('User can search and filter resources', async ({ page }) => {
    test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET);
    });
    
    test.step('Navigate to resources page', async () => {
      const resources = new ResourcesPage(page);
      await resources.goto();
      await resources.verifyResourcesDisplayed();
    });
    
    test.step('Search for FVEY resources', async () => {
      const resources = new ResourcesPage(page);
      await resources.searchFor('FVEY');
      
      // Should show FVEY resources
      const count = await resources.getResourceCount();
      expect(count).toBeGreaterThan(0);
    });
    
    test.step('Clear search shows all resources', async () => {
      const resources = new ResourcesPage(page);
      await resources.clearSearch();
      
      const count = await resources.getResourceCount();
      expect(count).toBeGreaterThan(0);
    });
  });
  
  /**
   * Scenario 5: Identity drawer (Cmd+I)
   */
  test('Identity drawer shows user details', async ({ page }) => {
    test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET);
    });
    
    test.step('Open identity drawer with Cmd+I', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.openIdentityDrawer();
      
      // Verify drawer is visible
      await expect(dashboard.identityDrawer).toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
    
    test.step('Verify user attributes in drawer', async () => {
      // Verify clearance
      const clearance = page.getByText(/SECRET/);
      await expect(clearance).toBeVisible();
      
      // Verify country
      const country = page.getByText(/USA|United States/);
      await expect(country).toBeVisible();
      
      // Verify COI (SECRET user has NATO-COSMIC)
      const coi = page.getByText(/NATO-COSMIC/);
      await expect(coi).toBeVisible();
    });
    
    test.step('Close identity drawer with Escape', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.closeIdentityDrawer();
      
      // Verify drawer is hidden
      await expect(dashboard.identityDrawer).not.toBeVisible({
        timeout: TEST_CONFIG.TIMEOUTS.ACTION,
      });
    });
  });
  
  /**
   * Scenario 6: NATO user accessing NATO document
   */
  test('German SECRET user can access NATO document', async ({ page }) => {
    test.step('Login as German SECRET user', async () => {
      await loginAs(page, TEST_USERS.DEU.SECRET);
    });
    
    test.step('Verify dashboard shows German user info', async () => {
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
      await dashboard.verifyUserInfo(
        TEST_USERS.DEU.SECRET.username,
        TEST_USERS.DEU.SECRET.clearance,
        TEST_USERS.DEU.SECRET.countryCode
      );
    });
    
    test.step('Access NATO document - expect ALLOW', async () => {
      const resources = new ResourcesPage(page);
      const natoResource = TEST_RESOURCES.SECRET.NATO;
      
      await resources.verifyResourceAccessible(natoResource.resourceId);
      
      // Verify NATO document content is visible
      const content = page.getByText(natoResource.content);
      await expect(content).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });
  
  /**
   * Scenario 7: Multiple IdP login flows
   */
  test('User can select different IdPs', async ({ page }) => {
    test.step('Verify IdP selector shows multiple options', async () => {
      const loginPage = new LoginPage(page);
      await loginPage.gotoHome();
      
      await loginPage.verifyIdPSelectorVisible();
      await loginPage.verifyIdPAvailable('United States');
      await loginPage.verifyIdPAvailable('France');
      await loginPage.verifyIdPAvailable('Canada');
      await loginPage.verifyIdPAvailable('Germany');
    });
    
    test.step('Login via USA IdP', async () => {
      await loginAs(page, TEST_USERS.USA.UNCLASS);
      
      const dashboard = new DashboardPage(page);
      await dashboard.verifyLoggedIn();
    });
  });
});

/**
 * Test suite: Error Handling & Edge Cases
 */
test.describe('Error Handling (Modern Pattern)', () => {
  test.afterEach(async ({ page }) => {
    try {
      await logout(page);
    } catch (error) {
      console.log('⚠️ Logout failed:', error);
    }
  });
  
  /**
   * Test: Accessing non-existent resource
   */
  test('Accessing non-existent resource shows 404', async ({ page }) => {
    test.step('Login as USA SECRET user', async () => {
      await loginAs(page, TEST_USERS.USA.SECRET);
    });
    
    test.step('Attempt to access non-existent resource', async () => {
      const resources = new ResourcesPage(page);
      await resources.gotoResourceDetail('non-existent-resource-id');
      
      // Should show 404 or not found message
      const notFound = page.getByText(/not found|404|does not exist/i);
      await expect(notFound).toBeVisible({ timeout: TEST_CONFIG.TIMEOUTS.ACTION });
    });
  });
});

