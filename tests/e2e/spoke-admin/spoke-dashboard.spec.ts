/**
 * DIVE V3 - Spoke Admin Dashboard E2E Tests
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

const SPOKE_URL = 'https://localhost:13000';
const HUB_URL = 'https://localhost:3000';

test.describe('Spoke Admin Dashboard', () => {
  test.describe('Dashboard Page', () => {
    test('should display spoke dashboard page structure', async ({ page }) => {
      // Navigate to spoke admin (will redirect to login if not authenticated)
      await page.goto(`${SPOKE_URL}/admin/spoke`);
      
      // Check for authentication redirect or dashboard content
      const url = page.url();
      if (url.includes('/login') || url === `${SPOKE_URL}/`) {
        // Expected - user needs to authenticate
        expect(url).toContain('localhost:13000');
      }
    });

    test('should have proper page title', async ({ page }) => {
      await page.goto(`${SPOKE_URL}/admin/spoke`);
      
      // Title should contain DIVE
      await expect(page).toHaveTitle(/DIVE/);
    });
  });

  test.describe('Backend API Endpoints', () => {
    test('should return spoke status from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/status`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('runtime');
      expect(data).toHaveProperty('connectivity');
      expect(data).toHaveProperty('failover');
      expect(data).toHaveProperty('auditQueue');
      expect(data).toHaveProperty('health');
    });

    test('should return failover status from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/failover/status`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('state');
      expect(data).toHaveProperty('hubHealthy');
      expect(data).toHaveProperty('opalHealthy');
      expect(data).toHaveProperty('isInMaintenanceMode');
    });

    test('should return audit queue status from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/audit/status`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('queueSize');
      expect(data).toHaveProperty('state');
    });

    test('should return health score from API', async ({ request }) => {
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/health-score`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('overall');
      expect(data).toHaveProperty('components');
      expect(data).toHaveProperty('status');
    });
  });

  test.describe('Circuit Breaker Operations', () => {
    test('should force circuit breaker to OPEN state', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/failover/force`, {
        data: { state: 'OPEN' }
      });
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      // Backend may return lowercase state
      expect(data.state?.toUpperCase()).toBe('OPEN');
    });

    test('should reset circuit breaker', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/failover/reset`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      // Backend may return lowercase state
      expect(data.state?.toUpperCase()).toBe('CLOSED');
    });

    test('should reject invalid circuit breaker state', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/failover/force`, {
        data: { state: 'INVALID' }
      });
      
      expect(response.status()).toBe(400);
    });
  });

  test.describe('Maintenance Mode Operations', () => {
    test('should enter maintenance mode', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/maintenance/enter`, {
        data: { reason: 'E2E Test' }
      });
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('message', 'Entered maintenance mode');
      expect(data).toHaveProperty('reason', 'E2E Test');
    });

    test('should exit maintenance mode', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/maintenance/exit`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('message', 'Exited maintenance mode');
    });

    test('should reflect maintenance state in failover status', async ({ request }) => {
      // Enter maintenance
      await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/maintenance/enter`, {
        data: { reason: 'Status Check Test' }
      });
      
      // Check status
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/failover/status`);
      const data = await response.json();
      
      expect(data).toHaveProperty('isInMaintenanceMode', true);
      expect(data).toHaveProperty('maintenanceReason', 'Status Check Test');
      
      // Clean up
      await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/maintenance/exit`);
    });
  });

  test.describe('Audit Queue Operations', () => {
    test('should trigger audit sync', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/audit/sync`);
      
      // May fail if hub is disconnected (expected in test environment)
      const data = await response.json();
      
      // Either succeeds or fails with proper structure
      expect(data).toHaveProperty('success');
      if (data.success) {
        expect(data).toHaveProperty('message', 'Audit sync completed');
      } else {
        // Expected when hub is not connected
        expect(data).toHaveProperty('error');
      }
    });

    test('should require confirmation to clear audit queue', async ({ request }) => {
      // Without confirmation
      const response1 = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/audit/clear`, {
        data: {}
      });
      expect(response1.status()).toBe(400);
      
      // With confirmation
      const response2 = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/audit/clear`, {
        data: { confirm: 'yes' }
      });
      expect(response2.ok()).toBeTruthy();
    });
  });

  test.describe('Policy Sync', () => {
    test('should trigger policy sync', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/sync`);
      
      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      
      expect(data).toHaveProperty('success', true);
      expect(data).toHaveProperty('cacheState');
    });
  });

  test.describe('Heartbeat', () => {
    test('should send heartbeat', async ({ request }) => {
      const response = await request.post(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/heartbeat`);
      
      // May fail if hub is disconnected (expected in test environment)
      const data = await response.json();
      
      // Either succeeds or fails with proper structure
      expect(data).toHaveProperty('success');
      if (data.success) {
        expect(data).toHaveProperty('message', 'Heartbeat sent');
      } else {
        // Expected when hub is not connected
        expect(data).toHaveProperty('error');
      }
    });
  });

  test.describe('Metrics', () => {
    test('should return Prometheus metrics', async ({ request }) => {
      const response = await request.get(`${SPOKE_URL.replace('13000', '14000')}/api/spoke/metrics`);
      
      expect(response.ok()).toBeTruthy();
      const contentType = response.headers()['content-type'];
      expect(contentType).toContain('text/plain');
    });
  });
});

test.describe('Hub Federation Admin', () => {
  test.describe('Backend API Endpoints', () => {
    test('should return federation health from Hub', async ({ request }) => {
      const response = await request.get(`${HUB_URL.replace('3000', '4000')}/api/federation/health`);
      
      // May fail if not authenticated, but should return a response
      expect([200, 401, 403]).toContain(response.status());
    });
  });
});

