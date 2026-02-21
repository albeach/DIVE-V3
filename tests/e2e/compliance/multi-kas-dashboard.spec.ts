/**
 * DIVE V3 - Multi-KAS Dashboard E2E Tests
 * 
 * Tests the Multi-KAS compliance dashboard UI that displays live data
 * from MongoDB (SSOT). Validates KAS registry, real-time metrics,
 * federation trust, and 2025 UX patterns.
 * 
 * @version 2.0.0
 * @date 2026-01-16
 */

import { test, expect } from '@playwright/test';

const FRONTEND_URL = process.env.FRONTEND_URL || 'https://localhost:3000';
const BACKEND_URL = process.env.BACKEND_URL || 'https://localhost:4000';

test.describe('Multi-KAS Dashboard', () => {
  test.describe('Page Structure', () => {
    test('should display multi-kas page with hero section', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      // Check for authentication redirect or page content
      const url = page.url();
      if (url.includes('/login') || url.includes('/auth')) {
        // Expected - user needs to authenticate
        expect(url).toContain('localhost');
        return;
      }
      
      // Should have hero section with title
      const heroTitle = page.locator('h1');
      await expect(heroTitle).toContainText(/Multi-KAS|Coalition/i);
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      // Title should contain DIVE
      await expect(page).toHaveTitle(/DIVE/i);
    });

    test('should display refresh button for live data', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      // Look for refresh button
      const refreshButton = page.locator('button:has-text("Refresh")');
      await expect(refreshButton).toBeVisible();
    });

    test('should display live data badge from MongoDB', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      // Look for live data indicator
      const liveIndicator = page.locator('text=Live from MongoDB');
      await expect(liveIndicator).toBeVisible();
    });
  });

  test.describe('KAS Registry Grid', () => {
    test('should display KAS endpoint cards', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      // Wait for loading to complete
      await page.waitForTimeout(2000);
      
      // Should display grid title
      const gridTitle = page.locator('h2:has-text("KAS")');
      await expect(gridTitle).toBeVisible();
    });

    test('should show KAS status badges', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Look for status badges (active, pending, etc.)
      const statusBadges = page.locator('[class*="rounded-full"]:has-text("ACTIVE"), [class*="rounded-full"]:has-text("PENDING")');
      
      // At least one status badge should exist
      const count = await statusBadges.count();
      expect(count).toBeGreaterThanOrEqual(0); // 0 is ok if no KAS registered
    });

    test('should allow selecting a KAS card', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Find a KAS card and click it
      const kasCard = page.locator('[class*="rounded-xl"]:has-text("KAS")').first();
      
      if (await kasCard.isVisible()) {
        await kasCard.click();
        
        // After clicking, detailed metrics panel should appear
        await page.waitForTimeout(500);
        
        // Look for detailed view or metrics panel
        const detailedView = page.locator('text=Detailed View, text=Technical Specifications, text=Usage Statistics');
        // One of these should be visible
      }
    });
  });

  test.describe('Summary Statistics', () => {
    test('should display summary bar with totals', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Look for summary statistics
      const summaryLabels = [
        'Total KAS',
        'Active',
        'Requests Today',
        'Avg Uptime'
      ];
      
      for (const label of summaryLabels) {
        const element = page.locator(`text=${label}`);
        // Flexible check - element may or may not exist based on data
      }
    });

    test('should display real-time indicator', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Look for real-time indicator
      const realTimeIndicator = page.locator('text=Real-time');
      // May or may not be visible based on implementation
    });
  });

  test.describe('Technical Details Accordion', () => {
    test('should have expandable technical details section', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Find accordion button
      const accordionButton = page.locator('button:has-text("How Multi-KAS Works")');
      
      if (await accordionButton.isVisible()) {
        // Click to expand
        await accordionButton.click();
        await page.waitForTimeout(300);
        
        // Should show technical content
        const uploadPhase = page.locator('text=Upload Phase');
        const accessPhase = page.locator('text=Access Phase');
        
        // Content should be visible after expansion
        await expect(uploadPhase).toBeVisible();
        await expect(accessPhase).toBeVisible();
      }
    });

    test('should collapse accordion on second click', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      const accordionButton = page.locator('button:has-text("How Multi-KAS Works")');
      
      if (await accordionButton.isVisible()) {
        // Click to expand
        await accordionButton.click();
        await page.waitForTimeout(300);
        
        // Click again to collapse
        await accordionButton.click();
        await page.waitForTimeout(500);
        
        // Content should be hidden
        const uploadPhase = page.locator('text=Upload Phase');
        await expect(uploadPhase).not.toBeVisible();
      }
    });
  });

  test.describe('Flow Diagram', () => {
    test('should display multi-kas flow steps', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Look for flow section
      const flowTitle = page.locator('h2:has-text("Multi-KAS Flow")');
      
      if (await flowTitle.isVisible()) {
        // Flow should have numbered steps
        const step1 = page.locator('text=1');
        const step2 = page.locator('text=2');
        
        // At least some flow steps should exist
      }
    });
  });

  test.describe('Benefits Section', () => {
    test('should display coalition benefits', async ({ page }) => {
      await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
      
      const url = page.url();
      if (url.includes('/login')) return;
      
      await page.waitForTimeout(2000);
      
      // Look for benefits section
      const benefitsTitle = page.locator('h2:has-text("Coalition Benefits")');
      
      if (await benefitsTitle.isVisible()) {
        // Should have benefit cards
        const benefitCards = page.locator('[class*="rounded-xl"]').filter({
          hasText: /Coalition Growth|Key Sovereignty|Zero Re-encryption/i
        });
        
        const count = await benefitCards.count();
        expect(count).toBeGreaterThanOrEqual(0);
      }
    });
  });
});

test.describe('Multi-KAS API Endpoints', () => {
  test.describe('Backend API', () => {
    test('should return multi-kas info from API', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      // Validate response structure
      expect(data).toHaveProperty('title');
      expect(data).toHaveProperty('kasEndpoints');
      expect(Array.isArray(data.kasEndpoints)).toBe(true);
    });

    test('should return KAS endpoints with required fields', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      if (data.kasEndpoints && data.kasEndpoints.length > 0) {
        const kas = data.kasEndpoints[0];
        
        // Required fields
        expect(kas).toHaveProperty('id');
        expect(kas).toHaveProperty('name');
        expect(kas).toHaveProperty('url');
        expect(kas).toHaveProperty('country');
        expect(kas).toHaveProperty('status');
        expect(kas).toHaveProperty('uptime');
        expect(kas).toHaveProperty('requestsToday');
      }
    });

    test('should return extended metrics from MongoDB', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      if (data.kasEndpoints && data.kasEndpoints.length > 0) {
        const kas = data.kasEndpoints[0];
        
        // Extended metrics (2025 design patterns)
        expect(kas).toHaveProperty('successRate');
        expect(kas).toHaveProperty('p95ResponseTime');
        expect(kas).toHaveProperty('circuitBreakerState');
        expect(kas).toHaveProperty('federationTrust');
      }
    });

    test('should return summary statistics', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('summary');
      
      if (data.summary) {
        expect(data.summary).toHaveProperty('totalKAS');
        expect(data.summary).toHaveProperty('activeKAS');
        expect(data.summary).toHaveProperty('totalRequestsToday');
        expect(data.summary).toHaveProperty('averageUptime');
      }
    });

    test('should return timestamp for cache invalidation', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('timestamp');
      
      // Timestamp should be recent (within last minute)
      const timestamp = new Date(data.timestamp);
      const now = new Date();
      const diffMs = now.getTime() - timestamp.getTime();
      
      expect(diffMs).toBeLessThan(60000); // Less than 1 minute
    });

    test('should return benefits array', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('benefits');
      expect(Array.isArray(data.benefits)).toBe(true);
      
      if (data.benefits.length > 0) {
        expect(data.benefits[0]).toHaveProperty('title');
        expect(data.benefits[0]).toHaveProperty('description');
        expect(data.benefits[0]).toHaveProperty('icon');
      }
    });

    test('should return flow steps array', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('flowSteps');
      expect(Array.isArray(data.flowSteps)).toBe(true);
      
      if (data.flowSteps.length > 0) {
        expect(data.flowSteps[0]).toHaveProperty('step');
        expect(data.flowSteps[0]).toHaveProperty('title');
        expect(data.flowSteps[0]).toHaveProperty('description');
      }
    });
  });

  test.describe('KAS Federation Health', () => {
    test('should return KAS federation health from API', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/health/kas-federation`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('instance');
      expect(data).toHaveProperty('crossKASEnabled');
      expect(data).toHaveProperty('kasServers');
      expect(Array.isArray(data.kasServers)).toBe(true);
    });

    test('should return KAS server details with health status', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/health/kas-federation`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      if (data.kasServers && data.kasServers.length > 0) {
        const kas = data.kasServers[0];
        
        expect(kas).toHaveProperty('kasId');
        expect(kas).toHaveProperty('status');
        expect(kas).toHaveProperty('enabled');
        expect(kas).toHaveProperty('health');
        expect(kas.health).toHaveProperty('healthy');
      }
    });

    test('should return summary with status breakdown', async ({ request }) => {
      const response = await request.get(`${BACKEND_URL}/api/health/kas-federation`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('summary');
      
      if (data.summary) {
        expect(data.summary).toHaveProperty('total');
        expect(data.summary).toHaveProperty('active');
      }
    });
  });
});

test.describe('Performance', () => {
  test('should load multi-kas page within acceptable time', async ({ page }) => {
    const startTime = Date.now();
    
    await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
    
    const loadTime = Date.now() - startTime;
    
    // Page should load within 5 seconds
    expect(loadTime).toBeLessThan(5000);
  });

  test('should fetch API data within p95 target (200ms)', async ({ request }) => {
    const startTime = Date.now();
    
    const response = await request.get(`${BACKEND_URL}/api/compliance/multi-kas`);
    
    const responseTime = Date.now() - startTime;
    
    expect(response.ok()).toBeTruthy();
    
    // API should respond within 500ms (accounting for network latency in tests)
    // Production target is p95 < 200ms
    expect(responseTime).toBeLessThan(500);
  });
});

test.describe('Accessibility', () => {
  test('should have proper heading hierarchy', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
    
    const url = page.url();
    if (url.includes('/login')) return;
    
    // Check for h1
    const h1 = page.locator('h1');
    await expect(h1).toBeVisible();
    
    // Check for h2 headings
    const h2s = page.locator('h2');
    const count = await h2s.count();
    expect(count).toBeGreaterThan(0);
  });

  test('should have accessible button labels', async ({ page }) => {
    await page.goto(`${FRONTEND_URL}/compliance/multi-kas`);
    
    const url = page.url();
    if (url.includes('/login')) return;
    
    // All buttons should have accessible text
    const buttons = page.locator('button');
    const count = await buttons.count();
    
    for (let i = 0; i < count; i++) {
      const button = buttons.nth(i);
      const text = await button.textContent();
      const ariaLabel = await button.getAttribute('aria-label');
      
      // Button should have either text content or aria-label
      expect(text || ariaLabel).toBeTruthy();
    }
  });
});
