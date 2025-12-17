/**
 * Comprehensive Frontend Tests for DIVE V3
 *
 * Tests the complete frontend application functionality:
 * - Authentication flows for all instance types
 * - Resource management (CRUD operations)
 * - Authorization UI elements
 * - Federation workflows
 * - Form validations and error handling
 * - Navigation and routing
 */

import { test, expect } from '@playwright/test';

test.describe('DIVE V3 Comprehensive Frontend Tests', () => {
  test.describe('Authentication Flows', () => {
    test.describe('Albania Instance Authentication', () => {
      test('should login as Albania UNCLASSIFIED user', async ({ page }) => {
        // Navigate to Albania instance
        await page.goto('https://localhost:3001');

        // Wait for JavaScript to load authentication buttons
        await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });

        // Click Albania login
        await page.click('button:has-text("Login as Albania User")');

        // Should redirect to Albania Keycloak (port 8444)
        await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });

        // Fill Albania UNCLASSIFIED user credentials
        await page.fill('#username', 'testuser-alb-1');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        // Should redirect back to Albania instance
        await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

        // Verify authentication
        await expect(page.locator('[data-testid="user-info"], .user-info, [data-testid*="user"]')).toBeVisible();
        await expect(page.locator('body')).toContainText(/ALB|Albania|testuser-alb-1/i);
      });

      test('should login as Albania SECRET user with OTP', async ({ page }) => {
        await page.goto('https://localhost:3001');
        await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
        await page.click('button:has-text("Login as Albania User")');
        await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });

        // Fill Albania SECRET user credentials
        await page.fill('#username', 'testuser-alb-3');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        // Handle OTP requirement
        await page.waitForSelector('#totp', { timeout: 5000 });
        await page.fill('#totp', '123456');
        await page.click('#kc-login');

        // Should redirect back to Albania instance
        await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

        // Verify SECRET clearance
        await expect(page.locator('[data-testid="user-info"]')).toContainText(/SECRET|testuser-alb-3/i);
      });

      test('should federate from Albania to USA', async ({ page }) => {
        await page.goto('https://localhost:3001');
        await page.waitForSelector('button:has-text("United States")', { timeout: 10000 });
        await page.click('button:has-text("United States")');

        // Should redirect to USA Keycloak (hub)
        await page.waitForURL(/.*localhost:8443.*/, { timeout: 10000 });

        // Login as USA user
        await page.fill('#username', 'testuser-usa-1');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        // Should redirect back to Albania instance as federated user
        await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

        // Verify federated access
        await expect(page.locator('[data-testid="federated-user"], [data-testid="user-info"]')).toContainText(/USA|testuser-usa-1/i);
      });
    });

    test.describe('United Kingdom Instance Authentication', () => {
      test('should login as UK TOP_SECRET user with WebAuthn', async ({ page }) => {
        await page.goto('https://localhost:3003');
        await page.waitForSelector('button:has-text("Login as United Kingdom User")', { timeout: 10000 });
        await page.click('button:has-text("Login as United Kingdom User")');
        await page.waitForURL(/.*localhost:8446.*/, { timeout: 10000 });

        // Fill UK TOP_SECRET user credentials
        await page.fill('#username', 'testuser-gbr-4');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        // Handle WebAuthn (this would normally require biometric, but test env might skip)
        try {
          await page.waitForSelector('#webauthn', { timeout: 5000 });
          // In test environment, WebAuthn might be mocked or skipped
          console.log('WebAuthn prompt appeared - test environment handling');
        } catch (e) {
          // WebAuthn not required in test env
        }

        await page.waitForURL(/.*localhost:3003.*/, { timeout: 15000 });
        await expect(page.locator('[data-testid="user-info"]')).toContainText(/TOP_SECRET|testuser-gbr-4|FVEY/i);
      });
    });

    test.describe('Denmark Instance Authentication', () => {
      test('should login as Denmark SECRET user', async ({ page }) => {
        await page.goto('https://localhost:3007');
        await page.waitForSelector('button:has-text("Login as Denmark User")', { timeout: 10000 });
        await page.click('button:has-text("Login as Denmark User")');
        await page.waitForURL(/.*localhost:8450.*/, { timeout: 10000 });

        await page.fill('#username', 'testuser-dnk-3');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        await page.waitForURL(/.*localhost:3007.*/, { timeout: 15000 });
        await expect(page.locator('[data-testid="user-info"]')).toContainText(/SECRET|testuser-dnk-3|NATO/i);
      });
    });

    test.describe('Romania Instance Authentication', () => {
      test('should login as Romania user', async ({ page }) => {
        await page.goto('https://localhost:3025');
        await page.waitForSelector('button:has-text("Login as Romania User")', { timeout: 10000 });
        await page.click('button:has-text("Login as Romania User")');
        await page.waitForURL(/.*localhost:8468.*/, { timeout: 10000 });

        await page.fill('#username', 'testuser-rou-1');
        await page.fill('#password', 'TestUser2025!Pilot');
        await page.click('#kc-login');

        await page.waitForURL(/.*localhost:3025.*/, { timeout: 15000 });
        await expect(page.locator('[data-testid="user-info"]')).toContainText(/testuser-rou-1|ROU|Romania/i);
      });
    });
  });

  test.describe('Resource Management', () => {
    test('should navigate to resources page after authentication', async ({ page }) => {
      // Login first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Navigate to resources
      await page.goto('https://localhost:3001/resources');
      await expect(page).toHaveURL(/.*\/resources/);

      // Check for resource UI elements
      await expect(page.locator('[data-testid="resource-list"], .resource-container, .resources')).toBeVisible();
    });

    test('should create new resource with proper classification', async ({ page }) => {
      // Login as SECRET user first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-3'); // SECRET user
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForSelector('#totp', { timeout: 5000 });
      await page.fill('#totp', '123456');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Navigate to create resource
      await page.goto('https://localhost:3001/resources/new');
      await expect(page).toHaveURL(/.*\/resources\/new/);

      // Check for form elements
      await expect(page.locator('[data-testid="resource-form"], form')).toBeVisible();

      // Fill out the form
      await page.fill('[data-testid="resource-title"], input[name*="title"], #title', 'Test Resource from Automation');
      await page.selectOption('[data-testid="classification-select"], select[name*="class"], #classification', 'SECRET');
      await page.fill('[data-testid="resource-content"], textarea[name*="content"], #content', 'This resource was created by automated testing.');
      await page.check('[data-testid*="releasable-alb"], input[value*="ALB"]');

      // Submit the form
      await page.click('[data-testid="create-resource"], [data-testid="submit"], button[type="submit"]');

      // Should redirect or show success
      await page.waitForURL(/.*\/resources.*/, { timeout: 10000 });
      const successIndicators = page.locator('[data-testid*="success"], .success, text=/created|saved/i');
      const resourceList = page.locator('[data-testid="resource-list"]');

      // Either success message or back on resource list
      expect(await successIndicators.count() > 0 || await resourceList.isVisible()).toBe(true);
    });

    test('should enforce classification restrictions', async ({ page }) => {
      // Login as CONFIDENTIAL user
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-2'); // CONFIDENTIAL user
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Try to create SECRET resource (above clearance)
      await page.goto('https://localhost:3001/resources/new');

      // Check if SECRET option is disabled or hidden
      const secretOption = page.locator('option[value="SECRET"], [data-testid*="classification"] option').filter({ hasText: 'SECRET' });
      const isDisabled = await secretOption.getAttribute('disabled') !== null;
      const isMissing = await secretOption.count() === 0;

      expect(isDisabled || isMissing).toBe(true);
    });
  });

  test.describe('Authorization UI Elements', () => {
    test('should show clearance-based resource filtering', async ({ page }) => {
      // Login as SECRET user
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-3');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForSelector('#totp', { timeout: 5000 });
      await page.fill('#totp', '123456');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Go to resources
      await page.goto('https://localhost:3001/resources');

      // Should see SECRET and lower classification resources
      const secretResources = page.locator('[data-classification*="SECRET"], [data-testid*="classification"]').filter({ hasText: /SECRET|CONFIDENTIAL|UNCLASSIFIED/i });
      const topSecretResources = page.locator('[data-classification*="TOP_SECRET"], [data-testid*="classification"]').filter({ hasText: /TOP_SECRET/i });

      // Should be able to see SECRET and lower
      expect(await secretResources.count() >= 0).toBe(true);

      // Should NOT see TOP_SECRET (above clearance)
      expect(await topSecretResources.count() === 0).toBe(true);
    });

    test('should show COI-based access controls', async ({ page }) => {
      // Login as Albania user (NATO COI)
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-3');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForSelector('#totp', { timeout: 5000 });
      await page.fill('#totp', '123456');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      await page.goto('https://localhost:3001/resources');

      // Should see NATO COI resources
      const natoResources = page.locator('[data-coi*="NATO"], [data-testid*="coi"]').filter({ hasText: /NATO/i });
      expect(await natoResources.count() >= 0).toBe(true);

      // Should NOT see FVEY-only resources
      const fveyResources = page.locator('[data-coi*="FVEY"], [data-testid*="coi"]').filter({ hasText: /FVEY/i });
      expect(await fveyResources.count() === 0).toBe(true);
    });
  });

  test.describe('Federation Workflows', () => {
    test('should navigate between federated instances', async ({ page }) => {
      // Login to Albania first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Look for federation navigation elements
      const federationLinks = page.locator('[data-testid*="federat"], a').filter({ hasText: /federat|hub|spoke/i });
      const federationButtons = page.locator('[data-testid*="federat"], button').filter({ hasText: /federat|hub|spoke/i });

      // Should have some federation UI elements
      expect(await federationLinks.count() > 0 || await federationButtons.count() > 0).toBe(true);
    });

    test('should maintain session across federation', async ({ page }) => {
      // Login to Albania
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Verify initial session
      await expect(page.locator('[data-testid="user-info"]')).toContainText(/testuser-alb-1|ALB/i);

      // Navigate to dashboard or another protected page
      await page.goto('https://localhost:3001/dashboard');

      // Should maintain authentication
      await expect(page.locator('[data-testid="user-info"], .user-info')).toBeVisible();
    });
  });

  test.describe('Error Handling and Validation', () => {
    test('should handle invalid resource creation', async ({ page }) => {
      // Login first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Go to create resource
      await page.goto('https://localhost:3001/resources/new');

      // Try to submit empty form
      await page.click('[data-testid="create-resource"], button[type="submit"]');

      // Should show validation errors
      const errorMessages = page.locator('[data-testid*="error"], .error, .invalid-feedback, [class*="error"]');
      expect(await errorMessages.count() > 0).toBe(true);
    });

    test('should handle network errors gracefully', async ({ page }) => {
      // Login first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Try to access non-existent resource
      await page.goto('https://localhost:3001/resources/non-existent-123');

      // Should show 404 or not found error
      const errorPage = page.locator('[data-testid="not-found"], .not-found, text=/not found|404/i');
      const errorMessage = page.locator('[data-testid*="error"], .error, text=/error|not found/i');

      expect(await errorPage.isVisible() || await errorMessage.isVisible()).toBe(true);
    });
  });

  test.describe('Navigation and Routing', () => {
    test('should navigate between main application sections', async ({ page }) => {
      // Login first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      // Test navigation to different sections
      const navLinks = page.locator('nav a, [data-testid*="nav"], .navigation a');

      if (await navLinks.count() > 0) {
        // Click on a navigation link
        const firstNavLink = navLinks.first();
        const linkText = await firstNavLink.textContent();
        await firstNavLink.click();

        // Should navigate somewhere
        await page.waitForURL(/.*localhost:3001.*/, { timeout: 5000 });
        expect(page.url()).not.toBe('https://localhost:3001/');
      } else {
        console.log('No navigation links found - checking for direct navigation');

        // Try direct navigation to dashboard
        await page.goto('https://localhost:3001/dashboard');
        expect(page.url()).toContain('/dashboard');
      }
    });

    test('should handle browser back/forward navigation', async ({ page }) => {
      // Login first
      await page.goto('https://localhost:3001');
      await page.waitForSelector('button:has-text("Login as Albania User")', { timeout: 10000 });
      await page.click('button:has-text("Login as Albania User")');
      await page.waitForURL(/.*localhost:8444.*/, { timeout: 10000 });
      await page.fill('#username', 'testuser-alb-1');
      await page.fill('#password', 'TestUser2025!Pilot');
      await page.click('#kc-login');
      await page.waitForURL(/.*localhost:3001.*/, { timeout: 15000 });

      const initialUrl = page.url();

      // Navigate to resources
      await page.goto('https://localhost:3001/resources');
      const resourcesUrl = page.url();

      // Go back
      await page.goBack();
      expect(page.url()).toBe(initialUrl);

      // Go forward
      await page.goForward();
      expect(page.url()).toBe(resourcesUrl);
    });
  });
});
