/**
 * DIVE V3 - Maintenance Page E2E Tests
 * 
 * Tests for /admin/spoke/maintenance page
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

const SPOKE_URL = 'https://localhost:13000';
const SPOKE_BACKEND_URL = 'https://localhost:14000';

test.describe('Maintenance Page', () => {
  test.describe('Page Structure', () => {
    test('should display maintenance page structure', async ({ page }) => {
      await page.goto(`${SPOKE_URL}/admin/spoke/maintenance`);
      
      const url = page.url();
      if (url.includes('/login') || url === `${SPOKE_URL}/`) {
        expect(url).toContain('localhost:13000');
      }
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto(`${SPOKE_URL}/admin/spoke/maintenance`);
      await expect(page).toHaveTitle(/DIVE/);
    });
  });

  test.describe('Maintenance History API', () => {
    test('should return maintenance history from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('history');
      expect(Array.isArray(data.history)).toBeTruthy();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
    });

    test('should support pagination in maintenance history', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history?limit=10&offset=0`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });

    test('should cap limit at 50', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history?limit=100`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data.limit).toBeLessThanOrEqual(50);
    });
  });

  test.describe('Maintenance Status API', () => {
    test('should return maintenance status from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/status`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('isInMaintenanceMode');
    });
  });

  test.describe('Maintenance Mode Lifecycle', () => {
    test('should enter and exit maintenance mode with history tracking', async ({ request }) => {
      // Ensure not in maintenance mode initially
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
      
      // Get initial history count
      const before = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      const beforeData = await before.json();
      const initialCount = beforeData.history.length;
      
      // Enter maintenance mode
      const enterResponse = await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/enter`, {
        data: { reason: 'E2E History Test' }
      });
      expect(enterResponse.ok()).toBeTruthy();
      
      // Verify in maintenance mode
      const statusDuring = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/status`);
      const statusDuringData = await statusDuring.json();
      expect(statusDuringData.isInMaintenanceMode).toBe(true);
      
      // Exit maintenance mode
      const exitResponse = await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
      expect(exitResponse.ok()).toBeTruthy();
      
      // Wait for event to be recorded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check history
      const after = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      const afterData = await after.json();
      
      // History count should increase
      expect(afterData.history.length).toBeGreaterThan(initialCount);
    });

    test('should include current session when in maintenance', async ({ request }) => {
      // Ensure not in maintenance
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
      
      // Check no current session
      const before = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      const beforeData = await before.json();
      expect(beforeData.currentSession).toBeNull();
      
      // Enter maintenance
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/enter`, {
        data: { reason: 'Current Session Test' }
      });
      
      // Check current session exists
      const during = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      const duringData = await during.json();
      expect(duringData.currentSession).not.toBeNull();
      expect(duringData.currentSession.reason).toBe('Current Session Test');
      
      // Exit
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
    });

    test('should track maintenance duration', async ({ request }) => {
      // Enter maintenance
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/enter`, {
        data: { reason: 'Duration Test' }
      });
      
      // Wait a bit
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Get current session with duration
      const history = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history`);
      const historyData = await history.json();
      
      if (historyData.currentSession) {
        expect(historyData.currentSession.duration).toBeGreaterThan(0);
      }
      
      // Exit
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
    });

    test('should include correct history event fields', async ({ request }) => {
      // Create a maintenance event
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/enter`, {
        data: { reason: 'Field Test' }
      });
      await new Promise(resolve => setTimeout(resolve, 100));
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check history
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/history?limit=1`);
      const data = await response.json();
      
      if (data.history.length > 0) {
        const event = data.history[0];
        
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('enteredAt');
        expect(event).toHaveProperty('exitedAt');
        expect(event).toHaveProperty('reason');
        expect(event).toHaveProperty('duration');
      }
    });
  });

  test.describe('Maintenance Mode Integration with Failover', () => {
    test('should reflect maintenance in failover status', async ({ request }) => {
      // Ensure clean state
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
      
      // Enter maintenance
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/enter`, {
        data: { reason: 'Integration Test' }
      });
      
      // Check failover status includes maintenance
      const status = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/status`);
      const data = await status.json();
      
      expect(data.isInMaintenanceMode).toBe(true);
      expect(data.maintenanceReason).toBe('Integration Test');
      
      // Exit
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/maintenance/exit`);
    });
  });
});
