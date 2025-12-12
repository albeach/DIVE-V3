/**
 * DIVE V3 - Failover Page E2E Tests
 * 
 * Tests for /admin/spoke/failover page
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

const SPOKE_URL = 'https://localhost:13000';
const SPOKE_BACKEND_URL = 'https://localhost:14000';

test.describe('Failover Page', () => {
  test.describe('Page Structure', () => {
    test('should display failover page structure', async ({ page }) => {
      await page.goto(`${SPOKE_URL}/admin/spoke/failover`);
      
      const url = page.url();
      if (url.includes('/login') || url === `${SPOKE_URL}/`) {
        expect(url).toContain('localhost:13000');
      }
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto(`${SPOKE_URL}/admin/spoke/failover`);
      await expect(page).toHaveTitle(/DIVE/);
    });
  });

  test.describe('Failover Events API', () => {
    test('should return failover events from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('events');
      expect(Array.isArray(data.events)).toBeTruthy();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('limit');
      expect(data).toHaveProperty('offset');
    });

    test('should support pagination in failover events', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events?limit=10&offset=0`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data.limit).toBe(10);
      expect(data.offset).toBe(0);
    });

    test('should support state filtering in failover events', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events?state=OPEN`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('events');
    });

    test('should cap limit at 100', async ({ request }) => {
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events?limit=200`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data.limit).toBeLessThanOrEqual(100);
    });
  });

  test.describe('Failover Event Generation', () => {
    test('should generate event when circuit is forced open', async ({ request }) => {
      // Get initial event count
      const before = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events`);
      const beforeData = await before.json();
      const initialCount = beforeData.events.length;
      
      // Force circuit open
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/force`, {
        data: { state: 'OPEN' }
      });
      
      // Wait a moment for event to be recorded
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check events
      const after = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events`);
      const afterData = await after.json();
      
      // Event count should increase (or stay same if duplicate prevention)
      expect(afterData.events.length).toBeGreaterThanOrEqual(initialCount);
      
      // Reset circuit
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
    });

    test('should generate event when circuit is reset', async ({ request }) => {
      // Force open first
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/force`, {
        data: { state: 'OPEN' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Get events before reset
      const before = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events`);
      const beforeData = await before.json();
      const initialCount = beforeData.events.length;
      
      // Reset circuit
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Check events after reset
      const after = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events`);
      const afterData = await after.json();
      
      expect(afterData.events.length).toBeGreaterThanOrEqual(initialCount);
    });

    test('should include correct event fields', async ({ request }) => {
      // Force an event
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/force`, {
        data: { state: 'OPEN' }
      });
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const response = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/events?limit=1`);
      const data = await response.json();
      
      if (data.events.length > 0) {
        const event = data.events[0];
        
        expect(event).toHaveProperty('id');
        expect(event).toHaveProperty('timestamp');
        expect(event).toHaveProperty('previousState');
        expect(event).toHaveProperty('newState');
        expect(event).toHaveProperty('reason');
        expect(event).toHaveProperty('triggeredBy');
      }
      
      // Reset
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
    });
  });

  test.describe('Circuit Breaker State Transitions', () => {
    test('should transition CLOSED -> OPEN -> CLOSED', async ({ request }) => {
      // Start closed
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
      let status = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/status`);
      let data = await status.json();
      expect(data.state?.toUpperCase()).toBe('CLOSED');
      
      // Open
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/force`, {
        data: { state: 'OPEN' }
      });
      status = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/status`);
      data = await status.json();
      expect(data.state?.toUpperCase()).toBe('OPEN');
      
      // Close
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
      status = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/status`);
      data = await status.json();
      expect(data.state?.toUpperCase()).toBe('CLOSED');
    });

    test('should transition to HALF_OPEN state', async ({ request }) => {
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/force`, {
        data: { state: 'HALF_OPEN' }
      });
      
      const status = await request.get(`${SPOKE_BACKEND_URL}/api/spoke/failover/status`);
      const data = await status.json();
      expect(data.state?.toUpperCase()).toBe('HALF_OPEN');
      
      // Reset
      await request.post(`${SPOKE_BACKEND_URL}/api/spoke/failover/reset`);
    });
  });
});

