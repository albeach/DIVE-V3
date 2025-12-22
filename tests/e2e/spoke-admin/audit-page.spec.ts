/**
 * DIVE V3 - Audit Queue Page E2E Tests
 * 
 * End-to-end tests for the Spoke Admin Audit Queue Management page.
 * Tests audit queue status, sync operations, and event history.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

// Test configuration
const SPOKE_FRONTEND_URL = process.env.SPOKE_FRONTEND_URL || 'https://localhost:13000';
const SPOKE_BACKEND_URL = process.env.SPOKE_BACKEND_URL || 'https://localhost:14000';

test.describe('Audit Queue Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to the audit page
    await page.goto(`${SPOKE_FRONTEND_URL}/admin/spoke/audit`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test.describe('Page Layout', () => {
    test('displays page header with title', async ({ page }) => {
      await expect(page.getByRole('heading', { name: /Audit Queue Management/i })).toBeVisible();
    });

    test('shows back navigation link', async ({ page }) => {
      const backLink = page.getByRole('link', { name: '' }).first();
      await expect(backLink).toBeVisible();
    });

    test('displays refresh button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Refresh/i })).toBeVisible();
    });

    test('shows auto-refresh indicator', async ({ page }) => {
      await expect(page.getByText(/Auto-refreshing/i)).toBeVisible();
    });
  });

  test.describe('Queue Status Widget', () => {
    test('displays queue status card', async ({ page }) => {
      await expect(page.getByText('Audit Queue')).toBeVisible();
    });

    test('shows queue size', async ({ page }) => {
      // Queue size is displayed as a large number
      const queueWidget = page.locator('text=Events Pending').first();
      await expect(queueWidget).toBeVisible();
    });

    test('shows sync now button', async ({ page }) => {
      await expect(page.getByRole('button', { name: /Sync Now/i }).first()).toBeVisible();
    });

    test('shows last sync information', async ({ page }) => {
      await expect(page.getByText(/Last Sync/i).first()).toBeVisible();
    });
  });

  test.describe('Sync Controls', () => {
    test('displays sync controls card', async ({ page }) => {
      await expect(page.getByText('Sync Controls')).toBeVisible();
    });

    test('shows last success time', async ({ page }) => {
      await expect(page.getByText('Last Success')).toBeVisible();
    });

    test('shows last attempt time', async ({ page }) => {
      await expect(page.getByText('Last Attempt')).toBeVisible();
    });
  });

  test.describe('Event History', () => {
    test('displays sync history card', async ({ page }) => {
      await expect(page.getByText('Sync History')).toBeVisible();
    });

    test('shows event count', async ({ page }) => {
      await expect(page.getByText(/\d+ events?/i).first()).toBeVisible();
    });

    test('shows filter dropdown', async ({ page }) => {
      await expect(page.getByRole('button', { name: /All|Filter/i }).first()).toBeVisible();
    });

    test('opens filter dropdown on click', async ({ page }) => {
      const filterButton = page.getByRole('button', { name: /All/i }).first();
      await filterButton.click();
      
      await expect(page.getByText('Success')).toBeVisible();
      await expect(page.getByText('Failed')).toBeVisible();
    });
  });

  test.describe('Summary Statistics', () => {
    test('displays total syncs stat', async ({ page }) => {
      await expect(page.getByText('Total Syncs')).toBeVisible();
    });

    test('displays successful syncs stat', async ({ page }) => {
      await expect(page.getByText('Successful')).toBeVisible();
    });

    test('displays failed syncs stat', async ({ page }) => {
      await expect(page.getByText('Failed')).toBeVisible();
    });

    test('displays events processed stat', async ({ page }) => {
      await expect(page.getByText('Events Processed')).toBeVisible();
    });
  });
});

test.describe('Audit Queue API Endpoints', () => {
  test('GET /api/spoke/audit/status returns queue status', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/status`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('queueSize');
    expect(typeof data.queueSize).toBe('number');
  });

  test('GET /api/spoke/audit/history returns event history', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/history`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    expect(data).toHaveProperty('events');
    expect(Array.isArray(data.events)).toBe(true);
    expect(data).toHaveProperty('total');
    expect(data).toHaveProperty('summary');
  });

  test('GET /api/spoke/audit/history supports pagination', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/history?limit=10&offset=0`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('limit', 10);
    expect(data).toHaveProperty('offset', 0);
  });

  test('GET /api/spoke/audit/history supports type filtering', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/history?type=sync_success`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success', true);
    // All events should be sync_success type if filter is applied
    data.events.forEach((event: { type: string }) => {
      expect(event.type).toBe('sync_success');
    });
  });

  test('POST /api/spoke/audit/sync triggers sync operation', async ({ request }) => {
    const response = await request.post(`${SPOKE_BACKEND_URL}/api/spoke/audit/sync`);
    
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data).toHaveProperty('success');
    expect(data).toHaveProperty('message');
  });

  test('POST /api/spoke/audit/clear requires confirmation', async ({ request }) => {
    // Without confirmation
    const response1 = await request.post(`${SPOKE_BACKEND_URL}/api/spoke/audit/clear`, {
      data: {},
    });
    
    expect(response1.status()).toBe(400);
    
    const data1 = await response1.json();
    expect(data1).toHaveProperty('error');
    expect(data1.error).toContain('confirm');
  });

  test('GET /api/spoke/audit/export returns JSON export', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/export?format=json`);
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('application/json');
    
    const data = await response.json();
    expect(data).toHaveProperty('exportedAt');
    expect(data).toHaveProperty('history');
  });

  test('GET /api/spoke/audit/export returns CSV export', async ({ request }) => {
    const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/audit/export?format=csv`);
    
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toContain('text/csv');
    
    const text = await response.text();
    // CSV should have headers
    expect(text).toContain('id,timestamp,type');
  });
});

test.describe('Audit Page Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SPOKE_FRONTEND_URL}/admin/spoke/audit`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test('refresh button updates data', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /Refresh/i });
    
    // Click refresh
    await refreshButton.click();
    
    // Button should show loading state briefly
    // Then return to normal state
    await expect(refreshButton).toBeEnabled({ timeout: 5000 });
  });

  test('filter changes displayed events', async ({ page }) => {
    // Open filter dropdown
    const filterButton = page.getByRole('button', { name: /All/i }).first();
    await filterButton.click();
    
    // Select "Success" filter
    await page.getByText('Success').click();
    
    // Filter button should now show "Success"
    await expect(page.getByRole('button', { name: /Success/i }).first()).toBeVisible();
  });

  test('navigate back to spoke dashboard', async ({ page }) => {
    // Click back arrow
    const backLink = page.locator('a[href="/admin/spoke"]').first();
    await backLink.click();
    
    // Should navigate to spoke dashboard
    await expect(page).toHaveURL(/\/admin\/spoke$/);
  });
});

test.describe('Audit Page Status Indicators', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${SPOKE_FRONTEND_URL}/admin/spoke/audit`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });
  });

  test('shows success banner when queue is empty', async ({ page }) => {
    // This test checks for the success state when queue is empty
    // May not always be present depending on queue state
    const successBanner = page.getByText('Audit queue is empty');
    
    // Either the banner is visible, or there are pending events
    const bannerVisible = await successBanner.isVisible().catch(() => false);
    const eventsVisible = await page.getByText(/events? pending/i).isVisible().catch(() => false);
    
    expect(bannerVisible || eventsVisible).toBe(true);
  });

  test('displays queue state indicator', async ({ page }) => {
    // Queue state should be visible (idle, syncing, error, or blocked)
    const stateIndicators = ['idle', 'syncing', 'error', 'blocked'];
    
    let stateFound = false;
    for (const state of stateIndicators) {
      const indicator = page.getByText(new RegExp(state, 'i'));
      if (await indicator.isVisible().catch(() => false)) {
        stateFound = true;
        break;
      }
    }
    
    // If no explicit state, check for Queue State label
    if (!stateFound) {
      await expect(page.getByText('Queue State')).toBeVisible();
    }
  });
});

test.describe('Error Handling', () => {
  test('handles API errors gracefully', async ({ page }) => {
    // Mock a failed API response
    await page.route('**/api/spoke/audit/status', (route) => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto(`${SPOKE_FRONTEND_URL}/admin/spoke/audit`, {
      waitUntil: 'networkidle',
      timeout: 30000,
    });

    // Page should still render with error state
    await expect(page.getByRole('heading', { name: /Audit Queue Management/i })).toBeVisible();
  });
});

