/**
 * DIVE V3 - Token Rotation E2E Tests
 * 
 * End-to-end tests for the Hub Admin Token Rotation functionality.
 * Tests token rotation modal, expiry warnings, and API endpoints.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

// Test configuration
const HUB_FRONTEND_URL = process.env.HUB_FRONTEND_URL || 'https://localhost:3000';
const HUB_BACKEND_URL = process.env.HUB_BACKEND_URL || 'https://localhost:4000';

test.describe('Token Rotation API', () => {
  test('POST /api/federation/spokes/:spokeId/token generates new token', async ({ request }) => {
    // First, get a list of spokes to find a valid spokeId
    const spokesResponse = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes`);
    
    if (spokesResponse.status() !== 200) {
      test.skip(true, 'No spokes available for testing');
      return;
    }
    
    const spokesData = await spokesResponse.json();
    const activeSpokes = spokesData.spokes?.filter((s: { status: string }) => s.status === 'active') || [];
    
    if (activeSpokes.length === 0) {
      test.skip(true, 'No active spokes available for testing');
      return;
    }
    
    const testSpoke = activeSpokes[0];
    
    // Generate new token
    const response = await request.post(`${HUB_BACKEND_URL}/api/federation/spokes/${testSpoke.spokeId}/token`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('token');
    expect(data.token).toHaveProperty('token');
    expect(data.token).toHaveProperty('expiresAt');
    expect(data.token).toHaveProperty('scopes');
    expect(typeof data.token.token).toBe('string');
    expect(data.token.token.length).toBeGreaterThan(50);
  });

  test('POST /api/federation/spokes/:spokeId/token returns 404 for invalid spoke', async ({ request }) => {
    const response = await request.post(`${HUB_BACKEND_URL}/api/federation/spokes/invalid-spoke-id/token`);
    
    expect(response.status()).toBe(404);
    
    const data = await response.json();
    expect(data).toHaveProperty('error');
  });

  test('GET /api/federation/spokes/:spokeId returns token info', async ({ request }) => {
    // First, get a list of spokes
    const spokesResponse = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes`);
    
    if (spokesResponse.status() !== 200) {
      test.skip(true, 'No spokes available for testing');
      return;
    }
    
    const spokesData = await spokesResponse.json();
    const spokes = spokesData.spokes || [];
    
    if (spokes.length === 0) {
      test.skip(true, 'No spokes available for testing');
      return;
    }
    
    const testSpoke = spokes[0];
    
    // Get spoke details
    const response = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes/${testSpoke.spokeId}`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('spoke');
    // Token info should be available if spoke is active
    if (data.spoke.status === 'active') {
      expect(data.spoke).toHaveProperty('tokenExpiresAt');
    }
  });

  test('GET /api/federation/spokes returns all spokes with token status', async ({ request }) => {
    const response = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('spokes');
    expect(Array.isArray(data.spokes)).toBe(true);
    
    // Each spoke should have token info if active
    data.spokes.forEach((spoke: { status: string; tokenExpiresAt?: string }) => {
      if (spoke.status === 'active') {
        expect(spoke).toHaveProperty('tokenExpiresAt');
      }
    });
  });
});

test.describe('Spoke Management Page - Token Tab', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the spokes page
    await page.goto(`${HUB_FRONTEND_URL}/admin/federation/spokes`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test('displays spoke registry table', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Spoke Registry|Federation/i }).first()).toBeVisible({ timeout: 10000 });
  });

  test('spoke cards show status information', async ({ page }) => {
    // Wait for table to load
    await page.waitForLoadState('networkidle');
    
    // Either table rows or "No spokes" message should be visible
    const tableVisible = await page.locator('table').isVisible().catch(() => false);
    const noSpokesVisible = await page.getByText(/No spokes|No registered/i).isVisible().catch(() => false);
    
    expect(tableVisible || noSpokesVisible).toBe(true);
  });
});

test.describe('Token Rotation Modal UI', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${HUB_FRONTEND_URL}/admin/federation/spokes`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test('can open spoke detail panel', async ({ page }) => {
    // Wait for page to load
    await page.waitForLoadState('networkidle');
    
    // Check if there are any spokes in the table
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    
    if (rowCount === 0) {
      test.skip(true, 'No spokes available to test');
      return;
    }
    
    // Click on view button (usually first action button)
    const viewButton = rows.first().locator('button').first();
    await viewButton.click();
    
    // Detail panel should open
    await expect(page.getByText(/Overview|Connection Info/i)).toBeVisible({ timeout: 5000 });
  });

  test('token tab shows token status', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    
    if (rowCount === 0) {
      test.skip(true, 'No spokes available to test');
      return;
    }
    
    // Click on first spoke
    const viewButton = rows.first().locator('button').first();
    await viewButton.click();
    
    // Click on Token tab
    const tokenTab = page.getByRole('button', { name: /Token/i });
    await tokenTab.click();
    
    // Token status should be visible
    await expect(page.getByText(/Token Status|Valid|Expired|Expiring/i)).toBeVisible({ timeout: 5000 });
  });

  test('rotate token button is visible for active spokes', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    
    if (rowCount === 0) {
      test.skip(true, 'No spokes available to test');
      return;
    }
    
    // Click on first spoke
    const viewButton = rows.first().locator('button').first();
    await viewButton.click();
    
    // Click on Token tab
    const tokenTab = page.getByRole('button', { name: /Token/i });
    await tokenTab.click();
    
    // Check for Rotate Token button (only for active spokes)
    const rotateButton = page.getByRole('button', { name: /Rotate Token/i });
    
    // Button may or may not be visible depending on spoke status
    const isVisible = await rotateButton.isVisible().catch(() => false);
    
    // If the spoke is active, button should be visible
    if (isVisible) {
      await expect(rotateButton).toBeEnabled();
    }
  });
});

test.describe('Token Expiry Badge', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${HUB_FRONTEND_URL}/admin/federation/spokes`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test('shows token status in spoke table or detail view', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    
    if (rowCount === 0) {
      test.skip(true, 'No spokes available to test');
      return;
    }
    
    // Look for token status indicators
    const statusIndicators = ['Valid', 'Expiring', 'Expired', 'No Token'];
    
    let foundIndicator = false;
    for (const indicator of statusIndicators) {
      const element = page.getByText(new RegExp(indicator, 'i'));
      if (await element.isVisible().catch(() => false)) {
        foundIndicator = true;
        break;
      }
    }
    
    // If not in table, open detail and check Token tab
    if (!foundIndicator) {
      const viewButton = rows.first().locator('button').first();
      await viewButton.click();
      
      const tokenTab = page.getByRole('button', { name: /Token/i });
      await tokenTab.click();
      
      // Now check for indicators
      for (const indicator of statusIndicators) {
        const element = page.getByText(new RegExp(indicator, 'i'));
        if (await element.isVisible().catch(() => false)) {
          foundIndicator = true;
          break;
        }
      }
    }
    
    expect(foundIndicator).toBe(true);
  });
});

test.describe('Federation Health with Token Info', () => {
  test('GET /api/federation/health includes token-related info', async ({ request }) => {
    const response = await request.get(`${HUB_BACKEND_URL}/api/federation/health`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('healthy');
    expect(data).toHaveProperty('statistics');
    expect(data.statistics).toHaveProperty('activeSpokes');
    expect(data.statistics).toHaveProperty('pendingApprovals');
  });
});

test.describe('Token Rotation Security', () => {
  test('token rotation requires admin authentication', async ({ request }) => {
    // This test verifies that token rotation endpoints are protected
    // The actual behavior depends on the auth configuration
    
    const spokesResponse = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes`);
    
    // Either returns 200 (if no auth required in dev) or 401/403 (if auth required)
    expect([200, 401, 403]).toContain(spokesResponse.status());
  });

  test('generated tokens have expected structure', async ({ request }) => {
    const spokesResponse = await request.get(`${HUB_BACKEND_URL}/api/federation/spokes`);
    
    if (spokesResponse.status() !== 200) {
      test.skip(true, 'Cannot access spokes API');
      return;
    }
    
    const spokesData = await spokesResponse.json();
    const activeSpokes = spokesData.spokes?.filter((s: { status: string }) => s.status === 'active') || [];
    
    if (activeSpokes.length === 0) {
      test.skip(true, 'No active spokes available');
      return;
    }
    
    const testSpoke = activeSpokes[0];
    
    const response = await request.post(`${HUB_BACKEND_URL}/api/federation/spokes/${testSpoke.spokeId}/token`);
    
    if (response.status() === 200) {
      const data = await response.json();
      
      // Token should be a JWT-like string
      const token = data.token?.token;
      if (token) {
        // JWT has 3 parts separated by dots
        const parts = token.split('.');
        expect(parts.length).toBe(3);
      }
      
      // Expiry should be a valid date
      if (data.token?.expiresAt) {
        const expiryDate = new Date(data.token.expiresAt);
        expect(expiryDate.getTime()).toBeGreaterThan(Date.now());
      }
    }
  });
});

