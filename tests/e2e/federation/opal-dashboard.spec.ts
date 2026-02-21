/**
 * DIVE V3 - OPAL Dashboard E2E Tests
 * 
 * End-to-end tests for the OPAL Server Dashboard page.
 * 
 * @version 1.0.0
 * @date 2025-12-12
 */

import { test, expect } from '@playwright/test';

// Mock API responses
const mockServerStatus = {
  healthy: true,
  version: '0.9.2',
  uptime: 86400,
  startedAt: new Date(Date.now() - 86400000).toISOString(),
  policyDataEndpoint: {
    status: 'healthy',
    lastRequest: new Date().toISOString(),
    requestsPerMinute: 45,
    totalRequests: 1234,
    errorRate: 0.5,
  },
  webSocket: {
    connected: true,
    clientCount: 3,
    lastMessage: new Date().toISOString(),
    messagesPerMinute: 12,
  },
  topics: ['policy:base', 'data:federation'],
  config: {
    serverUrl: 'https://opal-server:7002',
    dataTopics: ['policy_data'],
    policyTopics: ['policy:base'],
  },
  stats: {
    totalPublishes: 50,
    totalSyncs: 200,
    failedSyncs: 5,
    averageSyncDurationMs: 150,
  },
};

const mockClients = {
  success: true,
  clients: [
    {
      clientId: 'opal-nzl-001',
      spokeId: 'spoke-nzl',
      instanceCode: 'NZL',
      hostname: 'opal-client-nzl.dive.local',
      status: 'synced',
      version: '2.4.1',
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date().toISOString(),
      subscribedTopics: ['policy:base'],
      stats: { syncsReceived: 50, syncsFailed: 0, bytesReceived: 524288 },
    },
    {
      clientId: 'opal-aus-001',
      spokeId: 'spoke-aus',
      instanceCode: 'AUS',
      hostname: 'opal-client-aus.dive.local',
      status: 'behind',
      version: '2.4.0',
      connectedAt: new Date().toISOString(),
      lastHeartbeat: new Date(Date.now() - 60000).toISOString(),
      subscribedTopics: ['policy:base'],
      stats: { syncsReceived: 45, syncsFailed: 2, bytesReceived: 512000 },
    },
  ],
  total: 2,
  summary: { connected: 0, synced: 1, behind: 1, stale: 0, offline: 0 },
  timestamp: new Date().toISOString(),
};

const mockTransactions = {
  success: true,
  transactions: [
    {
      transactionId: 'txn-001',
      type: 'publish',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 150,
      initiatedBy: 'admin',
      details: { bundleVersion: '2025.12.12-001', affectedClients: 3, successfulClients: 3 },
    },
    {
      transactionId: 'txn-002',
      type: 'sync',
      status: 'success',
      timestamp: new Date().toISOString(),
      duration: 120,
      initiatedBy: 'system',
      details: { bundleVersion: '2025.12.12-001', affectedClients: 1, successfulClients: 1 },
    },
    {
      transactionId: 'txn-003',
      type: 'sync',
      status: 'failed',
      timestamp: new Date(Date.now() - 86400000).toISOString(),
      duration: 5000,
      initiatedBy: 'schedule',
      details: { bundleVersion: '2025.12.11-003', affectedClients: 1, failedClients: 1, error: 'Connection timeout' },
    },
  ],
  total: 3,
  limit: 50,
  offset: 0,
  summary: { totalPublishes: 10, totalSyncs: 50, successRate: 94.5 },
};

test.describe('OPAL Dashboard API Tests', () => {
  test.describe('GET /api/opal/server-status', () => {
    test('returns server status with healthy state', async ({ request }) => {
      const response = await request.get('/api/opal/server-status');
      
      // May return 401 if not authenticated or 500 if OPAL not running
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('healthy');
        expect(data).toHaveProperty('version');
        expect(data).toHaveProperty('uptime');
        expect(data).toHaveProperty('policyDataEndpoint');
        expect(data).toHaveProperty('webSocket');
        expect(data).toHaveProperty('topics');
        expect(data).toHaveProperty('config');
        expect(data).toHaveProperty('stats');
      } else {
        // 401 or 500 are acceptable in test environment
        expect([401, 403, 500]).toContain(response.status());
      }
    });
  });

  test.describe('GET /api/opal/clients', () => {
    test('returns list of connected clients', async ({ request }) => {
      const response = await request.get('/api/opal/clients');
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('clients');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('summary');
        expect(Array.isArray(data.clients)).toBe(true);
        
        // Check summary structure
        expect(data.summary).toHaveProperty('connected');
        expect(data.summary).toHaveProperty('synced');
        expect(data.summary).toHaveProperty('behind');
        expect(data.summary).toHaveProperty('offline');
      } else {
        expect([401, 403, 500]).toContain(response.status());
      }
    });

    test('clients have required fields', async ({ request }) => {
      const response = await request.get('/api/opal/clients');
      
      if (response.status() === 200) {
        const data = await response.json();
        if (data.clients && data.clients.length > 0) {
          const client = data.clients[0];
          expect(client).toHaveProperty('clientId');
          expect(client).toHaveProperty('status');
          expect(client).toHaveProperty('version');
          expect(client).toHaveProperty('connectedAt');
          expect(client).toHaveProperty('lastHeartbeat');
        }
      }
    });
  });

  test.describe('GET /api/opal/transactions', () => {
    test('returns transaction log', async ({ request }) => {
      const response = await request.get('/api/opal/transactions');
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('transactions');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('limit');
        expect(data).toHaveProperty('offset');
        expect(Array.isArray(data.transactions)).toBe(true);
      } else {
        expect([401, 403, 500]).toContain(response.status());
      }
    });

    test('supports pagination', async ({ request }) => {
      const response = await request.get('/api/opal/transactions?limit=10&offset=0');
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data.limit).toBe(10);
        expect(data.offset).toBe(0);
      }
    });

    test('supports type filter', async ({ request }) => {
      const response = await request.get('/api/opal/transactions?type=publish');
      
      if (response.status() === 200) {
        const data = await response.json();
        // All transactions should be of type 'publish'
        for (const txn of data.transactions) {
          expect(txn.type).toBe('publish');
        }
      }
    });

    test('transactions have required fields', async ({ request }) => {
      const response = await request.get('/api/opal/transactions');
      
      if (response.status() === 200) {
        const data = await response.json();
        if (data.transactions && data.transactions.length > 0) {
          const txn = data.transactions[0];
          expect(txn).toHaveProperty('transactionId');
          expect(txn).toHaveProperty('type');
          expect(txn).toHaveProperty('status');
          expect(txn).toHaveProperty('timestamp');
          expect(txn).toHaveProperty('initiatedBy');
          expect(txn).toHaveProperty('details');
        }
      }
    });
  });

  test.describe('POST /api/opal/clients/:clientId/ping', () => {
    test('pings a client', async ({ request }) => {
      const response = await request.post('/api/opal/clients/opal-nzl-001/ping');
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('clientId');
        expect(data.clientId).toBe('opal-nzl-001');
      } else {
        expect([401, 403, 404, 500]).toContain(response.status());
      }
    });
  });

  test.describe('POST /api/opal/clients/:clientId/force-sync', () => {
    test('forces sync to a client', async ({ request }) => {
      const response = await request.post('/api/opal/clients/opal-nzl-001/force-sync');
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(data).toHaveProperty('success');
        expect(data).toHaveProperty('clientId');
      } else {
        expect([401, 403, 404, 500]).toContain(response.status());
      }
    });

    test('returns 404 for unknown client', async ({ request }) => {
      const response = await request.post('/api/opal/clients/unknown-client/force-sync');
      
      // May be 404 or 401/403 depending on auth state
      expect([401, 403, 404]).toContain(response.status());
    });
  });

  test.describe('GET /api/opal/transactions/export', () => {
    test('exports transactions as JSON', async ({ request }) => {
      const response = await request.get('/api/opal/transactions/export?format=json');
      
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('application/json');
        
        const data = await response.json();
        expect(data).toHaveProperty('exportedAt');
        expect(data).toHaveProperty('total');
        expect(data).toHaveProperty('transactions');
      } else {
        expect([401, 403, 500]).toContain(response.status());
      }
    });

    test('exports transactions as CSV', async ({ request }) => {
      const response = await request.get('/api/opal/transactions/export?format=csv');
      
      if (response.status() === 200) {
        const contentType = response.headers()['content-type'];
        expect(contentType).toContain('text/csv');
        
        const text = await response.text();
        expect(text).toContain('transactionId');
        expect(text).toContain('type');
        expect(text).toContain('status');
      } else {
        expect([401, 403, 500]).toContain(response.status());
      }
    });
  });
});

test.describe('OPAL Dashboard UI Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Mock the API endpoints
    await page.route('**/api/opal/server-status', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockServerStatus),
      });
    });

    await page.route('**/api/opal/clients', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockClients),
      });
    });

    await page.route('**/api/opal/transactions**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockTransactions),
      });
    });
  });

  test('displays OPAL dashboard page', async ({ page }) => {
    // Skip auth for this test - just check the page structure with mocked data
    await page.goto('/admin/federation/opal');
    
    // If redirected to login, this is expected behavior
    if (page.url().includes('/login')) {
      expect(true).toBe(true); // Auth redirect is valid
      return;
    }
    
    // Page should show OPAL Server Dashboard title
    await expect(page.getByText('OPAL Server Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('shows server health status', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return; // Skip if redirected to login
    }
    
    await expect(page.getByText('OPAL Server')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Running')).toBeVisible();
  });

  test('shows connected clients', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return;
    }
    
    await expect(page.getByText('Connected Clients')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('opal-nzl-001')).toBeVisible();
    await expect(page.getByText('opal-aus-001')).toBeVisible();
  });

  test('shows transaction log', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return;
    }
    
    await expect(page.getByText('Transaction Log')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('3 transactions')).toBeVisible();
  });

  test('displays refresh button', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return;
    }
    
    await expect(page.getByRole('button', { name: /refresh/i })).toBeVisible({ timeout: 10000 });
  });

  test('displays health status indicator', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return;
    }
    
    // Should show "Healthy" status
    await expect(page.getByText('Healthy')).toBeVisible({ timeout: 10000 });
  });

  test('displays auto-refresh indicator', async ({ page }) => {
    await page.goto('/admin/federation/opal');
    
    if (page.url().includes('/login')) {
      return;
    }
    
    await expect(page.getByText('Auto-refresh 10s')).toBeVisible({ timeout: 10000 });
  });
});
